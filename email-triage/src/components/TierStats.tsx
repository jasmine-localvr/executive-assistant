'use client';

import type { TriageRun } from '@/types';

interface TierStatsProps {
  run: TriageRun | null;
}

export default function TierStats({ run }: TierStatsProps) {
  if (!run) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {['Tier 1 — Noise', 'Tier 2 — Low Priority', 'Tier 3 — For Visibility', 'Tier 4 — High Priority'].map(
          (label) => (
            <div
              key={label}
              className="rounded-md border border-brand-border bg-white p-5 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
                {label}
              </p>
              <p className="mt-2 font-serif text-4xl text-brand-border">—</p>
            </div>
          )
        )}
      </div>
    );
  }

  const stats = [
    {
      label: 'Tier 1 — Noise',
      count: run.tier1_count,
      countColor: 'text-brand-gray',
      bg: 'bg-cream',
      sub: `${run.archived_count} archived`,
    },
    {
      label: 'Tier 2 — Low Priority',
      count: run.tier2_count,
      countColor: 'text-warning',
      bg: 'bg-warning-light',
      sub: 'daily digest',
    },
    {
      label: 'Tier 3 — For Visibility',
      count: run.tier3_count,
      countColor: 'text-info',
      bg: 'bg-info-light',
      sub: 'in digest',
    },
    {
      label: 'Tier 4 — High Priority',
      count: run.tier4_count,
      countColor: 'text-error',
      bg: 'bg-error-light',
      sub: `${run.drafts_created} drafts`,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded-md border border-brand-border ${s.bg} p-5 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
            {s.label}
          </p>
          <p className={`mt-2 font-serif text-4xl ${s.countColor}`}>{s.count}</p>
          <p className="mt-1 text-xs text-light-gray">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}
