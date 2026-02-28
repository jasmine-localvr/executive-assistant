'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

interface PipelineControlsProps {
  onRunComplete: (runId: string) => void;
}

export default function PipelineControls({
  onRunComplete,
}: PipelineControlsProps) {
  const { data: session } = useSession();
  const [running, setRunning] = useState(false);
  const [emailCount, setEmailCount] = useState(5);
  const [dryRun, setDryRun] = useState(true);

  async function handleRun() {
    if (!session?.user?.teamMemberId) return;
    setRunning(true);

    try {
      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailCount, dryRun }),
      });
      const data = await res.json();
      if (data.runId) {
        onRunComplete(data.runId);
      }
    } catch (err) {
      console.error('Pipeline run failed:', err);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-md border border-brand-border bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
      <button
        onClick={handleRun}
        disabled={running || !session?.user?.teamMemberId}
        className="rounded bg-tan px-5 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Running...' : 'Run Now'}
      </button>

      <div className="flex items-center gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
          Emails
        </label>
        <select
          value={emailCount}
          onChange={(e) => setEmailCount(parseInt(e.target.value))}
          className="rounded border border-brand-border bg-white px-2 py-1.5 text-sm text-charcoal"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-dark-gray">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="rounded border-brand-border accent-tan"
        />
        Dry run (classify only)
      </label>
    </div>
  );
}
