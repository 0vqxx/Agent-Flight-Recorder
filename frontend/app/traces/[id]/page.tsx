'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, DollarSign, Cpu, AlertTriangle, CheckCircle2, Terminal, Zap } from 'lucide-react';
import { WaterfallTimeline } from '@/components/WaterfallTimeline';
import { SpanDetailDrawer } from '@/components/SpanDetailDrawer';
import { calculateWaterfallOffsets } from '@/lib/tree';
import { SpanItem, SpanTreeNode, TraceItem, TraceTreeResponse } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function TraceDetailPage({ params }: { params: { id: string } }) {
  const [trace, setTrace] = useState<TraceItem | null>(null);
  const [spans, setSpans] = useState<SpanItem[]>([]);
  const [treeNodes, setTreeNodes] = useState<SpanTreeNode[]>([]);
  const [timeTicks, setTimeTicks] = useState<{ label: string; offsetPct: number }[]>([]);
  const [totalDurationMs, setTotalDurationMs] = useState<number>(0);
  const [selectedSpan, setSelectedSpan] = useState<SpanTreeNode | null>(null);
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadTrace() {
      try {
        setLoading(true);
        // 1. Try remote API
        try {
          const res = await fetch(`${API_BASE}/api/v1/traces/${params.id}/tree`);
          if (res.ok) {
            const json: TraceTreeResponse = await res.json();
            setTrace(json.trace);
            setSpans(json.spans || []);
            return;
          }
        } catch (e) {}

        // 2. Try local store API
        const localRes = await fetch(`/api/traces?trace_id=${params.id}`);
        if (localRes.ok) {
          const localJson = await localRes.json();
          if (localJson.trace) {
            setTrace(localJson.trace);
            setSpans(localJson.spans || []);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to load trace:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTrace();
  }, [params.id]);

  useEffect(() => {
    if (spans.length > 0) {
      const { tree, totalDurationMs: dur, timeTicks: ticks } = calculateWaterfallOffsets(spans, zoomFactor);
      setTreeNodes(tree);
      setTotalDurationMs(dur);
      setTimeTicks(ticks);
      if (!selectedSpan && tree.length > 0) {
        setSelectedSpan(tree[0]);
      }
    }
  }, [spans, zoomFactor]);

  if (loading || !trace) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-xs text-zinc-500">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        Rendering waterfall canvas...
      </div>
    );
  }

  const isError = trace.status === 'error' || trace.error_count > 0;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Center Execution Waterfall View */}
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">
        {/* Navigation Breadcrumb */}
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Explorer
          </Link>
        </div>

        {/* Trace Top Summary Card */}
        <div className="glass-card rounded-xl p-5 mb-6 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <h1 className="text-lg font-bold font-mono text-white tracking-tight">{trace.name}</h1>
                {isError ? (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-semibold text-rose-300 bg-rose-500/20 border border-rose-500/30 px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.2)]">
                    <AlertTriangle className="w-3 h-3 text-rose-400" /> Execution Failed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Finished Successfully
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-zinc-400">
                Trace ID: <span className="text-zinc-300">{trace.id}</span>
                {trace.session_id ? ` • Session: ${trace.session_id}` : ''}
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <div className="flex items-center gap-1.5 bg-black/40 px-3.5 py-2 rounded-xl border border-white/[0.06] shadow-sm">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-zinc-200 font-bold">
                  {trace.latency_ms !== null ? `${trace.latency_ms.toFixed(1)} ms` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/40 px-3.5 py-2 rounded-xl border border-white/[0.06] shadow-sm">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-zinc-200 font-bold">
                  {trace.total_tokens ? `${trace.total_tokens.toLocaleString()} tok` : '0 tok'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/40 px-3.5 py-2 rounded-xl border border-white/[0.06] shadow-sm">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-bold">${trace.total_cost.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* The Enhanced Waterfall Timeline Component */}
        <div className="flex-1">
          <WaterfallTimeline
            tree={treeNodes}
            timeTicks={timeTicks}
            totalDurationMs={totalDurationMs}
            selectedSpanId={selectedSpan?.id || null}
            onSelectSpan={(span) => setSelectedSpan(span)}
            zoomFactor={zoomFactor}
            onZoomChange={(factor) => setZoomFactor(factor)}
          />
        </div>
      </div>

      {/* The Detail Side Drawer Component */}
      <SpanDetailDrawer
        span={selectedSpan}
        onClose={() => setSelectedSpan(null)}
      />
    </div>
  );
}
