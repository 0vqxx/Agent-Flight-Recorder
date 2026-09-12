import { SpanItem, SpanTreeNode } from './types';

function parseIsoToMs(isoStr: string): number {
  if (!isoStr) return 0;
  const d = new Date(isoStr);
  const baseMs = d.getTime();
  const match = isoStr.match(/\.(\d+)/);
  if (match) {
    const fractionStr = match[1];
    if (fractionStr.length > 3) {
      const extraMicro = parseFloat('0.' + fractionStr.slice(3));
      return baseMs + extraMicro;
    }
  }
  return baseMs;
}

export function calculateWaterfallOffsets(spans: SpanItem[], zoomFactor: number = 1.0): {
  tree: SpanTreeNode[];
  totalDurationMs: number;
  timeTicks: { label: string; offsetPct: number }[];
} {
  if (!spans || spans.length === 0) {
    return { tree: [], totalDurationMs: 0, timeTicks: [] };
  }

  // 1. Identify trace boundaries with high precision
  let globalMin = parseIsoToMs(spans[0].start_time);
  let globalMax = parseIsoToMs(spans[0].end_time);

  for (const s of spans) {
    const start = parseIsoToMs(s.start_time);
    const end = parseIsoToMs(s.end_time);
    if (start < globalMin) globalMin = start;
    if (end > globalMax) globalMax = end;
  }

  // Calculate span-based max duration to ensure total duration is accurate
  const rootSpan = spans.find((s) => !s.parent_span_id) || spans[0];
  const maxSpanLatency = Math.max(...spans.map((s) => s.latency_ms || 0), 0.1);
  const calculatedDuration = globalMax > globalMin ? (globalMax - globalMin) : maxSpanLatency;
  const totalDurationMs = Math.max(rootSpan.latency_ms || 0, calculatedDuration, maxSpanLatency, 0.1);

  // 2. Generate dynamic time ruler ticks with smart formatting (µs vs ms vs s)
  const timeTicks: { label: string; offsetPct: number }[] = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const pct = (i / tickCount) * 100;
    const timeVal = totalDurationMs * (i / tickCount);
    let label = '';
    if (totalDurationMs < 1.0) {
      label = `${(timeVal * 1000).toFixed(0)}µs`;
    } else if (totalDurationMs < 10.0) {
      label = `${timeVal.toFixed(2)}ms`;
    } else if (totalDurationMs < 100.0) {
      label = `${timeVal.toFixed(1)}ms`;
    } else if (totalDurationMs < 1000.0) {
      label = `${timeVal.toFixed(0)}ms`;
    } else {
      label = `${(timeVal / 1000).toFixed(2)}s`;
    }

    timeTicks.push({
      label,
      offsetPct: pct,
    });
  }

  // 3. Map nodes with high-resolution offsets & proportional duration
  const nodeMap = new Map<string, SpanTreeNode>();

  // Determine root start time
  const rootStartMs = globalMin;

  for (const s of spans) {
    const start = parseIsoToMs(s.start_time);
    const duration = Math.max(s.latency_ms || 0, 0.01);

    const relativeStart = Math.max(0, start - rootStartMs);
    const rawOffsetPct = totalDurationMs > 0 ? (relativeStart / totalDurationMs) * 100 : 0;
    const rawDurationPct = totalDurationMs > 0 ? (duration / totalDurationMs) * 100 : 100;

    const offsetPct = Math.min(Math.max(0, rawOffsetPct * zoomFactor), 98);
    const durationPct = Math.min(Math.max(1.2, rawDurationPct * zoomFactor), 100 - offsetPct);

    nodeMap.set(s.id, {
      ...s,
      children: [],
      depth: 0,
      offsetPct,
      durationPct,
    });
  }

  // 4. Assemble hierarchical parent-child nodes
  const roots: SpanTreeNode[] = [];

  for (const s of spans) {
    const node = nodeMap.get(s.id)!;
    if (s.parent_span_id && nodeMap.has(s.parent_span_id)) {
      const parent = nodeMap.get(s.parent_span_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { tree: roots, totalDurationMs, timeTicks };
}

