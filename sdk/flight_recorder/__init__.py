from typing import Optional, List, Dict, Any
from flight_recorder.client import FlightRecorderClient
from flight_recorder.tracer import SpanContextManager

_default_client: Optional[FlightRecorderClient] = None

def init(
    api_key: str,
    project_id: str,
    endpoint: str = "http://localhost:8000",
    batch_size: int = 50,
    flush_interval_seconds: float = 2.0,
) -> FlightRecorderClient:
    """Initializes the global Flight Recorder client."""
    global _default_client
    _default_client = FlightRecorderClient(
        api_key=api_key,
        project_id=project_id,
        endpoint=endpoint,
        batch_size=batch_size,
        flush_interval_seconds=flush_interval_seconds,
    )
    return _default_client

def get_client() -> FlightRecorderClient:
    if _default_client is None:
        raise RuntimeError(
            "Agent Flight Recorder has not been initialized. Call `flight_recorder.init(...)` first."
        )
    return _default_client

def trace_span(
    name: Optional[str] = None,
    span_type: str = "generic",
    session_id: Optional[str] = None,
    tags: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    capture_args: bool = True,
):
    """
    Universal decorator and context manager to record execution spans.
    """
    client = get_client()
    return SpanContextManager(
        client=client,
        name=name,
        span_type=span_type,
        session_id=session_id,
        tags=tags,
        metadata=metadata,
        capture_args=capture_args,
    )

def shutdown():
    """Flushes telemetry buffer and cleanly terminates worker thread."""
    if _default_client:
        _default_client.shutdown()

__all__ = ["init", "get_client", "trace_span", "shutdown", "FlightRecorderClient"]
