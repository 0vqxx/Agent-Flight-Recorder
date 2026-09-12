from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

class SpanModel(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    trace_id: UUID
    parent_span_id: Optional[UUID] = None
    name: str
    span_type: str = "generic"
    status: str = "success"
    start_time: datetime
    end_time: datetime
    latency_ms: float
    input: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    error_details: Optional[Dict[str, Any]] = None

class TraceModel(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: str
    session_id: Optional[str] = None
    name: str
    status: str = "running"
    start_time: datetime
    end_time: Optional[datetime] = None
    latency_ms: Optional[float] = None
    total_tokens: int = 0
    total_cost: float = 0.0
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    error_count: int = 0

class BulkIngestRequest(BaseModel):
    traces: List[TraceModel] = Field(default_factory=list)
    spans: List[SpanModel] = Field(default_factory=list)

class BulkIngestResponse(BaseModel):
    status: str
    processed_traces: int
    processed_spans: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class TraceSummary(BaseModel):
    id: UUID
    project_id: str
    session_id: Optional[str]
    name: str
    status: str
    start_time: datetime
    end_time: Optional[datetime]
    latency_ms: Optional[float]
    total_tokens: int
    total_cost: float
    tags: List[str]
    metadata: Dict[str, Any]
    error_count: int
    created_at: datetime

class PaginatedTracesResponse(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int
    items: List[TraceSummary]

class SpanTreeNode(SpanModel):
    children: List["SpanTreeNode"] = Field(default_factory=list)
    depth: int = 0

class TraceTreeResponse(BaseModel):
    trace: TraceSummary
    spans: List[SpanModel]
    tree: List[SpanTreeNode]
