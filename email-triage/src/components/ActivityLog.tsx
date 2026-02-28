'use client';

import { useEffect, useRef } from 'react';
import type { PipelineLog } from '@/types';

interface ActivityLogProps {
  logs: PipelineLog[];
}

const levelIcon: Record<string, string> = {
  info: '→',
  success: '✓',
  error: '✗',
  warn: '⚠',
};

const levelColor: Record<string, string> = {
  info: 'text-light-gray',
  success: 'text-success',
  error: 'text-error',
  warn: 'text-warning',
};

const stepBadgeColor: Record<string, string> = {
  fetch: 'bg-info-light text-info',
  classify: 'bg-[#f5f3ff] text-[#9333EA]',
  archive: 'bg-cream text-brand-gray',
  slack: 'bg-info-light text-info',
  parse: 'bg-warning-light text-warning',
  pipeline: 'bg-cream text-brand-gray',
  complete: 'bg-success-light text-success',
  draft: 'bg-[#fef3c7] text-[#92400e]',
  digest: 'bg-info-light text-info',
};

export default function ActivityLog({ logs }: ActivityLogProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="rounded-md border border-brand-border bg-navy p-4 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <p className="font-mono text-sm text-[rgba(255,255,255,0.5)]">
          No logs yet. Run the pipeline to see activity.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-brand-border bg-navy p-4 max-h-96 overflow-y-auto shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
      <div className="space-y-1">
        {logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          return (
            <div key={log.id} className="flex items-start gap-2 font-mono text-xs">
              <span className="text-[rgba(255,255,255,0.35)] flex-shrink-0">{time}</span>
              <span className={`flex-shrink-0 w-3 ${levelColor[log.level]}`}>
                {levelIcon[log.level]}
              </span>
              <span
                className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  stepBadgeColor[log.step] ?? 'bg-cream text-brand-gray'
                }`}
              >
                {log.step}
              </span>
              <span className={`${log.level === 'error' ? 'text-error' : log.level === 'success' ? 'text-success' : 'text-[rgba(255,255,255,0.7)]'} break-all`}>
                {log.message}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
