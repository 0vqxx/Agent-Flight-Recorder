'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, ArrowRight, Cpu, DollarSign, Terminal, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { TraceItem } from '@/lib/types';

interface TraceTableProps {
  traces: TraceItem[];
  isLoading: boolean;
}

export const TraceTable: React.FC<TraceTableProps> = ({ traces, isLoading }) => {
  if (isLoading) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center text-zinc-500 font-mono text-xs glass-card rounded-xl">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        Streaming flight logs...
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="w-full py-20 text-center glass-card rounded-xl text-zinc-500 font-mono text-xs">
        No active execution telemetry streams detected. Run the client SDK to push live spans.
      </div>
    );
  }

  const maxLatency = Math.max(...traces.map((t) => t.latency_ms || 1), 1);

  return (
    <div className="w-full overflow-hidden glass-card rounded-xl shadow-2xl">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02] text-zinc-400 font-mono uppercase text-[10px] tracking-wider">
            <th className="py-3 px-4 font-semibold w-24">Status</th>
            <th className="py-3 px-4 font-semibold">Agent & Session Thread</th>
            <th className="py-3 px-4 font-semibold w-48">Duration Profile</th>
            <th className="py-3 px-4 font-semibold w-36">Tokens & Cost</th>
            <th className="py-3 px-4 font-semibold w-32">Tags</th>
            <th className="py-3 px-4 font-semibold text-right w-24">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04] font-mono">
          {traces.map((trace) => {
            const isError = trace.status === 'error' || trace.error_count > 0;
            const latency = trace.latency_ms || 0;
            const latencyPct = Math.min(100, Math.max(6, (latency / maxLatency) * 100));

            return (
              <tr
                key={trace.id}
                className="group transition-all duration-150 hover:bg-white/[0.03] cursor-pointer"
              >
                {/* Status Column */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-1.5">
                    {isError ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.15)]">
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                        Error
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Success
                      </span>
                    )}
                  </div>
                </td>

                {/* Agent Name & Session ID */}
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{trace.name}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate max-w-sm mt-0.5 flex items-center gap-2">
                    <span>{trace.session_id ? `session:${trace.session_id}` : `id:${trace.id.slice(0, 16)}...`}</span>
                  </div>
                </td>

                {/* Latency Bar */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center justify-between text-[11px] text-zinc-300 mb-1">
                    <span className="font-semibold">{latency.toFixed(1)} ms</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.06]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isError
                          ? 'bg-rose-500'
                          : latency > 1500
                          ? 'bg-amber-500'
                          : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                      }`}
                      style={{ width: `${latencyPct}%` }}
                    />
                  </div>
                </td>

                {/* Tokens & Cost */}
                <td className="py-3.5 px-4">
                  <div className="text-zinc-200 text-[11px] font-semibold flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-purple-400" />
                    {trace.total_tokens ? `${trace.total_tokens.toLocaleString()} tok` : '0 tok'}
                  </div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-0.5 mt-0.5">
                    <DollarSign className="w-2.5 h-2.5" />
                    {trace.total_cost.toFixed(4)}
                  </div>
                </td>

                {/* Tags */}
                <td className="py-3.5 px-4">
                  <div className="flex flex-wrap gap-1">
                    {trace.tags && trace.tags.length > 0 ? (
                      trace.tags.slice(0, 2).map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[9px] bg-white/[0.04] text-zinc-400 border border-white/[0.06]"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-zinc-600">—</span>
                    )}
                  </div>
                </td>

                {/* Action Link */}
                <td className="py-3.5 px-4 text-right">
                  <Link
                    href={`/traces/${trace.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-300 text-[11px] font-medium hover:bg-indigo-600 hover:border-indigo-500 hover:text-white transition-all shadow-sm"
                  >
                    View <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
