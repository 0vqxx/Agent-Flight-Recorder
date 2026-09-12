'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  title: string;
  data: any;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ title, data }) => {
  const [copied, setCopied] = useState(false);

  const formattedJson = typeof data === 'object' && data !== null
    ? JSON.stringify(data, null, 2)
    : String(data ?? '{}');

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col mb-4 bg-black/40 border border-white/[0.08] rounded-xl overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/[0.03] border-b border-white/[0.06] text-xs font-mono">
        <span className="font-semibold text-zinc-300">{title}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06]"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="p-3.5 max-h-72 overflow-y-auto overflow-x-auto text-[11px] font-mono text-zinc-300 leading-relaxed">
        <pre className="whitespace-pre-wrap break-words">{formattedJson}</pre>
      </div>
    </div>
  );
};
