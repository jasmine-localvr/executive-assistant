'use client';

import { useState, useEffect } from 'react';
import ActivityLog from '@/components/ActivityLog';
import type { TriageRun, PipelineLog } from '@/types';

export default function HistoryPage() {
  const [runs, setRuns] = useState<TriageRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<PipelineLog[]>([]);

  useEffect(() => {
    fetch('/api/team')
      .then((r) => r.json())
      .then(() => {
        // TODO: Add /api/runs endpoint for paginated run history
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    Promise.all([
      fetch(`/api/pipeline/status/${selectedRunId}`).then((r) => r.json()),
      fetch(`/api/pipeline/logs/${selectedRunId}`).then((r) => r.json()),
    ]).then(([run, runLogs]) => {
      setRuns((prev) => {
        const exists = prev.find((r) => r.id === run.id);
        if (exists) return prev;
        return [run, ...prev];
      });
      setLogs(runLogs);
    });
  }, [selectedRunId]);

  return (
    <div>
      <h1 className="mb-6 font-serif text-[32px] text-charcoal">Run History</h1>

      {runs.length === 0 && !selectedRunId && (
        <div className="rounded-md border border-brand-border bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <p className="text-sm text-medium-gray">
            No triage runs yet. Go to the Dashboard to run the pipeline.
          </p>
        </div>
      )}

      {runs.length > 0 && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border text-left">
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Started</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Status</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Fetched</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Classified</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">T1</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">T2</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">T3</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">T4</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Archived</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Drafts</th>
                  <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">DMs</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className={`cursor-pointer border-b border-brand-border transition-colors hover:bg-cream ${
                      selectedRunId === run.id ? 'bg-tan-light' : ''
                    }`}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <td className="py-3 text-dark-gray">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-medium ${
                          run.status === 'completed'
                            ? 'border-success-border bg-success-light text-success'
                            : run.status === 'failed'
                              ? 'border-error-border bg-error-light text-error'
                              : 'border-warning-border bg-warning-light text-warning'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 text-dark-gray">{run.emails_fetched}</td>
                    <td className="py-3 text-dark-gray">{run.emails_classified}</td>
                    <td className="py-3 text-brand-gray">{run.tier1_count}</td>
                    <td className="py-3 text-warning">{run.tier2_count}</td>
                    <td className="py-3 text-info">{run.tier3_count}</td>
                    <td className="py-3 text-error">{run.tier4_count}</td>
                    <td className="py-3 text-dark-gray">{run.archived_count}</td>
                    <td className="py-3 text-info">{run.drafts_created}</td>
                    <td className="py-3 text-dark-gray">{run.slack_dms_sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedRunId && (
            <div>
              <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
                Run Logs
              </h2>
              <ActivityLog logs={logs} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
