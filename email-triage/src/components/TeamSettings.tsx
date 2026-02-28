'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  slack_user_id: string | null;
  role: string | null;
  is_active: boolean;
  gmail_connected: boolean;
}

export default function TeamSettings() {
  const { data: session, update } = useSession();
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const sessionRefreshed = useRef(false);

  // Load team members once on mount
  useEffect(() => {
    loadMembers();
  }, []);

  // Refresh session once to pick up Slack connection status from DB
  useEffect(() => {
    if (sessionRefreshed.current) return;
    if (!session) return;
    sessionRefreshed.current = true;
    update();
  }, [session, update]);

  async function loadMembers() {
    const res = await fetch('/api/team');
    if (res.ok) {
      const data = await res.json();
      setMembers(data);
    }
  }

  async function handleDeactivate(id: string) {
    await fetch(`/api/team/${id}`, { method: 'DELETE' });
    loadMembers();
  }

  return (
    <div className="space-y-10">
      {/* Connection status for current user */}
      {session?.user && (
        <div className="rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <h2 className="mb-4 font-serif text-xl text-charcoal">Your Connections</h2>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <span className="rounded border border-success-border bg-success-light px-2 py-0.5 text-xs font-medium text-success">
                Connected
              </span>
              <span className="text-sm text-dark-gray">Gmail</span>
            </div>
            <div className="flex items-center gap-2">
              {session.user.slackConnected ? (
                <span className="rounded border border-success-border bg-success-light px-2 py-0.5 text-xs font-medium text-success">
                  Connected
                </span>
              ) : (
                <a
                  href="/api/auth/slack/connect"
                  className="rounded border border-brand-border bg-white px-2 py-0.5 text-xs font-medium text-dark-gray transition-colors hover:border-tan hover:bg-cream"
                >
                  Connect
                </a>
              )}
              <span className="text-sm text-dark-gray">Slack</span>
            </div>
          </div>
        </div>
      )}

      {/* Team members list */}
      <div className="rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="mb-4 font-serif text-xl text-charcoal">Team Members</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border text-left">
                <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Name</th>
                <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Email</th>
                <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Role</th>
                <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Gmail</th>
                <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Slack</th>
                <th className="pb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-brand-border">
                  <td className="py-3 font-medium text-charcoal">{m.name}</td>
                  <td className="py-3 text-dark-gray">{m.email}</td>
                  <td className="py-3 text-medium-gray">{m.role ?? '—'}</td>
                  <td className="py-3">
                    {m.gmail_connected ? (
                      <span className="rounded border border-success-border bg-success-light px-2 py-0.5 text-xs font-medium text-success">
                        Connected
                      </span>
                    ) : (
                      <span className="text-xs text-light-gray">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    {m.slack_user_id ? (
                      <span className="rounded border border-success-border bg-success-light px-2 py-0.5 text-xs font-medium text-success">
                        Connected
                      </span>
                    ) : (
                      <span className="text-xs text-light-gray">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    {m.is_active ? (
                      <button
                        onClick={() => handleDeactivate(m.id)}
                        className="text-xs font-medium text-error transition-colors hover:text-error/80"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <span className="text-xs text-light-gray">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-medium-gray">
                    No team members yet. Team members are added when they sign in.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
