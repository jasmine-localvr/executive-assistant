import { WebClient } from '@slack/web-api';
import type { ClassifiedEmail, Todo } from '@/types';
import type { CalendarEvent } from './calendar';

function getClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

// ─── Tier Helpers ───

function tierEmoji(tier: number): string {
  switch (tier) {
    case 4: return '🔴';
    case 3: return '👀';
    case 2: return '🟡';
    default: return '⚪';
  }
}

function tierLabel(tier: number): string {
  switch (tier) {
    case 4: return 'High Priority';
    case 3: return 'For Visibility';
    case 2: return 'Low Priority';
    default: return 'Noise';
  }
}

// ─── Single-Email DM (manual UI button) ───

export async function sendSlackDM(
  slackUserId: string,
  email: ClassifiedEmail
): Promise<void> {
  const client = getClient();

  const conversation = await client.conversations.open({
    users: slackUserId,
  });
  const channelId = conversation.channel?.id;
  if (!channelId) throw new Error('Failed to open DM channel');

  const receivedDate = email.received_at
    ? new Date(email.received_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown date';

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: `${tierEmoji(email.tier)} ${tierLabel(email.tier)} Email`,
      },
    },
    {
      type: 'section' as const,
      fields: [
        { type: 'mrkdwn' as const, text: `*From:*\n${email.from_address ?? 'Unknown'}` },
        { type: 'mrkdwn' as const, text: `*Date:*\n${receivedDate}` },
      ],
    },
    {
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: `*Subject:* ${email.subject ?? '(no subject)'}` },
    },
    {
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: `*Summary:* ${email.summary}` },
    },
    {
      type: 'section' as const,
      fields: [
        { type: 'mrkdwn' as const, text: `*Suggested Action:*\n${email.suggested_action ?? 'None'}` },
        { type: 'mrkdwn' as const, text: `*Assign To:*\n${email.suggested_assignee ?? 'N/A'}` },
      ],
    },
    { type: 'divider' as const },
  ];

  await client.chat.postMessage({
    channel: channelId,
    text: `${tierEmoji(email.tier)} ${email.subject ?? 'Email'} — ${email.summary}`,
    blocks,
  });
}

// ─── Consolidated Triage Digest ───

interface DigestStats {
  totalClassified: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  tier4Count: number;
  archivedCount: number;
  draftsCreated: number;
}

/** Extract display name from "Name <email>" or return the raw string */
function senderName(from: string | null): string {
  if (!from) return 'Unknown';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  // No angle brackets — return part before @
  const atIdx = from.indexOf('@');
  return atIdx > 0 ? from.slice(0, atIdx) : from;
}

export async function sendTriageDigest(
  slackUserId: string,
  emails: ClassifiedEmail[],
  stats: DigestStats
): Promise<void> {
  const client = getClient();

  const conversation = await client.conversations.open({
    users: slackUserId,
  });
  const channelId = conversation.channel?.id;
  if (!channelId) throw new Error('Failed to open DM channel');

  const tier4Emails = emails.filter((e) => e.tier === 4);
  const tier3Emails = emails.filter((e) => e.tier === 3);
  const tier2Emails = emails.filter((e) => e.tier === 2);

  if (tier4Emails.length === 0 && tier3Emails.length === 0 && tier2Emails.length === 0) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];

  // ── Title ──
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `📬 *Inbox Triage* — ${stats.totalClassified} emails` },
  });

  // ── Tier 4: High Priority — numbered, full detail ──
  if (tier4Emails.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🔴 *High Priority — Left Unread (${tier4Emails.length})*` },
    });

    for (let i = 0; i < tier4Emails.length; i++) {
      const e = tier4Emails[i];
      const from = senderName(e.from_address);
      const subject = e.subject ?? '(no subject)';
      const summary = e.summary_oneline ?? e.summary;
      const draft = e.draft_created ? '\n📝 Draft reply created' : '';
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${i + 1}. ${subject}*\nFrom: ${from}\n${summary}${draft}` },
      });
    }
  }

  // ── Tier 3: For Visibility — bullet, subject + from + summary ──
  if (tier3Emails.length > 0) {
    const lines = tier3Emails.map((e) => {
      const from = senderName(e.from_address);
      const subject = e.subject ?? '(no subject)';
      const summary = e.summary_oneline ?? e.summary;
      return `• *${subject}* from ${from} — ${summary}`;
    }).join('\n');

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `👀 *For Visibility — Left Unread (${tier3Emails.length})*\n${lines}` },
    });
  }

  // ── Tier 2: Low Priority — per-email one-liners ──
  if (tier2Emails.length > 0) {
    const lines = tier2Emails.map((e) => {
      return `• ${e.summary_oneline ?? e.summary}`;
    }).join('\n');

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🟡 *Low Priority — Archived (${tier2Emails.length})*\n${lines}` },
    });
  }

  // ── Footer ──
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const footerParts = [now + ' MST'];
  if (stats.archivedCount > 0) footerParts.push(`${stats.archivedCount} archived`);
  if (stats.draftsCreated > 0) footerParts.push(`${stats.draftsCreated} drafts`);
  if (stats.tier1Count > 0) footerParts.push(`${stats.tier1Count} noise filtered`);

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: footerParts.join(' · ') }],
  });

  // Truncate if over Slack's 50-block limit
  const maxBlocks = 50;
  const finalBlocks = blocks.length > maxBlocks
    ? [
        ...blocks.slice(0, maxBlocks - 1),
        { type: 'context', elements: [{ type: 'mrkdwn', text: '_…see dashboard for full details_' }] },
      ]
    : blocks;

  const fallback = `Inbox triage: ${tier4Emails.length} high priority, ${tier3Emails.length} for visibility, ${tier2Emails.length} low priority`;

  await client.chat.postMessage({
    channel: channelId,
    text: fallback,
    blocks: finalBlocks,
  });
}

// ─── Calendar Morning Summary ───

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export async function sendCalendarSummary(
  slackUserId: string,
  events: CalendarEvent[],
  memberId: string,
  dateOverride?: string
): Promise<void> {
  const client = getClient();

  const conversation = await client.conversations.open({ users: slackUserId });
  const channelId = conversation.channel?.id;
  if (!channelId) throw new Error('Failed to open DM channel');

  const dateForHeader = dateOverride ? new Date(`${dateOverride}T12:00:00`) : new Date();
  const today = dateForHeader.toLocaleDateString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];

  if (events.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `📅 *Your Day — ${today}*\nNo meetings today. Clear schedule!` },
    });
  } else {
    const meetingCount = events.filter((e) => !e.allDay).length;
    const allDayCount = events.filter((e) => e.allDay).length;
    const countParts: string[] = [];
    if (meetingCount > 0) countParts.push(`${meetingCount} meeting${meetingCount === 1 ? '' : 's'}`);
    if (allDayCount > 0) countParts.push(`${allDayCount} all-day`);

    // Header line
    const lines: string[] = [];

    // All-day events
    for (const evt of events.filter((e) => e.allDay)) {
      lines.push(`• All Day — ${evt.title}`);
    }

    // Timed events — one bullet per event
    const needsRsvpEvents: CalendarEvent[] = [];
    for (const evt of events.filter((e) => !e.allDay)) {
      const time = evt.startTime && evt.endTime
        ? `${formatTime(evt.startTime)} - ${formatTime(evt.endTime)}`
        : '';

      let line = `• ${time}: ${evt.title}`;

      if (evt.meetLink) {
        line += ` - <${evt.meetLink}|Join>`;
      } else if (evt.location) {
        line += ` - ${evt.location}`;
      }

      // Show external attendees only
      if (evt.externalAttendees.length > 0) {
        const shown = evt.externalAttendees.slice(0, 5);
        const extra = evt.externalAttendees.length > 5
          ? ` +${evt.externalAttendees.length - 5} more`
          : '';
        line += ` [External 👥 ${shown.join(', ')}${extra}]`;
      }

      if (evt.responseStatus === 'needsAction') {
        line += ' ⏳';
        needsRsvpEvents.push(evt);
      }

      lines.push(line);
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📅 *Your Day — ${today}* (${countParts.join(', ')})\n${lines.join('\n')}`,
      },
    });

    // RSVP action buttons for needsAction events
    if (needsRsvpEvents.length > 0) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '⏳ *Needs RSVP:*' }],
      });

      for (const evt of needsRsvpEvents) {
        const time = evt.startTime ? formatTime(evt.startTime) : '';
        const label = time ? `${time}: ${evt.title}` : evt.title;
        // Slack button text max 75 chars
        const truncated = label.length > 40 ? label.slice(0, 37) + '...' : label;

        blocks.push({
          type: 'actions',
          block_id: `rsvp_${evt.eventId}`,
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: `✓ ${truncated}` },
              action_id: `calendar_accept_${evt.eventId}`,
              value: `${evt.eventId}|${memberId}|${evt.title}`,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: `✗ Decline` },
              action_id: `calendar_decline_${evt.eventId}`,
              value: `${evt.eventId}|${memberId}|${evt.title}`,
            },
          ],
        });
      }
    }
  }

  const fallback = events.length > 0
    ? `📅 ${today}: ${events.length} event${events.length === 1 ? '' : 's'}`
    : `📅 ${today}: No meetings`;

  await client.chat.postMessage({
    channel: channelId,
    text: fallback,
    blocks,
  });
}

// ─── Todo Reminders ───

function priorityEmoji(priority: string): string {
  switch (priority) {
    case 'high': return '🔴';
    case 'medium': return '🟡';
    default: return '🟢';
  }
}

function formatDueDate(dueAt: string): string {
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < -24) {
    const days = Math.floor(Math.abs(diffHours) / 24);
    return `⚠️ ${days} day${days === 1 ? '' : 's'} overdue`;
  }
  if (diffHours < 0) {
    return '⚠️ Overdue';
  }
  if (diffHours < 1) {
    return `Due in ${Math.max(1, Math.round(diffMs / 60000))} min`;
  }
  if (diffHours < 24) {
    return `Due in ${Math.round(diffHours)} hour${Math.round(diffHours) === 1 ? '' : 's'}`;
  }

  return `Due ${due.toLocaleDateString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export async function sendTodoReminders(
  slackUserId: string,
  todos: Todo[]
): Promise<void> {
  if (todos.length === 0) return;

  const client = getClient();
  const conversation = await client.conversations.open({ users: slackUserId });
  const channelId = conversation.channel?.id;
  if (!channelId) throw new Error('Failed to open DM channel');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];

  const overdue = todos.filter((t) => t.due_at && new Date(t.due_at) < new Date());
  const upcoming = todos.filter((t) => t.due_at && new Date(t.due_at) >= new Date());

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `📋 *Todo Reminders* — ${todos.length} item${todos.length === 1 ? '' : 's'} need${todos.length === 1 ? 's' : ''} attention`,
    },
  });

  if (overdue.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*⚠️ Overdue (${overdue.length})*` },
    });

    for (const todo of overdue) {
      const dueText = todo.due_at ? formatDueDate(todo.due_at) : '';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${priorityEmoji(todo.priority)} *${todo.title}*\n${dueText}${todo.description ? `\n${todo.description}` : ''}`,
        },
      });

      blocks.push({
        type: 'actions',
        block_id: `todo_${todo.id}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✓ Complete' },
            style: 'primary',
            action_id: `todo_complete_${todo.id}`,
            value: todo.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Snooze 1hr' },
            action_id: `todo_snooze_${todo.id}`,
            value: `${todo.id}|1`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Snooze 1d' },
            action_id: `todo_snooze_day_${todo.id}`,
            value: `${todo.id}|24`,
          },
        ],
      });
    }
  }

  if (upcoming.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*📅 Coming Up (${upcoming.length})*` },
    });

    for (const todo of upcoming) {
      const dueText = todo.due_at ? formatDueDate(todo.due_at) : '';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${priorityEmoji(todo.priority)} *${todo.title}*\n${dueText}${todo.description ? `\n${todo.description}` : ''}`,
        },
      });

      blocks.push({
        type: 'actions',
        block_id: `todo_${todo.id}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✓ Complete' },
            style: 'primary',
            action_id: `todo_complete_${todo.id}`,
            value: todo.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Snooze 1hr' },
            action_id: `todo_snooze_${todo.id}`,
            value: `${todo.id}|1`,
          },
        ],
      });
    }
  }

  // Truncate blocks
  const maxBlocks = 50;
  const finalBlocks = blocks.length > maxBlocks
    ? [
        ...blocks.slice(0, maxBlocks - 1),
        { type: 'context', elements: [{ type: 'mrkdwn', text: '_…see dashboard for full list_' }] },
      ]
    : blocks;

  await client.chat.postMessage({
    channel: channelId,
    text: `📋 ${todos.length} todo reminder${todos.length === 1 ? '' : 's'}`,
    blocks: finalBlocks,
  });
}
