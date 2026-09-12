'use client';

import React from 'react';
import { Activity, Clock, Cpu, DollarSign, AlertOctagon, TrendingUp, Zap } from 'lucide-react';
import { TraceItem } from '@/lib/types';

interface MetricsHeaderProps {
  traces: TraceItem[];
}

export const MetricsHeader: React.FC<MetricsHeaderProps> = ({ traces }) => {
  const totalTraces = traces.length;
  const avgLatency = totalTraces > 0
    ? traces.reduce((acc, t) => acc + (t.latency_ms || 0), 0) / totalTraces
    : 0;
  const totalTokens = traces.reduce((acc, t) => acc + (t.total_tokens || 0), 0);
  const totalCost = traces.reduce((acc, t) => acc + (t.total_cost || 0), 0);
  const errorCount = traces.filter((t) => t.status === 'error' || t.error_count > 0).length;
  const errorRate = totalTraces > 0 ? (errorCount / totalTraces) * 100 : 0;

  const statCards = [
    {
      label: 'Session Traces',
      value: totalTraces.toLocaleString(),
      subtext: 'Active Stream',
      icon: Activity,
      accent: 'text-indigo-400',
      badge: 'Real-time',
    },
    {
      label: 'Median Latency',
      value: `${avgLatency.toFixed(1)} ms`,
      subtext: 'P50 Duration',
      icon: Clock,
      accent: 'text-cyan-400',
      badge: 'Fast',
    },
    {
      label: 'Token Volume',
      value: `${totalTokens.toLocaleString()}`,
      subtext: 'Input + Output',
      icon: Cpu,
      accent: 'text-purple-400',
      badge: 'Optimized',
    },
    {
      label: 'Compute Cost',
      value: `$${totalCost.toFixed(4)}`,
      subtext: 'LLM Inferences',
      icon: DollarSign,
      accent: 'text-emerald-400',
      badge: 'Est. Total',
    },
    {
      label: 'Error Rate',
      value: `${errorRate.toFixed(1)}%`,
      subtext: `${errorCount} Failed Spans`,
      icon: AlertOctagon,
      accent: errorCount > 0 ? 'text-rose-400' : 'text-zinc-500',
      badge: errorCount > 0 ? 'Action Needed' : 'Healthy',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-8">
      {statCards.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div
            key={idx}
            className="glass-card glass-card-hover rounded-xl p-4 transition-all duration-300 relative group overflow-hidden"
          >
            {/* Ambient Corner Accent */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/[0.03] to-transparent pointer-events-none" />

            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                {stat.label}
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-400">
                {stat.badge}
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <div className="text-xl font-mono font-bold text-white tracking-tight">
                {stat.value}
              </div>
              <Icon className={`w-4 h-4 ${stat.accent} transition-transform group-hover:scale-110`} />
            </div>

            <div className="text-[10px] font-mono text-zinc-500 mt-2 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-zinc-600" />
              {stat.subtext}
            </div>
          </div>
        );
      })}
    </div>
  );
};
