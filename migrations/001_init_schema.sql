-- 001_init_schema.sql: Agent Flight Recorder PostgreSQL Schema
-- Supports high-write time-series workloads, hierarchical execution trees, and dynamic JSONB search.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. PROJECTS TABLE (Multi-tenant isolation & Auth)
-- ==========================================
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. TRACES TABLE (Root execution threads)
-- ==========================================
CREATE TABLE IF NOT EXISTS traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id VARCHAR(128),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'running', -- 'running', 'success', 'error'
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    latency_ms DOUBLE PRECISION,
    total_tokens INTEGER DEFAULT 0,
    total_cost DOUBLE PRECISION DEFAULT 0.0,
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. SPANS TABLE (Hierarchical units of execution)
-- ==========================================
CREATE TABLE IF NOT EXISTS spans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id UUID NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
    parent_span_id UUID REFERENCES spans(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    span_type VARCHAR(64) NOT NULL DEFAULT 'generic', -- 'agent', 'llm', 'tool', 'chain', 'retriever'
    status VARCHAR(32) NOT NULL DEFAULT 'success', -- 'success', 'error'
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    latency_ms DOUBLE PRECISION NOT NULL,
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    error_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 4. HIGH-PERFORMANCE INDEXING STRATEGY
-- ==========================================

-- A. Multi-tenant Time-Series Retrieval (Trace Explorer Grid)
CREATE INDEX IF NOT EXISTS idx_traces_project_created 
    ON traces (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_traces_project_status_created 
    ON traces (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_traces_session_id 
    ON traces (session_id) WHERE session_id IS NOT NULL;

-- B. Fast Hierarchical Tree Lookup & Range Scans
CREATE INDEX IF NOT EXISTS idx_spans_trace_start 
    ON spans (trace_id, start_time ASC);

CREATE INDEX IF NOT EXISTS idx_spans_parent 
    ON spans (parent_span_id) WHERE parent_span_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spans_type_status 
    ON spans (trace_id, span_type, status);

-- C. GIN Indexes for Deep JSONB Queries (tags, token metrics, error codes)
CREATE INDEX IF NOT EXISTS idx_traces_tags_gin 
    ON traces USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_traces_metadata_gin 
    ON traces USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_spans_metadata_gin 
    ON spans USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_spans_error_gin 
    ON spans USING gin (error_details) WHERE error_details IS NOT NULL;

-- Seed default demo project (API Key: `afr_sec_live_default_key`)
-- SHA256 of 'afr_sec_live_default_key' = 'd9b04f76269b618cfbe5f79590e8cb14db50c0c6630f576e27abac6ff6a64287'
INSERT INTO projects (id, name, api_key_hash)
VALUES (
    'proj_default_01', 
    'Default Production Project', 
    'd9b04f76269b618cfbe5f79590e8cb14db50c0c6630f576e27abac6ff6a64287'
) ON CONFLICT (id) DO NOTHING;
