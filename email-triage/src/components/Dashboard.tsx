'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import TierStats from './TierStats';
import EmailCard from './EmailCard';
import ActivityLog from './ActivityLog';
import PipelineControls from './PipelineControls';
import type { TriageRun, ClassifiedEmail, PipelineLog } from '@/types';

export default function Dashboard() {
  const { data: session, update } = useSession();
  const memberId = session?.user?.teamMemberId;

  const [latestRun, setLatestRun] = useState<TriageRun | null>(null);
  const [emails, setEmails] = useState<ClassifiedEmail[]>([]);
  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<number | null>(null);

  // Trigger session update if redirected after Slack connection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack') === 'connected') {
      update();
      // Clean up the URL
      window.history.replaceState({}, '', '/');
    }
  }, [update]);

  useEffect(() => {
    if (!memberId) return;
    const params = new URLSearchParams();
    if (tierFilter) params.set('tier', String(tierFilter));
    fetch(`/api/emails?${params}`)
      .then((r) => r.json())
      .then(setEmails)
      .catch(console.error);
  }, [memberId, tierFilter, latestRun]);

  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(async () => {
      const [logsRes, statusRes] = await Promise.all([
        fetch(`/api/pipeline/logs/${activeRunId}`),
        fetch(`/api/pipeline/status/${activeRunId}`),
      ]);
      const logsData = await logsRes.json();
      const statusData = await statusRes.json();
      setLogs(logsData);
      if (statusData.status !== 'running') {
        setLatestRun(statusData);
        setActiveRunId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeRunId]);

  const handleRunComplete = useCallback((runId: string) => {
    setActiveRunId(runId);
    setLogs([]);
  }, []);

  async function handleArchive(emailId: string) {
    await fetch(`/api/emails/${emailId}/archive`, { method: 'POST' });
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, archived: true } : e))
    );
  }

  async function handleSlackDM(emailId: string) {
    await fetch(`/api/emails/${emailId}/slack-dm`, { method: 'POST' });
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, slack_dm_sent: true } : e))
    );
  }

  if (!memberId) return null;

  return (
    <div className="space-y-6">
      <PipelineControls onRunComplete={handleRunComplete} />

      <TierStats run={latestRun} />

      {/* Activity log */}
      <div>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
          Activity Log
        </h2>
        <ActivityLog logs={logs} />
      </div>

      {/* Tier definitions */}
      <div className="rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
          How Tiers Work
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded border border-brand-border p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">⚪</span>
              <span className="text-sm font-semibold text-charcoal">Tier 1 — Noise</span>
            </div>
            <p className="text-xs leading-relaxed text-medium-gray">
              Marketing newsletters, vendor promos, automated notifications. Auto-labeled, archived, and marked read.
            </p>
          </div>
          <div className="rounded border border-brand-border p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">🟡</span>
              <span className="text-sm font-semibold text-charcoal">Tier 2 — Low Priority</span>
            </div>
            <p className="text-xs leading-relaxed text-medium-gray">
              FYI-only CCs, routine confirmations, non-urgent vendor updates. Labeled, archived, and marked read. May draft a reply.
            </p>
          </div>
          <div className="rounded border border-brand-border p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">👀</span>
              <span className="text-sm font-semibold text-charcoal">Tier 3 — For Visibility</span>
            </div>
            <p className="text-xs leading-relaxed text-medium-gray">
              Worth being aware of but rarely needs action. Labeled and kept in your inbox unread. May draft a reply.
            </p>
          </div>
          <div className="rounded border border-brand-border p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">🔴</span>
              <span className="text-sm font-semibold text-charcoal">Tier 4 — High Priority</span>
            </div>
            <p className="text-xs leading-relaxed text-medium-gray">
              Emails from @golocalvr.com, owner comms, guest escalations, financial/legal matters. Labeled, kept in inbox unread, and a draft reply is created.
            </p>
          </div>
        </div>
      </div>

      {/* Email list */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
            Classified Emails
          </h2>
          <div className="flex gap-1">
            {[null, 1, 2, 3, 4].map((t) => (
              <button
                key={String(t)}
                onClick={() => setTierFilter(t)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  tierFilter === t
                    ? 'bg-tan text-charcoal'
                    : 'border border-brand-border bg-white text-medium-gray hover:border-tan hover:text-charcoal'
                }`}
              >
                {t === null ? 'All' : `Tier ${t}`}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {emails.map((email) => (
            <EmailCard
              key={email.id}
              email={email}
              onArchive={handleArchive}
              onSlackDM={handleSlackDM}
            />
          ))}
          {emails.length === 0 && (
            <div className="rounded-md border border-brand-border bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
              <p className="text-sm text-medium-gray">
                No classified emails yet. Run the pipeline to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
