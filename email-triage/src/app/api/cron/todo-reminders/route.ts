import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTodoReminders } from '@/lib/slack';
import type { Todo } from '@/types';

/**
 * Cron job: check for todos that are due soon or overdue, send Slack reminders.
 * Runs every 30 minutes during business hours.
 *
 * Logic:
 * - Find active todos with a due_at that is within 2 hours or overdue
 * - Skip todos that were reminded in the last 2 hours
 * - Skip snoozed todos until snooze expires
 * - Group by team member, send one Slack DM per person
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // Business hours check (Mountain Time)
  const localNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Phoenix' })
  );
  const localHour = localNow.getHours();
  if (localHour < 7 || localHour >= 21) {
    return NextResponse.json({
      message: `Outside reminder hours (${localHour}:00 MT)`,
      reminded: [],
    });
  }

  // Find todos that need reminding:
  // - Active status
  // - Has a due date
  // - Due within 2 hours OR overdue
  // - Not reminded in the last 2 hours
  // - Not snoozed (or snooze has expired)
  const { data: todos, error } = await supabase
    .from('agent_reminders')
    .select('*')
    .eq('status', 'active')
    .not('due_at', 'is', null)
    .lte('due_at', twoHoursFromNow.toISOString())
    .or(`slack_reminded_at.is.null,slack_reminded_at.lt.${twoHoursAgo.toISOString()}`)
    .or(`snoozed_until.is.null,snoozed_until.lt.${now.toISOString()}`);

  if (error) {
    console.error('Todo reminder cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!todos || todos.length === 0) {
    return NextResponse.json({ message: 'No reminders to send', reminded: [] });
  }

  // Group by team_member_id
  const byMember: Record<string, Todo[]> = {};
  for (const todo of todos as Todo[]) {
    if (!byMember[todo.team_member_id]) byMember[todo.team_member_id] = [];
    byMember[todo.team_member_id].push(todo);
  }

  const reminded: { memberId: string; name: string; count: number }[] = [];

  for (const [memberId, memberTodos] of Object.entries(byMember)) {
    // Get member's Slack ID
    const { data: member } = await supabase
      .from('team_members')
      .select('name, slack_user_id')
      .eq('id', memberId)
      .eq('is_active', true)
      .single();

    if (!member?.slack_user_id) continue;

    try {
      await sendTodoReminders(member.slack_user_id, memberTodos);

      // Mark all as reminded
      const todoIds = memberTodos.map((t) => t.id);
      await supabase
        .from('agent_reminders')
        .update({ slack_reminded_at: now.toISOString() })
        .in('id', todoIds);

      reminded.push({
        memberId,
        name: member.name,
        count: memberTodos.length,
      });
    } catch (err) {
      console.error(`Todo reminder failed for ${member.name}:`, err);
    }
  }

  return NextResponse.json({ reminded });
}
