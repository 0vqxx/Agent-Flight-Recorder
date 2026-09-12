import contextvars
from typing import Optional, Dict, Any

# Asynchronous / Thread-isolated Context Variables
current_trace_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "flight_recorder_current_trace_id", default=None
)

current_span_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "flight_recorder_current_span_id", default=None
)

trace_metadata_store: contextvars.ContextVar[Dict[str, Any]] = contextvars.ContextVar(
    "flight_recorder_trace_metadata_store", default={}
)
