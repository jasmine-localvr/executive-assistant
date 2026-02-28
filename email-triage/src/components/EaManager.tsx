'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EaReply } from '@/types';

interface EnrolledUser {
  id: string;
  name: string;
  email: string;
  scheduling_link: string | null;
}

interface PollResult {
  messagesFound: number;
  repliesSent: number;
  errors: number;
  skipped: number;
}

export default function EaManager() {
  const [enrolledUsers, setEnrolledUsers] = useState<EnrolledUser[]>([]);
  const [replies, setReplies] = useState<EaReply[]>([]);
  const [repliesTotal, setRepliesTotal] = useState(0);
  const [repliesOffset, setRepliesOffset] = useState(0);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<PollResult | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [watchResult, setWatchResult] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);

  // Load enrolled users from team API
  useEffect(() => {
    fetch('/api/team')
      .then((r) => r.json())
      .then((data) => {
        const enrolled = (data as EnrolledUser[]).filter(
          (m) => m.scheduling_link
        );
        setEnrolledUsers(enrolled);
      })
      .catch(console.error);
  }, []);

  // Load reply history
  const loadReplies = useCallback(
    async (offset: number = 0) => {
      setLoadingReplies(true);
      try {
        const res = await fetch(`/api/ea/replies?limit=20&offset=${offset}`);
        const data = await res.json();
        if (offset === 0) {
          setReplies(data.replies ?? []);
        } else {
          setReplies((prev) => [...prev, ...(data.replies ?? [])]);
        }
        setRepliesTotal(data.total ?? 0);
        setRepliesOffset(offset + (data.replies?.length ?? 0));
      } catch (err) {
        console.error('Failed to load replies:', err);
      } finally {
        setLoadingReplies(false);
      }
    },
    []
  );

  useEffect(() => {
    loadReplies(0);
  }, [loadReplies]);

  async function handlePoll() {
    setPolling(true);
    setPollResult(null);
    setPollError(null);
    try {
      const res = await fetch('/api/ea/poll', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Poll failed');
      }
      const data = await res.json();
      setPollResult(data);
      // Refresh reply history
      loadReplies(0);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : 'Poll failed');
    } finally {
      setPolling(false);
    }
  }

  async function handleWatch() {
    setWatchResult(null);
    try {
      const res = await fetch('/api/ea/watch', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Watch setup failed');
      setWatchResult(
        `Watch registered. Expires: ${new Date(parseInt(data.expiration, 10)).toLocaleString()}`
      );
    } catch (err) {
      setWatchResult(
        err instanceof Error ? err.message : 'Watch setup failed'
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Enrolled Users */}
      <div className="rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="mb-1 font-serif text-lg text-charcoal">
          Enrolled Users
        </h2>
        <p className="mb-4 text-sm text-medium-gray">
          Team members with Calendar Scheduling enabled. Manage enrollment on
          the{' '}
          <a
            href="/features"
            className="text-tan-dark underline hover:text-charcoal"
          >
            Features
          </a>{' '}
          page.
        </p>

        {enrolledUsers.length === 0 ? (
          <p className="text-sm text-light-gray">
            No users enrolled yet. Enable Calendar Scheduling in Features to get
            started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="pb-2 pr-4 text-left text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
                    Name
                  </th>
                  <th className="pb-2 pr-4 text-left text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
                    Email
                  </th>
                  <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
                    Calendar Link
                  </th>
                </tr>
              </thead>
              <tbody>
                {enrolledUsers.map((user) => (
                  <tr key={user.id} className="border-b border-brand-border">
                    <td className="py-3 pr-4 text-charcoal">{user.name}</td>
                    <td className="py-3 pr-4 text-dark-gray">{user.email}</td>
                    <td className="py-3">
                      {user.scheduling_link ? (
                        <a
                          href={user.scheduling_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-tan-dark underline hover:text-charcoal"
                        >
                          {user.scheduling_link.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        <span className="text-light-gray">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <button
          onClick={() => setShowControls(!showControls)}
          className="flex w-full items-center justify-between"
        >
          <h2 className="font-serif text-lg text-charcoal">Controls</h2>
          <span className="text-sm text-medium-gray">
            {showControls ? 'Hide' : 'Show'}
          </span>
        </button>

        {showControls && (
          <div className="mt-4 space-y-4 border-t border-brand-border pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handlePoll}
                disabled={polling}
                className="rounded bg-tan px-4 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {polling ? 'Polling...' : 'Poll Now'}
              </button>
              <button
                onClick={handleWatch}
                className="rounded border border-brand-border bg-white px-4 py-1.5 text-xs font-medium text-dark-gray transition-colors hover:border-tan"
              >
                Setup Watch
              </button>
            </div>

            {pollResult && (
              <div className="rounded border border-success-border bg-success-light px-3 py-2 text-xs text-success">
                Found {pollResult.messagesFound} messages. Sent{' '}
                {pollResult.repliesSent} replies. Skipped {pollResult.skipped}.
                {pollResult.errors > 0 && ` Errors: ${pollResult.errors}.`}
              </div>
            )}
            {pollError && (
              <div className="rounded border border-error-border bg-error-light px-3 py-2 text-xs text-error">
                {pollError}
              </div>
            )}
            {watchResult && (
              <p className="text-xs text-medium-gray">{watchResult}</p>
            )}
          </div>
        )}
      </div>

      {/* Reply History */}
      <div className="rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="mb-4 font-serif text-lg text-charcoal">
          Reply History
        </h2>

        {replies.length === 0 && !loadingReplies ? (
          <p className="text-sm text-light-gray">
            No replies sent yet. Poll the ea@ inbox or wait for a Pub/Sub
            notification.
          </p>
        ) : (
          <div className="space-y-3">
            {replies.map((reply) => (
              <ReplyCard key={reply.id} reply={reply} />
            ))}

            {replies.length < repliesTotal && (
              <button
                onClick={() => loadReplies(repliesOffset)}
                disabled={loadingReplies}
                className="mt-2 rounded border border-brand-border bg-white px-4 py-1.5 text-xs font-medium text-dark-gray transition-colors hover:border-tan disabled:opacity-50"
              >
                {loadingReplies ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyCard({ reply }: { reply: EaReply }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(reply.created_at).toLocaleString();

  return (
    <div
      className="cursor-pointer rounded border border-brand-border p-3 transition-colors hover:border-tan"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                reply.reply_sent ? 'bg-success' : 'bg-error'
              }`}
            />
            <span className="truncate text-sm font-medium text-charcoal">
              {reply.subject ?? '(no subject)'}
            </span>
          </div>
          <div className="mt-1 flex gap-4 text-xs text-medium-gray">
            <span>From: {reply.from_address}</span>
            <span>For: {reply.team_member_name ?? 'Unknown'}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="whitespace-nowrap text-xs text-light-gray">
            {time}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-medium ${
              reply.reply_sent
                ? 'border border-success-border bg-success-light text-success'
                : 'border border-error-border bg-error-light text-error'
            }`}
          >
            {reply.reply_sent ? 'Sent' : 'Failed'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-brand-border pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
            Generated Reply
          </p>
          <pre className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-dark-gray">
            {reply.reply_text}
          </pre>
          {reply.error_message && (
            <p className="mt-2 text-xs text-error">
              Error: {reply.error_message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
