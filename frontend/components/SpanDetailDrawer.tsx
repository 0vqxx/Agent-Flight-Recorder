'use client';

import React, { useState } from 'react';
import { X, Clock, Cpu, DollarSign, AlertCircle, Copy, Check, Terminal, ExternalLink, Sparkles } from 'lucide-react';
import { SpanTreeNode } from '@/lib/types';
import { JsonViewer } from './JsonViewer';

interface SpanDetailDrawerProps {
  span: SpanTreeNode | null;
  onClose: () => void;
}

export const SpanDetailDrawer: React.FC<SpanDetailDrawerProps> = ({ span, onClose }) => {
  const [activeTab, setActiveTab] = useState<'payloads' | 'metadata' | 'error'>('payloads');
  const [copiedSpanId, setCopiedSpanId] = useState(false);

  if (!span) return null;

  const usage = span.metadata?.usage || {};
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || span.metadata?.tokens || (promptTokens + completionTokens);
  const cost = usage.cost || span.metadata?.cost || 0.0;

  const handleCopyId = () => {
    navigator.clipboard.writeText(span.id);
    setCopiedSpanId(true);
    setTimeout(() => setCopiedSpanId(false), 2000);
  };

  return (
    <div className="w-[480px] border-l border-white/[0.08] bg-[#090a0d]/95 flex flex-col h-full shadow-2xl backdrop-blur-2xl z-30 transition-all duration-300">
      {/* Top Header */}
      <div className="p-4 border-b border-white/[0.06] bg-white/[0.02] flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-white/[0.04] text-zinc-300 border border-white/[0.08] font-semibold">
              {span.span_type} span
            </span>
            <span className="text-xs font-mono text-zinc-500 truncate">
              {span.id.slice(0, 14)}...
            </span>
            <button
              onClick={handleCopyId}
              className="text-zinc-500 hover:text-white transition-colors"
              title="Copy Span UUID"
            >
              {copiedSpanId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <h2 className="text-sm font-mono font-bold text-white truncate">{span.name}</h2>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-3 gap-2.5 p-4 border-b border-white/[0.06] bg-black/20">
        <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
          <div className="flex items-center text-[10px] font-mono text-zinc-400 mb-1">
            <Clock className="w-3 h-3 mr-1 text-cyan-400" /> Latency
          </div>
          <div className="text-xs font-mono font-bold text-zinc-100">
            {span.latency_ms.toFixed(1)} ms
          </div>
        </div>

        <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
          <div className="flex items-center text-[10px] font-mono text-zinc-400 mb-1">
            <Cpu className="w-3 h-3 mr-1 text-purple-400" /> Tokens
          </div>
          <div className="text-xs font-mono font-bold text-zinc-100">
            {totalTokens ? totalTokens.toLocaleString() : '—'}
          </div>
        </div>

        <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
          <div className="flex items-center text-[10px] font-mono text-zinc-400 mb-1">
            <DollarSign className="w-3 h-3 mr-1 text-emerald-400" /> Cost
          </div>
          <div className="text-xs font-mono font-bold text-emerald-400">
            ${cost > 0 ? cost.toFixed(4) : '0.0000'}
          </div>
        </div>
      </div>

      {/* Token Distribution Bar if LLM span */}
      {totalTokens > 0 && (
        <div className="px-4 py-3 bg-white/[0.02] border-b border-white/[0.06] text-[10px] font-mono">
          <div className="flex justify-between text-zinc-400 mb-1.5 font-medium">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Prompt: {promptTokens.toLocaleString()} tok</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Completion: {completionTokens.toLocaleString()} tok</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
            <div
              className="bg-indigo-500 h-full transition-all"
              style={{ width: `${(promptTokens / totalTokens) * 100}%` }}
              title="Prompt Tokens"
            />
            <div
              className="bg-purple-500 h-full transition-all"
              style={{ width: `${(completionTokens / totalTokens) * 100}%` }}
              title="Completion Tokens"
            />
          </div>
        </div>
      )}

      {/* Tabs Selection */}
      <div className="flex border-b border-white/[0.06] bg-white/[0.01] text-xs font-mono">
        <button
          onClick={() => setActiveTab('payloads')}
          className={`flex-1 py-2.5 font-medium text-center border-b-2 transition-all ${
            activeTab === 'payloads'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.05]'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Payloads
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`flex-1 py-2.5 font-medium text-center border-b-2 transition-all ${
            activeTab === 'metadata'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.05]'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Metadata
        </button>
        {span.error_details && (
          <button
            onClick={() => setActiveTab('error')}
            className={`flex-1 py-2.5 font-medium text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
              activeTab === 'error'
                ? 'border-rose-500 text-rose-400 bg-rose-500/[0.05]'
                : 'border-transparent text-rose-400/80 hover:text-rose-300'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" /> Error
          </button>
        )}
      </div>

      {/* Drawer Body Scroll */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'payloads' && (
          <>
            <JsonViewer title="Raw Input (Prompt / Args)" data={span.input} />
            <JsonViewer title="Raw Output (Completion / Result)" data={span.output} />
          </>
        )}

        {activeTab === 'metadata' && (
          <>
            <JsonViewer title="Span Metadata & Config" data={span.metadata} />
            <div className="p-3.5 bg-white/[0.02] border border-white/[0.06] rounded-xl text-xs font-mono space-y-2 text-zinc-400">
              <div className="flex justify-between">
                <span className="text-zinc-500">Start Time:</span>
                <span className="text-zinc-200">{span.start_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">End Time:</span>
                <span className="text-zinc-200">{span.end_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Parent Span ID:</span>
                <span className="text-zinc-200">{span.parent_span_id || 'Root Execution'}</span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'error' && span.error_details && (
          <div className="space-y-3">
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-mono">
              <span className="text-rose-400 font-bold uppercase tracking-wider block mb-1">
                {span.error_details.type || 'Runtime Exception'}
              </span>
              <p className="text-rose-200 leading-relaxed">{span.error_details.message}</p>
            </div>
            {span.error_details.stacktrace && (
              <div className="p-3.5 bg-black/40 border border-white/[0.08] rounded-xl overflow-x-auto text-[11px] font-mono text-zinc-400 whitespace-pre leading-relaxed">
                {span.error_details.stacktrace}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
