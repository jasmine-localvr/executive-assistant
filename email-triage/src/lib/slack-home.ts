import { WebClient } from '@slack/web-api';
import { supabase } from './supabase';
import { fetchTodayEvents } from './calendar';
import type { CalendarEvent } from './calendar';
import type { TeamMember, Todo, ClassifiedEmail } from '@/types';

function getClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

// ─── Helpers ───

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function priorityEmoji(priority: string): string {
  switch (priority) {
    case 'high': return '🔴';
    case 'medium': return '🟡';
    default: return '🟢';
  }
}

function tierEmoji(tier: number): string {
  switch (tier) {
    case 4: return '🔴';
    case 3: return '👀';
    case 2: return '🟡';
    default: return '⚪';
  }
}

function senderName(from: string | null): string {
  if (!from) return 'Unknown';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  const atIdx = from.indexOf('@');
  return atIdx > 0 ? from.slice(0, atIdx) : from;
}

// ─── Data Fetchers ───

async function getActiveTodos(memberId: string): Promise<Todo[]> {
  const { data } = await supabase
    .from('agent_reminders')
    .select('*')
    .eq('team_member_id', memberId)
    .eq('status', 'active')
    .order('priority', { ascending: true }) // high first (alphabetical: high < low < medium)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(15);

  return (data ?? []) as Todo[];
}

async function getRecentTriageEmails(memberId: string): Promise<ClassifiedEmail[]> {
  // Get emails from the most recent triage run
  const { data: latestRun } = await supabase
    .from('triage_runs')
    .select('id, completed_at')
    .eq('team_member_id', memberId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestRun) return [];

  const { data: emails } = await supabase
    .from('classified_emails')
    .select('*')
    .eq('triage_run_id', latestRun.id)
    .in('tier', [2, 3, 4])
    .order('tier', { ascending: false })
    .limit(10);

  return (emails ?? []) as ClassifiedEmail[];
}

async function getFullMember(memberId: string): Promise<TeamMember | null> {
  const { data } = await supabase
    .from('team_members')
    .select('*')
    .eq('id', memberId)
    .single();

  return (data as TeamMember) ?? null;
}

// ─── Block Builders ───

/* eslint-disable @typescript-eslint/no-explicit-any */

function buildCalendarBlocks(events: CalendarEvent[]): any[] {
  const blocks: any[] = [];

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (events.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*📅 Your Day — ${today}*\nNo meetings today. Clear schedule!` },
    });
    return blocks;
  }

  const meetingCount = events.filter((e) => !e.allDay).length;
  const allDayCount = events.filter((e) => e.allDay).length;
  const countParts: string[] = [];
  if (meetingCount > 0) countParts.push(`${meetingCount} meeting${meetingCount === 1 ? '' : 's'}`);
  if (allDayCount > 0) countParts.push(`${allDayCount} all-day`);

  const lines: string[] = [];

  for (const evt of events.filter((e) => e.allDay)) {
    lines.push(`• All Day — ${evt.title}`);
  }

  for (const evt of events.filter((e) => !e.allDay)) {
    const time = evt.startTime && evt.endTime
      ? `${formatTime(evt.startTime)} – ${formatTime(evt.endTime)}`
      : '';
    let line = `• ${time}: *${evt.title}*`;
    if (evt.meetLink) {
      line += ` — <${evt.meetLink}|Join>`;
    } else if (evt.location) {
      line += ` — ${evt.location}`;
    }
    if (evt.responseStatus === 'needsAction') line += ' ⏳';
    lines.push(line);
  }

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*📅 Your Day — ${today}* (${countParts.join(', ')})\n${lines.join('\n')}`,
    },
  });

  return blocks;
}

function buildTodoBlocks(todos: Todo[]): any[] {
  const blocks: any[] = [];

  if (todos.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*📋 To-Dos*\nAll clear — no active to-dos!' },
    });
    return blocks;
  }

  const overdue = todos.filter((t) => t.due_at && new Date(t.due_at) < new Date());
  const upcoming = todos.filter((t) => !t.due_at || new Date(t.due_at) >= new Date());

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*📋 To-Dos* — ${todos.length} active${overdue.length > 0 ? ` (${overdue.length} overdue)` : ''}`,
    },
  });

  // Show overdue first, then upcoming
  const ordered = [...overdue, ...upcoming];
  for (const todo of ordered.slice(0, 10)) {
    const isOverdue = todo.due_at && new Date(todo.due_at) < new Date();
    let dueText = '';
    if (todo.due_at) {
      const due = new Date(todo.due_at);
      const diffMs = due.getTime() - Date.now();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours < -24) {
        const days = Math.floor(Math.abs(diffHours) / 24);
        dueText = `⚠️ ${days}d overdue`;
      } else if (diffHours < 0) {
        dueText = '⚠️ Overdue';
      } else if (diffHours < 24) {
        dueText = `Due in ${Math.round(diffHours)}h`;
      } else {
        dueText = `Due ${due.toLocaleDateString('en-US', {
          timeZone: 'America/Denver',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}`;
      }
    }

    const emoji = isOverdue ? '⚠️' : priorityEmoji(todo.priority);
    const titleLine = `${emoji} *${todo.title}*${dueText ? `  _${dueText}_` : ''}`;
    const descLine = todo.description ? `\n${todo.description.slice(0, 100)}` : '';

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `${titleLine}${descLine}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: '✓ Done' },
        style: 'primary',
        action_id: `home_todo_complete_${todo.id}`,
        value: todo.id,
      },
    });
  }

  if (todos.length > 10) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_+${todos.length - 10} more — ask me "show my todos" for the full list_` }],
    });
  }

  return blocks;
}

function buildEmailBlocks(emails: ClassifiedEmail[]): any[] {
  const blocks: any[] = [];

  if (emails.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*📬 Inbox Summary*\nNo recent triage results.' },
    });
    return blocks;
  }

  const tier4 = emails.filter((e) => e.tier === 4);
  const tier3 = emails.filter((e) => e.tier === 3);
  const tier2 = emails.filter((e) => e.tier === 2);

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*📬 Latest Inbox Triage* — ${emails.length} notable email${emails.length === 1 ? '' : 's'}`,
    },
  });

  if (tier4.length > 0) {
    const lines = tier4.map((e) => {
      const from = senderName(e.from_address);
      const subject = e.subject ?? '(no subject)';
      return `${tierEmoji(4)} *${subject}* from ${from}`;
    }).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*High Priority (${tier4.length})*\n${lines}` },
    });
  }

  if (tier3.length > 0) {
    const lines = tier3.map((e) => {
      const from = senderName(e.from_address);
      return `${tierEmoji(3)} ${e.subject ?? '(no subject)'} — ${from}`;
    }).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*For Visibility (${tier3.length})*\n${lines}` },
    });
  }

  if (tier2.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `_${tier2.length} low-priority email${tier2.length === 1 ? '' : 's'} archived_`,
      }],
    });
  }

  return blocks;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Main Publisher ───

/**
 * Build and publish the App Home tab for a Slack user.
 * Fetches todos, calendar events, and latest triage results,
 * then composes them into Block Kit blocks and publishes via views.publish.
 */
export async function publishHomeTab(
  slackUserId: string,
  memberId: string
): Promise<void> {
  const client = getClient();
  const member = await getFullMember(memberId);

  // Fetch all data concurrently
  const [todos, emails, events] = await Promise.all([
    getActiveTodos(memberId),
    getRecentTriageEmails(memberId),
    member?.feature_calendar_scheduling
      ? fetchTodayEvents(member).catch(() => [] as CalendarEvent[])
      : Promise.resolve([] as CalendarEvent[]),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];

  // ── Header ──
  const greeting = member?.name ? `Hey ${member.name.split(' ')[0]}` : 'Hey there';
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `${greeting} 👋` },
  });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Last updated ${now} MST` }],
  });
  blocks.push({ type: 'divider' });

  // ── Calendar ──
  if (member?.feature_calendar_scheduling) {
    blocks.push(...buildCalendarBlocks(events));
    blocks.push({ type: 'divider' });
  }

  // ── Todos ──
  blocks.push(...buildTodoBlocks(todos));
  blocks.push({ type: 'divider' });

  // ── Email Summary ──
  if (member?.feature_inbox_management || member?.feature_inbox_summaries) {
    blocks.push(...buildEmailBlocks(emails));
    blocks.push({ type: 'divider' });
  }

  // ── Footer ──
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_DM me anything — I\'m your EA._' }],
  });

  // Slack allows max 100 blocks in a Home tab
  const maxBlocks = 100;
  const finalBlocks = blocks.length > maxBlocks
    ? blocks.slice(0, maxBlocks)
    : blocks;

  await client.views.publish({
    user_id: slackUserId,
    view: {
      type: 'home',
      blocks: finalBlocks,
    },
  });
}
