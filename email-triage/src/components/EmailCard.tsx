'use client';

import { useState } from 'react';
import type { ClassifiedEmail } from '@/types';

interface EmailCardProps {
  email: ClassifiedEmail;
  onArchive?: (id: string) => void;
  onSlackDM?: (id: string) => void;
}

const tierConfig = {
  1: { emoji: '⚪', label: 'Noise', border: 'border-brand-border', bg: 'bg-cream' },
  2: { emoji: '🟡', label: 'Low Priority', border: 'border-warning-border', bg: 'bg-warning-light' },
  3: { emoji: '🔵', label: 'For Visibility', border: 'border-info-border', bg: 'bg-info-light' },
  4: { emoji: '🔴', label: 'High Priority', border: 'border-error-border', bg: 'bg-error-light' },
} as const;

export default function EmailCard({ email, onArchive, onSlackDM }: EmailCardProps) {
  const [expanded, setExpanded] = useState(false);
  const tier = tierConfig[email.tier];

  const receivedDate = email.received_at
    ? new Date(email.received_at).toLocaleString()
    : '';

  return (
    <div className={`rounded-md border ${tier.border} ${tier.bg} p-4 shadow-[0_4px_24px_rgba(0,0,0,0.06)]`}>
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg flex-shrink-0">{tier.emoji}</span>
          <div className="min-w-0">
            <p className="font-semibold text-charcoal truncate">
              {email.subject ?? '(no subject)'}
            </p>
            <p className="text-sm text-medium-gray truncate">
              {email.from_address} · {receivedDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="rounded border border-brand-border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px] text-tan-dark">
            {email.label}
          </span>
          <span className="text-light-gray">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-brand-border pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Summary</p>
            <p className="mt-1 text-sm leading-relaxed text-dark-gray">{email.summary}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Why this tier</p>
            <p className="mt-1 text-sm leading-relaxed text-dark-gray">{email.priority_reason}</p>
          </div>
          {email.suggested_action && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Suggested Action</p>
              <p className="mt-1 text-sm leading-relaxed text-dark-gray">{email.suggested_action}</p>
            </div>
          )}
          {email.suggested_assignee && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Assign To</p>
              <p className="mt-1 text-sm leading-relaxed text-dark-gray">{email.suggested_assignee}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {email.needs_reply && (
              <span className="rounded border border-warning-border bg-warning-light px-2 py-0.5 text-xs font-medium text-warning">Needs Reply</span>
            )}
            {email.draft_created && (
              <span className="rounded border border-info-border bg-info-light px-2 py-0.5 text-xs font-medium text-info">Draft Created</span>
            )}
            {!email.archived && onArchive && (
              <button
                onClick={() => onArchive(email.id)}
                className="rounded border border-brand-border bg-white px-3 py-1.5 text-xs font-medium text-dark-gray transition-colors hover:border-tan hover:bg-cream"
              >
                Archive
              </button>
            )}
            {!email.slack_dm_sent && onSlackDM && (
              <button
                onClick={() => onSlackDM(email.id)}
                className="rounded bg-tan px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold"
              >
                Send Slack DM
              </button>
            )}
            {email.archived && (
              <span className="rounded border border-success-border bg-success-light px-2 py-0.5 text-xs font-medium text-success">Archived</span>
            )}
            {email.slack_dm_sent && (
              <span className="rounded border border-success-border bg-success-light px-2 py-0.5 text-xs font-medium text-success">DM Sent</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
