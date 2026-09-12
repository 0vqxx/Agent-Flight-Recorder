'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
  X,
  Play,
  Square,
  Sparkles,
  Terminal,
  Database,
  Wrench,
  Bot,
} from 'lucide-react';
import { TraceItem, SpanItem, SpanTreeNode } from '@/lib/types';
import { calculateWaterfallOffsets } from '@/lib/tree';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const Workbench: React.FC = () => {
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [activeSpans, setActiveSpans] = useState<SpanItem[]>([]);
  const [treeNodes, setTreeNodes] = useState<SpanTreeNode[]>([]);
  const [timeTicks, setTimeTicks] = useState<{ label: string; offsetPct: number }[]>([]);
  const [totalDurationMs, setTotalDurationMs] = useState<number>(0);
  const [selectedSpan, setSelectedSpan] = useState<SpanTreeNode | null>(null);
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'payload' | 'response' | 'attributes' | 'timing'>('payload');
  const [copied, setCopied] = useState<string | null>(null);
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [isRecording, setIsRecording] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedProject, setSelectedProject] = useState<string>('all');

  // Fetch real traces from backend or local telemetry store
  const fetchTraces = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Try remote FastAPI backend if available
      try {
        const projPath = selectedProject && selectedProject !== 'all' ? selectedProject : 'proj_default_01';
        const res = await fetch(`${API_BASE}/api/v1/projects/${projPath}/traces?page=1&page_size=50`);
        if (res.ok) {
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            setTraces(data.items);
            if (!selectedTraceId) setSelectedTraceId(data.items[0].id);
            return;
          }
        }
      } catch (e) {}

      // 2. Query internal local store endpoint
      const localRes = await fetch('/api/traces');
      if (localRes.ok) {
        const localData = await localRes.json();
        if (localData.items && localData.items.length > 0) {
          setTraces(localData.items);
          if (!selectedTraceId) setSelectedTraceId(localData.items[0].id);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load telemetry traces:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraces();
  }, [selectedProject]);

  // Live auto-refresh polling when recording is active
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      fetchTraces(true);
    }, 2500);
    return () => clearInterval(interval);
  }, [isRecording, selectedProject, selectedTraceId]);

  // Update spans when selected trace changes
  useEffect(() => {
    if (!selectedTraceId) return;

    async function loadSpans() {
      try {
        // 1. Try remote backend tree API
        try {
          const res = await fetch(`${API_BASE}/api/v1/traces/${selectedTraceId}/tree`);
          if (res.ok) {
            const json = await res.json();
            setActiveSpans(json.spans || []);
            return;
          }
        } catch (e) {}

        // 2. Query internal local store
        const localRes = await fetch(`/api/traces?trace_id=${selectedTraceId}`);
        if (localRes.ok) {
          const localJson = await localRes.json();
          setActiveSpans(localJson.spans || []);
          return;
        }
      } catch (e) {
        setActiveSpans([]);
      }
    }
    loadSpans();
  }, [selectedTraceId]);

  useEffect(() => {
    const displayedSpans = typeFilter === 'all' 
      ? activeSpans 
      : activeSpans.filter((s) => s.span_type === typeFilter || (s.parent_span_id === null));
      
    if (displayedSpans.length > 0) {
      const { tree, totalDurationMs: dur, timeTicks: ticks } = calculateWaterfallOffsets(displayedSpans, zoomFactor);
      setTreeNodes(tree);
      setTotalDurationMs(dur);
      setTimeTicks(ticks);
      if (tree.length > 0 && (!selectedSpan || !displayedSpans.some(s => s.id === selectedSpan.id))) {
        setSelectedSpan(tree[0]);
      }
    } else {
      setTreeNodes([]);
      setSelectedSpan(null);
    }
  }, [activeSpans, zoomFactor, typeFilter]);

  const selectedTrace = traces.find((t) => t.id === selectedTraceId) || traces[0] || null;
  const projectList = Array.from(new Set(traces.map((t) => t.project_id).filter(Boolean)));

  const filteredTraces = traces.filter((t) => {
    if (selectedProject !== 'all' && t.project_id !== selectedProject) return false;
    if (statusFilter === 'success' && t.status !== 'success') return false;
    if (statusFilter === 'error' && t.status !== 'error' && t.error_count === 0) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || (t.session_id && t.session_id.toLowerCase().includes(q)) || t.id.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatDuration = (ms: number) => {
    if (!ms || ms <= 0) return '0ms';
    if (ms < 0.001) return '<1µs';
    if (ms < 1.0) return `${(ms * 1000).toFixed(0)}µs`;
    if (ms < 10.0) return `${ms.toFixed(2)}ms`;
    if (ms < 100.0) return `${ms.toFixed(1)}ms`;
    return `${ms.toFixed(0)}ms`;
  };

  const getSpanColor = (type: string, isError: boolean) => {
    if (isError) return 'bg-[#3b1219] border-[#f85149] text-[#ff7b72] shadow-[0_0_6px_rgba(248,81,73,0.3)]';
    switch (type) {
      case 'llm': return 'bg-[#281c3e] border-[#a371f7] text-[#d2a8ff] shadow-[0_0_6px_rgba(163,113,247,0.25)]';
      case 'tool': return 'bg-[#342410] border-[#d29922] text-[#e3b341] shadow-[0_0_6px_rgba(210,153,34,0.25)]';
      case 'agent': return 'bg-[#102a45] border-[#58a6ff] text-[#79c0ff] shadow-[0_0_6px_rgba(88,166,255,0.25)]';
      case 'retriever': return 'bg-[#112d1b] border-[#3fb950] text-[#7ee787] shadow-[0_0_6px_rgba(63,185,80,0.25)]';
      default: return 'bg-[#21262d] border-[#6e7681] text-[#c9d1d9]';
    }
  };

  const renderWaterfallNode = (node: SpanTreeNode) => {
    const isSelected = selectedSpan?.id === node.id;
    const isCollapsed = collapsedMap[node.id];
    const hasChildren = node.children.length > 0;
    const isError = node.status === 'error';

    return (
      <React.Fragment key={node.id}>
        <div
          onClick={() => setSelectedSpan(node)}
          className={`flex items-center h-7 border-b border-[#21262d] text-[11px] font-mono cursor-pointer select-none transition-colors ${
            isSelected ? 'bg-[#1c2128] text-white font-medium' : 'hover:bg-[#161b22] text-[#c9d1d9]'
          }`}
        >
          {/* Left Column: Operation Tree Name */}
          <div
            className="w-[340px] shrink-0 flex items-center pr-2 overflow-hidden border-r border-[#21262d]"
            style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
          >
            <div className="w-4 mr-1 flex items-center justify-center shrink-0">
              {hasChildren ? (
                <button onClick={(e) => toggleCollapse(node.id, e)} className="text-[#8b949e] hover:text-white p-0.5">
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[#484f58]" />
              )}
            </div>
            <span className="truncate mr-2 text-[#e6edf3] font-medium">{node.name}</span>
            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d] shrink-0">
              {node.span_type}
            </span>
          </div>

          {/* Right Column: Waterfall Timeline Bar with Grid Lines */}
          <div className="flex-1 h-full flex items-center px-2 relative bg-[#0d1117]">
            {/* Background Grid Lines matching time ticks */}
            <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
              {timeTicks.map((_, i) => (
                <div key={i} className="h-full border-r border-[#30363d]" />
              ))}
            </div>

            {/* Span Bar */}
            <div className="w-full h-full relative flex items-center">
              <div
                className={`absolute h-4 rounded-[3px] border text-[9px] px-1.5 flex items-center justify-start overflow-hidden whitespace-nowrap font-mono transition-all ${getSpanColor(
                  node.span_type,
                  isError
                )}`}
                style={{
                  left: `${node.offsetPct}%`,
                  width: `${node.durationPct}%`,
                  minWidth: '46px',
                }}
              >
                <span className="font-semibold tracking-tight">{formatDuration(node.latency_ms)}</span>
              </div>
            </div>
          </div>
        </div>

        {!isCollapsed && node.children.map(renderWaterfallNode)}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d1117] text-[#c9d1d9] overflow-hidden font-sans border border-[#30363d]">
      {/* 1. TOP UTILITY TOOLBAR */}
      <header className="h-9 border-b border-[#30363d] bg-[#161b22] px-3 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-[#f0f6fc] font-mono">
            <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-[#238636] animate-pulse' : 'bg-[#8b949e]'}`} />
            <span>Agent Flight Recorder</span>
          </div>
          <span className="text-[#484f58]">|</span>

          {/* Record Status Toggle */}
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
              isRecording
                ? 'bg-[#238636]/20 border-[#238636] text-[#3fb950]'
                : 'bg-[#21262d] border-[#30363d] text-[#8b949e]'
            }`}
          >
            {isRecording ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
            <span>{isRecording ? 'RECORDING' : 'PAUSED'}</span>
          </button>

          {/* Quick Status Filter Toggles */}
          <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded text-[10px] font-mono">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2 py-0.5 ${statusFilter === 'all' ? 'bg-[#21262d] text-white font-bold' : 'text-[#8b949e] hover:text-white'}`}
            >
              All ({traces.length})
            </button>
            <button
              onClick={() => setStatusFilter('success')}
              className={`px-2 py-0.5 border-l border-[#30363d] ${statusFilter === 'success' ? 'bg-[#21262d] text-[#3fb950] font-bold' : 'text-[#8b949e] hover:text-[#3fb950]'}`}
            >
              Success
            </button>
            <button
              onClick={() => setStatusFilter('error')}
              className={`px-2 py-0.5 border-l border-[#30363d] ${statusFilter === 'error' ? 'bg-[#21262d] text-[#f85149] font-bold' : 'text-[#8b949e] hover:text-[#f85149]'}`}
            >
              Errors
            </button>
          </div>

          {/* Span Type Filter Chips */}
          <div className="hidden lg:flex items-center gap-1 text-[10px] font-mono">
            <span className="text-[#8b949e] mr-1">Type:</span>
            {['all', 'llm', 'tool', 'agent', 'retriever'].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-1.5 py-0.2 rounded border uppercase text-[9px] ${
                  typeFilter === t
                    ? 'bg-[#388bfd]/20 border-[#388bfd] text-[#58a6ff] font-bold'
                    : 'bg-[#161b22] border-[#30363d] text-[#8b949e] hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Right Info & Refresh */}
        <div className="flex items-center gap-3 text-[10px] font-mono text-[#8b949e]">
          <div className="flex items-center gap-1">
            <span>Project:</span>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-[#c9d1d9] text-[10px] focus:outline-none"
            >
              <option value="all">All Projects</option>
              {projectList.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <span className="text-[#484f58]">|</span>
          <span>Spans: <strong className="text-[#c9d1d9]">{activeSpans.length}</strong></span>
          <span className="text-[#484f58]">|</span>
          <button onClick={() => fetchTraces()} className="hover:text-white" title="Refresh">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* 2. SPLIT WORKSPACE */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT COLUMN: REQUEST & TRACE LIST (280px) */}
        <div className="w-72 border-r border-[#30363d] bg-[#0d1117] flex flex-col shrink-0">
          {/* Search Box */}
          <div className="p-1.5 border-b border-[#30363d] bg-[#161b22]">
            <div className="relative">
              <Search className="w-3 h-3 text-[#8b949e] absolute left-2 top-2" />
              <input
                type="text"
                placeholder="Filter traces or session..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 pl-6 py-1 text-[11px] font-mono text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
          </div>

          {/* Table Header */}
          <div className="flex items-center h-6 bg-[#161b22] border-b border-[#30363d] text-[10px] font-mono text-[#8b949e] px-2 uppercase font-semibold select-none">
            <div className="w-12">Status</div>
            <div className="flex-1">Trace / Session</div>
            <div className="w-16 text-right">Time</div>
          </div>

          {/* Rows List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#21262d]">
            {filteredTraces.length > 0 ? (
              filteredTraces.map((t) => {
                const isSelected = selectedTraceId === t.id;
                const isError = t.status === 'error' || t.error_count > 0;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTraceId(t.id)}
                    className={`flex items-center h-8 px-2 text-[11px] font-mono cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#1f242c] text-white font-medium border-l-2 border-[#58a6ff]' : 'hover:bg-[#161b22] text-[#c9d1d9]'
                    }`}
                  >
                    <div className="w-12 shrink-0">
                      {isError ? (
                        <span className="px-1 py-0.2 rounded bg-[#f85149]/20 text-[#f85149] font-bold text-[9px]">
                          FAIL
                        </span>
                      ) : (
                        <span className="px-1 py-0.2 rounded bg-[#238636]/20 text-[#3fb950] font-bold text-[9px]">
                          PASS
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pr-2">
                      <div className="truncate text-[#e6edf3] font-semibold">{t.name}</div>
                    </div>

                    <div className="w-16 text-right text-[10px] text-[#8b949e] tabular-nums shrink-0">
                      {t.latency_ms ? `${t.latency_ms.toFixed(0)}ms` : '—'}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-[#8b949e] text-[11px] font-mono">
                No traces recorded
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: WATERFALL CANVAS + DEVTOOLS INSPECTOR */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
          {selectedTrace ? (
            <>
              {/* Active Trace Banner */}
              <div className="h-7 border-b border-[#30363d] bg-[#161b22] px-3 flex items-center justify-between shrink-0 text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#f0f6fc]">{selectedTrace.name}</span>
                  <span className="text-[#8b949e]">ID: {selectedTrace.id}</span>
                  <span className="text-[#484f58]">|</span>
                  <span>Total Latency: <strong className="text-white">{selectedTrace.latency_ms?.toFixed(1) || '0'}ms</strong></span>
                  <span className="text-[#484f58]">|</span>
                  <span>Tokens: <strong className="text-white">{selectedTrace.total_tokens || 0}</strong></span>
                  <span className="text-[#484f58]">|</span>
                  <span>Cost: <strong className="text-[#3fb950]">${selectedTrace.total_cost?.toFixed(4) || '0.0000'}</strong></span>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1">
                  <button onClick={() => setZoomFactor(Math.max(0.5, zoomFactor - 0.25))} className="p-0.5 hover:text-white" title="Zoom Out">
                    <ZoomOut className="w-3 h-3" />
                  </button>
                  <span className="text-[9px] text-[#8b949e] w-8 text-center font-bold">{(zoomFactor * 100).toFixed(0)}%</span>
                  <button onClick={() => setZoomFactor(Math.min(3.0, zoomFactor + 0.25))} className="p-0.5 hover:text-white" title="Zoom In">
                    <ZoomIn className="w-3 h-3" />
                  </button>
                  <button onClick={() => setZoomFactor(1.0)} className="p-0.5 hover:text-white" title="Reset Zoom">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Waterfall Timeline Ruler Header */}
              <div className="h-6 border-b border-[#30363d] bg-[#161b22] text-[9px] font-mono text-[#8b949e] flex items-center select-none shrink-0">
                <div className="w-[340px] px-2 font-bold uppercase border-r border-[#30363d] shrink-0">
                  Span Hierarchy
                </div>
                <div className="flex-1 h-full flex items-center justify-between px-2 tabular-nums">
                  {timeTicks.map((t, idx) => (
                    <span key={idx} className="font-semibold">{t.label}</span>
                  ))}
                </div>
              </div>

              {/* Waterfall Tree Canvas */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#21262d] min-h-[180px]">
                {treeNodes.length > 0 ? (
                  treeNodes.map(renderWaterfallNode)
                ) : (
                  <div className="p-6 text-center text-[#8b949e] font-mono text-xs">
                    No span records found for this trace.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[#8b949e] font-mono text-xs p-8 text-center">
              <div className="mb-2 font-semibold text-[#c9d1d9]">No telemetry recorded yet.</div>
              <div className="text-[11px] text-[#8b949e]">Telemetry streams appear here in real time when your agent executes.</div>
            </div>
          )}

          {/* 3. DEVTOOLS INSPECTOR BOTTOM DRAWER */}
          {selectedSpan && (
            <div className="h-64 border-t border-[#30363d] bg-[#161b22] flex flex-col shrink-0">
              {/* DevTools Tab Bar */}
              <div className="h-7 border-b border-[#30363d] bg-[#21262d] px-2 flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-white mr-2">{selectedSpan.name}</span>
                  <button
                    onClick={() => setActiveTab('payload')}
                    className={`px-2 py-0.5 rounded-t text-[10px] ${activeTab === 'payload' ? 'bg-[#161b22] text-white border-t border-x border-[#30363d] font-bold' : 'text-[#8b949e] hover:text-white'}`}
                  >
                    Payload (Input)
                  </button>
                  <button
                    onClick={() => setActiveTab('response')}
                    className={`px-2 py-0.5 rounded-t text-[10px] ${activeTab === 'response' ? 'bg-[#161b22] text-white border-t border-x border-[#30363d] font-bold' : 'text-[#8b949e] hover:text-white'}`}
                  >
                    Response (Output)
                  </button>
                  <button
                    onClick={() => setActiveTab('attributes')}
                    className={`px-2 py-0.5 rounded-t text-[10px] ${activeTab === 'attributes' ? 'bg-[#161b22] text-white border-t border-x border-[#30363d] font-bold' : 'text-[#8b949e] hover:text-white'}`}
                  >
                    Attributes
                  </button>
                  {selectedSpan.error_details && (
                    <button
                      onClick={() => setActiveTab('error' as any)}
                      className={`px-2 py-0.5 rounded-t text-[10px] text-[#f85149] font-bold ${activeTab === ('error' as any) ? 'bg-[#161b22] border-t border-x border-[#30363d]' : 'hover:underline'}`}
                    >
                      Stack Trace
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[10px] text-[#8b949e]">
                  <span>Duration: <strong className="text-white">{selectedSpan.latency_ms.toFixed(1)}ms</strong></span>
                </div>
              </div>

              {/* DevTools Tab Content */}
              <div className="flex-1 p-2 bg-[#0d1117] overflow-y-auto font-mono text-[11px]">
                {activeTab === 'payload' && (
                  <div className="relative">
                    <button
                      onClick={() => handleCopy(JSON.stringify(selectedSpan.input, null, 2), 'payload')}
                      className="absolute right-2 top-2 px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[10px] text-[#c9d1d9] hover:text-white flex items-center gap-1"
                    >
                      {copied === 'payload' ? <Check className="w-3 h-3 text-[#3fb950]" /> : <Copy className="w-3 h-3" />}
                      {copied === 'payload' ? 'Copied' : 'Copy JSON'}
                    </button>
                    <pre className="text-[#79c0ff] p-2 leading-relaxed">
                      {JSON.stringify(selectedSpan.input, null, 2)}
                    </pre>
                  </div>
                )}

                {activeTab === 'response' && (
                  <div className="relative">
                    <button
                      onClick={() => handleCopy(JSON.stringify(selectedSpan.output, null, 2), 'response')}
                      className="absolute right-2 top-2 px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[10px] text-[#c9d1d9] hover:text-white flex items-center gap-1"
                    >
                      {copied === 'response' ? <Check className="w-3 h-3 text-[#3fb950]" /> : <Copy className="w-3 h-3" />}
                      {copied === 'response' ? 'Copied' : 'Copy JSON'}
                    </button>
                    <pre className="text-[#7ee787] p-2 leading-relaxed">
                      {JSON.stringify(selectedSpan.output, null, 2)}
                    </pre>
                  </div>
                )}

                {activeTab === 'attributes' && (
                  <div className="p-2 space-y-1 text-[#8b949e]">
                    <div>Span ID: <span className="text-[#e6edf3]">{selectedSpan.id}</span></div>
                    <div>Parent Span ID: <span className="text-[#e6edf3]">{selectedSpan.parent_span_id || 'null (Root)'}</span></div>
                    <div>Span Type: <span className="text-[#e6edf3]">{selectedSpan.span_type}</span></div>
                    <div>Start Time: <span className="text-[#e6edf3]">{selectedSpan.start_time}</span></div>
                    <div>End Time: <span className="text-[#e6edf3]">{selectedSpan.end_time}</span></div>
                    <div>Metadata: <pre className="text-[#d2a8ff] mt-1">{JSON.stringify(selectedSpan.metadata, null, 2)}</pre></div>
                  </div>
                )}

                {activeTab === ('error' as any) && selectedSpan.error_details && (
                  <div className="p-2 text-[#f85149] space-y-2">
                    <div className="font-bold">{selectedSpan.error_details.type}: {selectedSpan.error_details.message}</div>
                    {selectedSpan.error_details.stacktrace && (
                      <pre className="text-[10px] text-[#8b949e] bg-[#161b22] p-2 rounded border border-[#30363d] overflow-x-auto whitespace-pre">
                        {selectedSpan.error_details.stacktrace}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
