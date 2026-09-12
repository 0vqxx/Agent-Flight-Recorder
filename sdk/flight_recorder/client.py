import atexit
import json
import logging
import os
import queue
import sys
import threading
import time
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional

logger = logging.getLogger("agent_flight_recorder")

class FlightRecorderClient:
    """
    Thread-safe, non-blocking telemetry client with a daemon worker queue.
    Batches payloads by size (default 50) and time (default 2,000ms).
    """

    def __init__(
        self,
        api_key: str,
        project_id: str,
        endpoint: str = "http://localhost:8000",
        batch_size: int = 50,
        flush_interval_seconds: float = 2.0,
        max_queue_size: int = 10000,
        timeout: float = 5.0,
    ):
        self.api_key = api_key
        self.project_id = project_id
        self.endpoint = endpoint.rstrip("/")
        self.batch_size = batch_size
        self.flush_interval = flush_interval_seconds
        self.timeout = timeout

        self._queue: queue.Queue = queue.Queue(maxsize=max_queue_size)
        self._shutdown_event = threading.Event()

        # Dedicated background worker thread
        self._worker_thread = threading.Thread(
            target=self._worker_loop, 
            name="FlightRecorderTelemetryWorker", 
            daemon=True
        )
        self._worker_thread.start()

        # Graceful shutdown handler
        atexit.register(self.shutdown)

    def enqueue_trace(self, trace_payload: Dict[str, Any]):
        try:
            self._queue.put_nowait(("trace", trace_payload))
        except queue.Full:
            logger.warning("Agent Flight Recorder buffer is full. Dropping trace.")

    def enqueue_span(self, span_payload: Dict[str, Any]):
        try:
            self._queue.put_nowait(("span", span_payload))
        except queue.Full:
            logger.warning("Agent Flight Recorder buffer is full. Dropping span.")

    def _worker_loop(self):
        traces_buffer: List[Dict[str, Any]] = []
        spans_buffer: List[Dict[str, Any]] = []
        last_flush_time = time.monotonic()

        while not self._shutdown_event.is_set():
            try:
                # Dynamically calculate remaining time until next scheduled flush
                elapsed = time.monotonic() - last_flush_time
                timeout = max(0.05, self.flush_interval - elapsed)

                item_type, item_data = self._queue.get(timeout=timeout)
                if item_type == "trace":
                    traces_buffer.append(item_data)
                elif item_type == "span":
                    spans_buffer.append(item_data)

                self._queue.task_done()
            except queue.Empty:
                pass

            # Flush triggers: Size threshold or time threshold
            time_to_flush = (time.monotonic() - last_flush_time) >= self.flush_interval
            size_to_flush = (len(traces_buffer) + len(spans_buffer)) >= self.batch_size

            if (time_to_flush or size_to_flush) and (traces_buffer or spans_buffer):
                self._dispatch_batch(traces_buffer, spans_buffer)
                traces_buffer.clear()
                spans_buffer.clear()
                last_flush_time = time.monotonic()

        # Drain remaining items on shutdown
        while not self._queue.empty():
            try:
                item_type, item_data = self._queue.get_nowait()
                if item_type == "trace":
                    traces_buffer.append(item_data)
                elif item_type == "span":
                    spans_buffer.append(item_data)
                self._queue.task_done()
            except queue.Empty:
                break

        if traces_buffer or spans_buffer:
            self._dispatch_batch(traces_buffer, spans_buffer)

    def _dispatch_batch(self, traces: List[Dict], spans: List[Dict]):
        # 1. Always append and merge to local persistent flight store (.afr/traces.json)
        try:
            target_dir = os.path.join(os.getcwd(), ".afr")
            os.makedirs(target_dir, exist_ok=True)
            storage_file = os.path.join(target_dir, "traces.json")
            existing_data: List[Dict[str, Any]] = []
            if os.path.exists(storage_file):
                try:
                    with open(storage_file, "r") as f:
                        loaded = json.load(f)
                        if isinstance(loaded, list):
                            existing_data = loaded
                except Exception:
                    existing_data = []

            traces_by_id = {t["id"]: t for t in existing_data if "id" in t}

            # Upsert incoming traces
            for t in traces:
                tid = t.get("id")
                if not tid:
                    continue
                if tid in traces_by_id:
                    traces_by_id[tid].update(t)
                else:
                    t_copy = dict(t)
                    t_copy.setdefault("spans", [])
                    traces_by_id[tid] = t_copy

            # Merge incoming spans into their matching traces
            for s in spans:
                tid = s.get("trace_id")
                if not tid:
                    continue
                if tid not in traces_by_id:
                    traces_by_id[tid] = {
                        "id": tid,
                        "project_id": self.project_id,
                        "name": s.get("name", "RootTrace"),
                        "status": s.get("status", "success"),
                        "start_time": s.get("start_time"),
                        "end_time": s.get("end_time"),
                        "latency_ms": s.get("latency_ms", 0.0),
                        "total_tokens": 0,
                        "total_cost": 0.0,
                        "tags": [],
                        "metadata": {},
                        "error_count": 1 if s.get("status") == "error" else 0,
                        "spans": [],
                    }
                
                trace_obj = traces_by_id[tid]
                existing_spans = trace_obj.setdefault("spans", [])
                span_idx = next((i for i, x in enumerate(existing_spans) if x.get("id") == s.get("id")), -1)
                if span_idx >= 0:
                    existing_spans[span_idx] = s
                else:
                    existing_spans.append(s)

                # Recompute trace metrics dynamically from all constituent spans
                total_tokens = 0
                total_cost = 0.0
                has_error = False
                for span_item in existing_spans:
                    meta = span_item.get("metadata", {}) or {}
                    usage = meta.get("usage", {}) or {}
                    tokens = usage.get("total_tokens") or meta.get("tokens") or 0
                    cost = usage.get("cost") or meta.get("cost") or 0.0
                    total_tokens += tokens
                    total_cost += cost
                    if span_item.get("status") == "error":
                        has_error = True

                trace_obj["total_tokens"] = total_tokens
                trace_obj["total_cost"] = total_cost
                if has_error:
                    trace_obj["status"] = "error"
                    trace_obj["error_count"] = sum(1 for x in existing_spans if x.get("status") == "error")

            merged_traces = list(traces_by_id.values())
            # Sort newest first
            merged_traces.sort(key=lambda x: str(x.get("start_time") or ""), reverse=True)

            with open(storage_file, "w") as f:
                json.dump(merged_traces, f, indent=2)
        except Exception as e:
            print(f"[AFR Telemetry Error] Failed to write local store: {e}", file=sys.stderr)

        # 2. Attempt remote HTTP backend ingestion if endpoint configured
        if self.endpoint:
            url = f"{self.endpoint}/api/v1/traces"
            payload_data = json.dumps({"traces": traces, "spans": spans}).encode("utf-8")

            req = urllib.request.Request(
                url,
                data=payload_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
                method="POST",
            )

            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as response:
                    if response.status not in (200, 202):
                        logger.debug(f"Remote ingest status: {response.status}")
            except Exception as e:
                # Silently use local disk store if backend is not running
                pass

    def flush(self):
        """Block until current queue items are processed."""
        self._queue.join()

    def shutdown(self):
        """Signals background worker to terminate and flushes remaining records."""
        if not self._shutdown_event.is_set():
            self._shutdown_event.set()
            self._worker_thread.join(timeout=3.0)
