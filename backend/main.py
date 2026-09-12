import json
import math
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db import db
from models import (
    BulkIngestRequest,
    BulkIngestResponse,
    PaginatedTracesResponse,
    TraceSummary,
    SpanModel,
    SpanTreeNode,
    TraceTreeResponse,
)
from security import verify_api_key

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-Throughput Open Source AI Agent Observability & Tracing API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz", tags=["System"])
async def health_check():
    return {"status": "healthy", "version": settings.VERSION}

# ==========================================
# 1. BULK TELEMETRY INGESTION ENDPOINT
# ==========================================
@app.post(
    "/api/v1/traces",
    response_model=BulkIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Ingestion"],
)
async def bulk_ingest_traces(
    payload: BulkIngestRequest,
    authenticated_project_id: str = Depends(verify_api_key),
):
    """
    Accepts micro-batched telemetry payloads from client SDKs.
    Sanitizes, enforces project scoping, and writes records in batch.
    """
    # Enforce multi-tenant safety by pinning project_id from authenticated token
    for trace in payload.traces:
        trace.project_id = authenticated_project_id

    try:
        n_traces, n_spans = await db.bulk_ingest(payload.traces, payload.spans)
        return BulkIngestResponse(
            status="accepted",
            processed_traces=n_traces,
            processed_spans=n_spans,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Telemetry ingestion failed: {str(e)}",
        )

# ==========================================
# 2. PAGINATED TRACES QUERY INTERFACE
# ==========================================
@app.get(
    "/api/v1/projects/{project_id}/traces",
    response_model=PaginatedTracesResponse,
    tags=["Query"],
)
async def list_project_traces(
    project_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by 'success' or 'error'"),
    search: Optional[str] = Query(None, description="Search trace name or session ID"),
    min_latency_ms: Optional[float] = Query(None, description="Filter minimum latency"),
    start_time: Optional[datetime] = Query(None, description="Start date filter"),
    end_time: Optional[datetime] = Query(None, description="End date filter"),
):
    """
    Returns a high-density, paginated list of root traces for the Trace Explorer Grid.
    """
    offset = (page - 1) * page_size
    conditions = ["project_id = $1"]
    params: list = [project_id]

    if status:
        params.append(status)
        conditions.append(f"status = ${len(params)}")

    if search:
        params.append(f"%{search}%")
        conditions.append(f"(name ILIKE ${len(params)} OR session_id ILIKE ${len(params)})")

    if min_latency_ms is not None:
        params.append(min_latency_ms)
        conditions.append(f"latency_ms >= ${len(params)}")

    if start_time:
        params.append(start_time)
        conditions.append(f"start_time >= ${len(params)}")

    if end_time:
        params.append(end_time)
        conditions.append(f"start_time <= ${len(params)}")

    where_clause = " WHERE " + " AND ".join(conditions)

    count_query = f"SELECT COUNT(*) FROM traces {where_clause}"
    select_query = f"""
        SELECT id, project_id, session_id, name, status, start_time, end_time,
               latency_ms, total_tokens, total_cost, tags, metadata, error_count, created_at
        FROM traces
        {where_clause}
        ORDER BY created_at DESC
        LIMIT {page_size} OFFSET {offset}
    """

    async with db.pool.acquire() as conn:
        total_count = await conn.fetchval(count_query, *params)
        rows = await conn.fetch(select_query, *params)

    items = []
    for r in rows:
        items.append(
            TraceSummary(
                id=r["id"],
                project_id=r["project_id"],
                session_id=r["session_id"],
                name=r["name"],
                status=r["status"],
                start_time=r["start_time"],
                end_time=r["end_time"],
                latency_ms=r["latency_ms"],
                total_tokens=r["total_tokens"],
                total_cost=r["total_cost"],
                tags=json.loads(r["tags"]) if isinstance(r["tags"], str) else (r["tags"] or []),
                metadata=json.loads(r["metadata"]) if isinstance(r["metadata"], str) else (r["metadata"] or {}),
                error_count=r["error_count"],
                created_at=r["created_at"],
            )
        )

    total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1

    return PaginatedTracesResponse(
        page=page,
        page_size=page_size,
        total=total_count,
        total_pages=total_pages,
        items=items,
    )

# ==========================================
# 3. FAST STRUCTURAL TRACE TREE AGGREGATOR
# ==========================================
@app.get(
    "/api/v1/traces/{trace_id}/tree",
    response_model=TraceTreeResponse,
    tags=["Query"],
)
async def get_trace_tree(trace_id: UUID):
    """
    Fetches the top-level trace metadata and all child spans,
    returning both a timestamp-ordered flat list and a reconstructed tree hierarchy.
    """
    async with db.pool.acquire() as conn:
        trace_row = await conn.fetchrow(
            "SELECT * FROM traces WHERE id = $1", trace_id
        )
        if not trace_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Trace with ID '{trace_id}' was not found.",
            )

        span_rows = await conn.fetch(
            """
            SELECT id, trace_id, parent_span_id, name, span_type, status,
                   start_time, end_time, latency_ms, input, output, metadata, error_details
            FROM spans
            WHERE trace_id = $1
            ORDER BY start_time ASC
            """,
            trace_id,
        )

    trace = TraceSummary(
        id=trace_row["id"],
        project_id=trace_row["project_id"],
        session_id=trace_row["session_id"],
        name=trace_row["name"],
        status=trace_row["status"],
        start_time=trace_row["start_time"],
        end_time=trace_row["end_time"],
        latency_ms=trace_row["latency_ms"],
        total_tokens=trace_row["total_tokens"],
        total_cost=trace_row["total_cost"],
        tags=json.loads(trace_row["tags"]) if isinstance(trace_row["tags"], str) else (trace_row["tags"] or []),
        metadata=json.loads(trace_row["metadata"]) if isinstance(trace_row["metadata"], str) else (trace_row["metadata"] or {}),
        error_count=trace_row["error_count"],
        created_at=trace_row["created_at"],
    )

    flat_spans: List[SpanModel] = []
    nodes_by_id: Dict[UUID, SpanTreeNode] = {}

    for s in span_rows:
        span_model = SpanModel(
            id=s["id"],
            trace_id=s["trace_id"],
            parent_span_id=s["parent_span_id"],
            name=s["name"],
            span_type=s["span_type"],
            status=s["status"],
            start_time=s["start_time"],
            end_time=s["end_time"],
            latency_ms=s["latency_ms"],
            input=json.loads(s["input"]) if isinstance(s["input"], str) else (s["input"] or {}),
            output=json.loads(s["output"]) if isinstance(s["output"], str) else (s["output"] or {}),
            metadata=json.loads(s["metadata"]) if isinstance(s["metadata"], str) else (s["metadata"] or {}),
            error_details=json.loads(s["error_details"]) if isinstance(s["error_details"], str) else s["error_details"],
        )
        flat_spans.append(span_model)
        nodes_by_id[span_model.id] = SpanTreeNode(**span_model.model_dump())

    # Build Tree Hierarchy
    root_nodes: List[SpanTreeNode] = []
    for node in nodes_by_id.values():
        if node.parent_span_id and node.parent_span_id in nodes_by_id:
            parent = nodes_by_id[node.parent_span_id]
            node.depth = parent.depth + 1
            parent.children.append(node)
        else:
            node.depth = 0
            root_nodes.append(node)

    return TraceTreeResponse(
        trace=trace,
        spans=flat_spans,
        tree=root_nodes,
    )
