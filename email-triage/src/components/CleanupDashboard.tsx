'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import EmailCard from './EmailCard';
import ActivityLog from './ActivityLog';
import type { ClassifiedEmail, PipelineLog } from '@/types';

export default function CleanupDashboard() {
  const { data: session } = useSession();
  const memberId = session?.user?.teamMemberId;

  // Batch state
  const [running, setRunning] = useState(false);
  const [autoContinue, setAutoContinue] = useState(true);
  const [batchCount, setBatchCount] = useState(0);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [stats, setStats] = useState({
    totalProcessed: 0,
    tier1: 0,
    tier2: 0,
    tier3: 0,
    tier4: 0,
    archived: 0,
  });

  // T4 review state
  const [t4Emails, setT4Emails] = useState<ClassifiedEmail[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkArchiving, setBulkArchiving] = useState(false);

  const autoContinueRef = useRef(autoContinue);
  autoContinueRef.current = autoContinue;
  const runningRef = useRef(false);

  // Fetch T4 unarchived emails
  const fetchT4 = useCallback(async () => {
    const res = await fetch('/api/emails?tier=4&archived=false&limit=500');
    const data = await res.json();
    if (Array.isArray(data)) setT4Emails(data);
  }, []);

  useEffect(() => {
    if (memberId) fetchT4();
  }, [memberId, fetchT4]);

  // Run one cleanup batch
  async function runBatch() {
    if (!memberId || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);

    try {
      const res = await fetch('/api/pipeline/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailCount: 50 }),
      });
      const data = await res.json();

      if (data.runId) {
        setActiveRunId(data.runId);
        setBatchCount((prev) => prev + 1);

        setStats((prev) => ({
          totalProcessed: prev.totalProcessed + (data.emailsClassified ?? 0),
          tier1: prev.tier1 + (data.tier1Count ?? 0),
          tier2: prev.tier2 + (data.tier2Count ?? 0),
          tier3: prev.tier3 + (data.tier3Count ?? 0),
          tier4: prev.tier4 + (data.tier4Count ?? 0),
          archived: prev.archived + (data.archivedCount ?? 0),
        }));

        await fetchT4();

        // Auto-continue if enabled and there were emails to process
        if (autoContinueRef.current && (data.emailsClassified ?? 0) > 0) {
          runningRef.current = false;
          setTimeout(() => runBatch(), 2000);
          return;
        }
      }
    } catch (err) {
      console.error('Cleanup batch failed:', err);
    }

    runningRef.current = false;
    setRunning(false);
  }

  function handleStop() {
    autoContinueRef.current = false;
    setAutoContinue(false);
    // running state will clear after the current batch finishes
  }

  // Poll logs while a batch is active
  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/pipeline/logs/${activeRunId}`);
      const data = await res.json();
      if (Array.isArray(data)) setLogs(data);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeRunId]);

  // Checkbox handlers
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(t4Emails.map((e) => e.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  // Bulk archive
  async function handleBulkArchive() {
    if (selectedIds.size === 0) return;
    setBulkArchiving(true);

    try {
      const res = await fetch('/api/emails/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: Array.from(selectedIds) }),
      });
      const data = await res.json();

      if (data.success) {
        setT4Emails((prev) => prev.filter((e) => !selectedIds.has(e.id)));
        setStats((prev) => ({
          ...prev,
          archived: prev.archived + (data.archivedCount ?? 0),
        }));
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error('Bulk archive failed:', err);
    } finally {
      setBulkArchiving(false);
    }
  }

  // Single archive from EmailCard
  async function handleSingleArchive(emailId: string) {
    await fetch(`/api/emails/${emailId}/archive`, { method: 'POST' });
    setT4Emails((prev) => prev.filter((e) => e.id !== emailId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(emailId);
      return next;
    });
  }

  if (!memberId) return null;

  return (
    <div className="space-y-6">
      {/* ── Controls ── */}
      <div className="rounded-md border border-brand-border bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={running ? handleStop : runBatch}
            className="rounded bg-tan px-5 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Stop After This Batch' : batchCount > 0 ? 'Continue Cleanup' : 'Start Cleanup'}
          </button>

          <label className="flex items-center gap-2 text-sm text-dark-gray">
            <input
              type="checkbox"
              checked={autoContinue}
              onChange={(e) => {
                setAutoContinue(e.target.checked);
                autoContinueRef.current = e.target.checked;
              }}
              className="rounded border-brand-border accent-tan"
              disabled={running}
            />
            Auto-continue batches
          </label>

          {batchCount > 0 && (
            <div className="flex gap-4 text-xs text-medium-gray">
              <span>Batch #{batchCount}</span>
              <span>{stats.totalProcessed} processed</span>
              <span>{stats.archived} archived</span>
              <span className="text-error">{stats.tier4} T4 for review</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      {batchCount > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Processed', value: stats.totalProcessed, color: 'text-charcoal' },
            { label: 'T1 Noise', value: stats.tier1, color: 'text-medium-gray' },
            { label: 'T2 Low', value: stats.tier2, color: 'text-warning' },
            { label: 'T3 Visibility', value: stats.tier3, color: 'text-info' },
            { label: 'T4 Review', value: stats.tier4, color: 'text-error' },
            { label: 'Archived', value: stats.archived, color: 'text-success' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-md border border-brand-border bg-white p-4 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
                {s.label}
              </p>
              <p className={`mt-2 font-serif text-3xl ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Activity Log ── */}
      {logs.length > 0 && (
        <div>
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
            Current Batch Log
          </h2>
          <ActivityLog logs={logs} />
        </div>
      )}

      {/* ── T4 Review ── */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
            Tier 4 — Needs Your Review ({t4Emails.length})
          </h2>
          {t4Emails.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={selectedIds.size === t4Emails.length ? deselectAll : selectAll}
                className="rounded border border-brand-border bg-white px-3 py-1.5 text-xs font-medium text-dark-gray transition-colors hover:border-tan hover:bg-cream"
              >
                {selectedIds.size === t4Emails.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={handleBulkArchive}
                disabled={selectedIds.size === 0 || bulkArchiving}
                className="rounded bg-tan px-4 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkArchiving
                  ? 'Archiving...'
                  : `Archive Selected (${selectedIds.size})`}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {t4Emails.map((email) => (
            <div key={email.id} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedIds.has(email.id)}
                onChange={() => toggleSelect(email.id)}
                className="mt-4 h-4 w-4 rounded border-brand-border accent-tan"
              />
              <div className="flex-1">
                <EmailCard email={email} onArchive={handleSingleArchive} />
              </div>
            </div>
          ))}
          {t4Emails.length === 0 && (
            <div className="rounded-md border border-brand-border bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
              <p className="text-sm text-medium-gray">
                {batchCount > 0
                  ? 'No Tier 4 emails pending review. All clean!'
                  : 'Run cleanup to classify your inbox. Tier 4 emails will appear here for review.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
