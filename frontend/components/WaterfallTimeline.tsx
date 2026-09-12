'use client';

import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Sparkles,
  Wrench,
  Bot,
  Database,
  Terminal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronsUpDown,
  Zap,
} from 'lucide-react';
import { SpanTreeNode } from '@/lib/types';

interface WaterfallTimelineProps {
  tree: SpanTreeNode[];
  timeTicks: { label: string; offsetPct: number }[];
  totalDurationMs: number;
  selectedSpanId: string | null;
  onSelectSpan: (span: SpanTreeNode) => void;
  zoomFactor: number;
  onZoomChange: (factor: number) => void;
}

const getSpanStyling = (type: string) => {
  switch (type) {
    case 'llm':
      return {
        icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
        badge: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
        bar: 'bg-gradient-to-r from-purple-500 via-indigo-500 to-indigo-600 shadow-[0_0_12px_rgba(168,85,247,0.35)]',
      };
    case 'tool':
      return {
        icon: <Wrench className="w-3.5 h-3.5 text-amber-400" />,
        badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        bar: 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_12px_rgba(245,158,11,0.35)]',
      };
    case 'agent':
      return {
        icon: <Bot className="w-3.5 h-3.5 text-cyan-400" />,
        badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
        bar: 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 shadow-[0_0_12px_rgba(6,182,212,0.35)]',
      };
    case 'retriever':
      return {
        icon: <Database className="w-3.5 h-3.5 text-emerald-400" />,
        badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
        bar: 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-[0_0_12px_rgba(16,185,129,0.35)]',
      };
    default:
      return {
        icon: <Terminal className="w-3.5 h-3.5 text-zinc-400" />,
        badge: 'bg-white/[0.04] text-zinc-300 border-white/[0.08]',
        bar: 'bg-gradient-to-r from-zinc-500 to-zinc-400 shadow-[0_0_8px_rgba(161,161,170,0.25)]',
      };
  }
};

export const WaterfallTimeline: React.FC<WaterfallTimelineProps> = ({
  tree,
  timeTicks,
  totalDurationMs,
  selectedSpanId,
  onSelectSpan,
  zoomFactor,
  onZoomChange,
}) => {
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => setCollapsedMap({});
  const collapseAll = () => {
    const newMap: Record<string, boolean> = {};
    const traverse = (nodes: SpanTreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) newMap[n.id] = true;
        traverse(n.children);
      }
    };
    traverse(tree);
    setCollapsedMap(newMap);
  };

  const renderNode = (node: SpanTreeNode) => {
    const isSelected = selectedSpanId === node.id;
    const isCollapsed = collapsedMap[node.id];
    const hasChildren = node.children.length > 0;
    const isError = node.status === 'error';
    const styling = getSpanStyling(node.span_type);

    return (
      <React.Fragment key={node.id}>
        <div
          onClick={() => onSelectSpan(node)}
          className={`group flex items-center h-11 border-b border-white/[0.04] cursor-pointer font-mono text-xs transition-all duration-150 relative ${
            isSelected
              ? 'bg-white/[0.08] text-white font-medium shadow-inner'
              : 'hover:bg-white/[0.03] text-zinc-300'
          } ${isError ? 'bg-rose-500/[0.06] hover:bg-rose-500/[0.1]' : ''}`}
        >
          {/* Selected Indicator Pill */}
          {isSelected && (
            <div className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
          )}

          {/* Left Column: Tree Branch Hierarchy */}
          <div
            className="w-1/2 flex items-center pr-4 overflow-hidden relative"
            style={{ paddingLeft: `${node.depth * 22 + 16}px` }}
          >
            {/* Tree Branch Visual Guide Line */}
            {node.depth > 0 && (
              <span
                className="absolute left-[18px] top-0 bottom-0 border-l border-white/[0.08] pointer-events-none"
                style={{ left: `${(node.depth - 1) * 22 + 24}px` }}
              />
            )}

            {/* Expand / Collapse Button */}
            <div className="w-5 mr-1.5 flex items-center justify-center shrink-0">
              {hasChildren ? (
                <button
                  onClick={(e) => toggleCollapse(node.id, e)}
                  className="text-zinc-500 hover:text-white p-0.5 rounded transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 mr-1" />
              )}
            </div>

            {/* Span Glyph Icon */}
            <span className="mr-2 shrink-0">{styling.icon}</span>

            {/* Name */}
            <span className="truncate font-semibold tracking-tight mr-2 group-hover:text-indigo-200 transition-colors">
              {node.name}
            </span>

            {/* Badge */}
            <span
              className={`text-[9px] uppercase px-2 py-0.5 rounded-full border tracking-wider shrink-0 font-semibold ${styling.badge}`}
            >
              {node.span_type}
            </span>

            {/* Error Marker */}
            {isError && (
              <span className="ml-2 text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold animate-pulse">
                ERR
              </span>
            )}
          </div>

          {/* Right Column: Proportional Gantt Timeline */}
          <div className="w-1/2 h-full flex items-center px-4 relative border-l border-white/[0.06] bg-black/20">
            {/* Grid Line Guides */}
            <div className="absolute inset-0 flex justify-between pointer-events-none opacity-10">
              {timeTicks.map((_, i) => (
                <div key={i} className="h-full border-r border-white/20" />
              ))}
            </div>

            {/* Timeline Bar Track */}
            <div className="w-full h-3 bg-white/[0.04] rounded-full overflow-hidden relative border border-white/[0.06]">
              <div
                className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${
                  isError
                    ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                    : styling.bar
                }`}
                style={{
                  left: `${node.offsetPct}%`,
                  width: `${node.durationPct}%`,
                }}
              />
            </div>

            {/* Duration Label */}
            <span className="ml-3 text-[11px] font-mono text-zinc-400 w-16 text-right shrink-0">
              {node.latency_ms.toFixed(1)}ms
            </span>
          </div>
        </div>

        {/* Recursive Children Rendering */}
        {!isCollapsed && node.children.map(renderNode)}
      </React.Fragment>
    );
  };

  return (
    <div className="w-full glass-card rounded-xl overflow-hidden shadow-2xl">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06] text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-indigo-400" /> Waterfall Execution Map
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-zinc-400">
            Total Latency: <strong>{totalDurationMs.toFixed(1)}ms</strong>
          </span>
        </div>

        {/* Zoom & Expand Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-2.5 py-1 rounded bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-zinc-300 text-[10px] flex items-center gap-1 transition-colors"
          >
            <ChevronsUpDown className="w-3 h-3" /> Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1 rounded bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-zinc-300 text-[10px] transition-colors"
          >
            Collapse All
          </button>

          <div className="h-4 w-[1px] bg-white/[0.08] mx-1" />

          <button
            onClick={() => onZoomChange(Math.max(0.5, zoomFactor - 0.25))}
            className="p-1.5 rounded bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-zinc-300 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-zinc-400 w-10 text-center font-bold">
            {(zoomFactor * 100).toFixed(0)}%
          </span>
          <button
            onClick={() => onZoomChange(Math.min(3.0, zoomFactor + 0.25))}
            className="p-1.5 rounded bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-zinc-300 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onZoomChange(1.0)}
            className="p-1.5 rounded bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-zinc-300 transition-colors"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Dynamic Time Ruler Header */}
      <div className="flex h-7 bg-white/[0.01] border-b border-white/[0.06] text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-wider px-4 items-center">
        <div className="w-1/2">Execution Hierarchy (Depth Tree)</div>
        <div className="w-1/2 px-4 relative flex justify-between border-l border-white/[0.06]">
          {timeTicks.map((tick, idx) => (
            <span key={idx} className="text-[9px] text-zinc-500 font-bold">
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      {/* Tree Rows */}
      <div className="divide-y divide-white/[0.02]">{tree.map((node) => renderNode(node))}</div>
    </div>
  );
};
