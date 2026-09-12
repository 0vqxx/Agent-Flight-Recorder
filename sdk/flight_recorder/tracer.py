import asyncio
import functools
import inspect
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from flight_recorder.client import FlightRecorderClient
from flight_recorder.context import current_span_id, current_trace_id

def _serialize_safe(obj: Any) -> Any:
    """Recursively converts objects to JSON-serializable structures."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (list, tuple, set)):
        return [_serialize_safe(x) for x in obj]
    if isinstance(obj, dict):
        return {str(k): _serialize_safe(v) for k, v in obj.items()}
    if hasattr(obj, "dict") and callable(obj.dict):
        return _serialize_safe(obj.dict())
    if hasattr(obj, "model_dump") and callable(obj.model_dump):
        return _serialize_safe(obj.model_dump())
    if hasattr(obj, "__dict__"):
        return {str(k): _serialize_safe(v) for k, v in obj.__dict__.items() if not k.startswith("_")}
    return str(obj)

class SpanContextManager:
    """
    Context Manager and Execution Wrapper for telemetry capture.
    Handles start/end times, microsecond resolution latency, and parent-span binding.
    """

    def __init__(
        self,
        client: FlightRecorderClient,
        name: Optional[str] = None,
        span_type: str = "generic",
        session_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        capture_args: bool = True,
    ):
        self.client = client
        self.name = name
        self.span_type = span_type
        self.session_id = session_id
        self.tags = tags or []
        self.metadata = metadata or {}
        self.capture_args = capture_args

        self.span_id = str(uuid.uuid4())
        self.trace_id: Optional[str] = None
        self.parent_span_id: Optional[str] = None
        self.start_perf: Optional[float] = None
        self.start_dt: Optional[datetime] = None
        self.tokens = []

        self.input_payload: Dict[str, Any] = {}
        self.output_payload: Dict[str, Any] = {}
        self.error_details: Optional[Dict[str, Any]] = None
        self.status = "success"

    def set_input(self, data: Any):
        self.input_payload = _serialize_safe(data) if isinstance(data, dict) else {"input": _serialize_safe(data)}

    def set_output(self, data: Any):
        self.output_payload = _serialize_safe(data) if isinstance(data, dict) else {"output": _serialize_safe(data)}

    def set_metadata(self, key: str, value: Any):
        self.metadata[key] = _serialize_safe(value)

    def __enter__(self):
        self.start_perf = time.perf_counter()
        self.start_dt = datetime.now(timezone.utc)

        # Context Propagation
        self.trace_id = current_trace_id.get()
        self.parent_span_id = current_span_id.get()

        is_root = self.trace_id is None
        if is_root:
            self.trace_id = str(uuid.uuid4())
            self.tokens.append(current_trace_id.set(self.trace_id))

        self.tokens.append(current_span_id.set(self.span_id))
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        end_dt = datetime.now(timezone.utc)
        latency_ms = (time.perf_counter() - self.start_perf) * 1000.0

        if exc_type is not None:
            self.status = "error"
            self.error_details = {
                "type": exc_type.__name__,
                "message": str(exc_val),
                "stacktrace": "".join(traceback.format_exception(exc_type, exc_val, exc_tb)),
            }
            self.output_payload["error"] = self.error_details["message"]

        # If this is the root execution span, dispatch the top-level trace entity
        if self.parent_span_id is None:
            self.client.enqueue_trace({
                "id": self.trace_id,
                "project_id": self.client.project_id,
                "session_id": self.session_id,
                "name": self.name or "RootTrace",
                "status": self.status,
                "start_time": self.start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "latency_ms": latency_ms,
                "tags": self.tags,
                "metadata": self.metadata,
                "error_count": 1 if self.status == "error" else 0,
            })

        # Dispatch the individual span
        self.client.enqueue_span({
            "id": self.span_id,
            "trace_id": self.trace_id,
            "parent_span_id": self.parent_span_id,
            "name": self.name or "Span",
            "span_type": self.span_type,
            "status": self.status,
            "start_time": self.start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "latency_ms": latency_ms,
            "input": self.input_payload,
            "output": self.output_payload,
            "metadata": self.metadata,
            "error_details": self.error_details,
        })

        # Cleanup Context Variables in LIFO order
        for token in reversed(self.tokens):
            if token.var == current_trace_id:
                current_trace_id.reset(token)
            elif token.var == current_span_id:
                current_span_id.reset(token)

        return False  # Re-raise exception if one occurred

    def _create_child(self, name: str):
        return SpanContextManager(
            client=self.client,
            name=name,
            span_type=self.span_type,
            session_id=self.session_id,
            tags=self.tags,
            metadata=self.metadata.copy(),
            capture_args=self.capture_args,
        )

    def __call__(self, func: Callable):
        func_name = self.name or func.__name__

        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                ctx = self._create_child(func_name)
                if self.capture_args:
                    ctx.set_input({"args": _serialize_safe(args), "kwargs": _serialize_safe(kwargs)})
                with ctx:
                    result = await func(*args, **kwargs)
                    ctx.set_output(result)
                    if isinstance(result, dict):
                        if "usage" in result:
                            ctx.set_metadata("usage", result["usage"])
                        if "model" in result:
                            ctx.set_metadata("model", result["model"])
                        if "tokens" in result:
                            ctx.set_metadata("tokens", result["tokens"])
                    return result
            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                ctx = self._create_child(func_name)
                if self.capture_args:
                    ctx.set_input({"args": _serialize_safe(args), "kwargs": _serialize_safe(kwargs)})
                with ctx:
                    result = func(*args, **kwargs)
                    ctx.set_output(result)
                    if isinstance(result, dict):
                        if "usage" in result:
                            ctx.set_metadata("usage", result["usage"])
                        if "model" in result:
                            ctx.set_metadata("model", result["model"])
                        if "tokens" in result:
                            ctx.set_metadata("tokens", result["tokens"])
                    return result
            return sync_wrapper
