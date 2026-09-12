export interface TraceItem {
  id: string;
  project_id: string;
  session_id: string | null;
  name: string;
  status: 'running' | 'success' | 'error';
  start_time: string;
  end_time: string | null;
  latency_ms: number | null;
  total_tokens: number;
  total_cost: number;
  tags: string[];
  metadata: Record<string, any>;
  error_count: number;
  created_at: string;
}

export interface PaginatedTraces {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  items: TraceItem[];
}

export interface SpanItem {
  id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  span_type: 'agent' | 'llm' | 'tool' | 'chain' | 'retriever' | 'generic';
  status: 'success' | 'error';
  start_time: string;
  end_time: string;
  latency_ms: number;
  input: Record<string, any>;
  output: Record<string, any>;
  metadata: Record<string, any>;
  error_details: {
    type?: string;
    message?: string;
    stacktrace?: string;
  } | null;
}

export interface SpanTreeNode extends SpanItem {
  children: SpanTreeNode[];
  depth: number;
  offsetPct: number;
  durationPct: number;
}

export interface TraceTreeResponse {
  trace: TraceItem;
  spans: SpanItem[];
  tree: SpanTreeNode[];
}
