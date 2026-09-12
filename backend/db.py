import json
from typing import List, Optional
import asyncpg
from config import settings
from models import TraceModel, SpanModel

class DatabaseManager:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        if not self.pool:
            self.pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=settings.DB_POOL_MIN_SIZE,
                max_size=settings.DB_POOL_MAX_SIZE,
                command_timeout=settings.DB_TIMEOUT,
            )

    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            self.pool = None

    async def bulk_ingest(self, traces: List[TraceModel], spans: List[SpanModel]) -> tuple[int, int]:
        """
        Executes high-throughput batch upserts for traces and batch inserts for spans
        within a single transaction to maintain integrity without lockups.
        """
        if not self.pool:
            raise RuntimeError("Database connection pool is not initialized.")

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 1. Bulk Upsert Traces
                if traces:
                    trace_records = [
                        (
                            t.id,
                            t.project_id,
                            t.session_id,
                            t.name,
                            t.status,
                            t.start_time,
                            t.end_time,
                            t.latency_ms,
                            t.total_tokens,
                            t.total_cost,
                            json.dumps(t.tags),
                            json.dumps(t.metadata),
                            t.error_count,
                        )
                        for t in traces
                    ]
                    await conn.executemany(
                        """
                        INSERT INTO traces (
                            id, project_id, session_id, name, status,
                            start_time, end_time, latency_ms, total_tokens,
                            total_cost, tags, metadata, error_count
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13)
                        ON CONFLICT (id) DO UPDATE SET
                            status = EXCLUDED.status,
                            end_time = EXCLUDED.end_time,
                            latency_ms = EXCLUDED.latency_ms,
                            total_tokens = EXCLUDED.total_tokens,
                            total_cost = EXCLUDED.total_cost,
                            tags = EXCLUDED.tags,
                            metadata = EXCLUDED.metadata,
                            error_count = EXCLUDED.error_count;
                        """,
                        trace_records,
                    )

                # 2. Bulk Insert Spans
                if spans:
                    span_records = [
                        (
                            s.id,
                            s.trace_id,
                            s.parent_span_id,
                            s.name,
                            s.span_type,
                            s.status,
                            s.start_time,
                            s.end_time,
                            s.latency_ms,
                            json.dumps(s.input),
                            json.dumps(s.output),
                            json.dumps(s.metadata),
                            json.dumps(s.error_details) if s.error_details else None,
                        )
                        for s in spans
                    ]
                    await conn.executemany(
                        """
                        INSERT INTO spans (
                            id, trace_id, parent_span_id, name, span_type,
                            status, start_time, end_time, latency_ms,
                            input, output, metadata, error_details
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb)
                        ON CONFLICT (id) DO NOTHING;
                        """,
                        span_records,
                    )

        return len(traces), len(spans)

db = DatabaseManager()
