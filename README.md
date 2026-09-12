# 🛩️ Agent Flight Recorder (AFR)
### Enterprise-Grade AI Agent Observability & Distributed Tracing Platform

Agent Flight Recorder is a high-throughput, open-source tracing and observability platform built for asynchronous AI agent execution graphs. It functions as a specialized telemetry engine (similar to LangSmith or Phoenix), capturing nested tool calls, prompt/completion payloads, token costs, and runtime exceptions.

---

## 🏛️ System Architecture

```
                                  +---------------------------------------+
                                  |    User AI Agent Application (SDK)   |
                                  +---------------------------------------+
                                                     |
                                     (Non-blocking Memory Queue)
                                     (Batch Flush: 2,000ms / 50 items)
                                                     v
+---------------------------------------------------------------------------------------------------+
| BACKEND TELEMETRY LAYER (FastAPI + asyncpg)                                                       |
|                                                                                                   |
|  [POST /api/v1/traces]  --->  [Bearer Auth (Constant-Time)]  --->  [Bulk Multi-Row Upsert Pool]   |
+---------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------+
| HIGH-PERFORMANCE STORAGE (PostgreSQL 16)                                                          |
|                                                                                                   |
|  - projects  (API keys & multi-tenant isolation)                                                  |
|  - traces    (Root execution threads, B-Tree + GIN indexing)                                      |
|  - spans     (Self-referencing parent_span_id tree, JSONB I/O payloads & error details)           |
+---------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------+
| VISUALIZATION DASHBOARD (Next.js 14 + Tailwind CSS + Lucide Icons)                                |
|                                                                                                   |
|  - View A: Flight Explorer Grid (Live status, latency badges, token & cost metrics)               |
|  - View B: Waterfall Execution Map (Hierarchical Gantt chart scaled to root duration)             |
|  - View C: Span Inspector Drawer (Deep JSON viewers for input, output, metadata & error stacks)   |
+---------------------------------------------------------------------------------------------------+
```

---

## 🚀 Quick Start

### 1. Start Infrastructure via Docker Compose
```bash
docker compose up -d
```
- **PostgreSQL**: `localhost:5432`
- **Backend API**: `http://localhost:8000` (Swagger UI at `http://localhost:8000/docs`)
- **Frontend Dashboard**: `http://localhost:3000`

### 2. Instrument Your Code with the SDK
```python
import asyncio
import flight_recorder

# Initialize with project API key
flight_recorder.init(
    api_key="afr_sec_live_default_key",
    project_id="my-agent-project",
    endpoint="http://localhost:8000"
)

# Instrument Tools & Retrieval
@flight_recorder.trace_span(name="search_kb", span_type="tool")
def search_kb(query: str):
    return {"documents": ["Doc A", "Doc B"]}

# Instrument Root Agent Workflow
@flight_recorder.trace_span(name="MyAgent", span_type="agent", session_id="sess_101")
async def run_agent(query: str):
    return search_kb(query)

if __name__ == "__main__":
    asyncio.run(run_agent("How do I return my order?"))
```

### 3. Use the Interactive Terminal CLI (`./afr`)

```bash
# Launch full-screen interactive TUI workbench
./afr

# List recorded traces in clean Unix table
./afr list

# Render hierarchical execution waterfall tree for a trace
./afr view <trace_id>

# Inspect raw JSON input/output payloads and stack traces
./afr inspect <trace_id>

# Wrap and trace any command in real time
./afr run python my_agent.py

# Check telemetry throughput, latencies, and error metrics
./afr stats

# Clear local telemetry buffer
./afr clean
```

---

## 📁 Repository Layout

```
.
├── migrations/
│   └── 001_init_schema.sql         # Raw PostgreSQL DDL with B-Tree & GIN indexes
├── backend/
│   ├── requirements.txt            # FastAPI, asyncpg, pydantic dependencies
│   ├── config.py                   # Environment settings & pool thresholds
│   ├── db.py                       # asyncpg connection pool & batch insert logic
│   ├── models.py                   # Pydantic validation & response schemas
│   ├── security.py                 # Constant-time API Key authentication
│   └── main.py                     # API Server with endpoints (/traces, /tree, etc.)
├── sdk/
│   ├── pyproject.toml              # Python SDK packaging metadata
│   ├── flight_recorder/
│   │   ├── __init__.py             # Global convenience wrappers
│   │   ├── client.py               # Asynchronous queue & background flush loop
│   │   ├── context.py              # ContextVar-based parent span propagation
│   │   └── tracer.py               # Decorators, context managers & error hooks
│   └── examples/
│       └── demo_agent.py           # Multi-agent execution test script
├── frontend/
│   ├── package.json                # Next.js 14, React 18, Tailwind CSS, Lucide
│   ├── lib/
│   │   ├── types.ts                # TypeScript domain models
│   │   └── tree.ts                 # Waterfall Gantt & tree construction logic
│   ├── components/
│   │   ├── JsonViewer.tsx          # Formatted JSON viewer with copy action
│   │   ├── TraceTable.tsx          # View A: High-density trace explorer table
│   │   ├── WaterfallTimeline.tsx   # View B: Hierarchical execution Gantt chart
│   │   └── SpanDetailDrawer.tsx    # View C: Slide-out JSON payload inspector
│   └── app/
│       ├── layout.tsx              # Application layout & navigation
│       ├── page.tsx                # Explorer Grid page
│       └── traces/[id]/page.tsx    # Interactive Trace Waterfall canvas
└── docker-compose.yml              # Single-command local deployment
```
