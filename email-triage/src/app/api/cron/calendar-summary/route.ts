import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchTodayEvents } from '@/lib/calendar';
import { sendCalendarSummary } from '@/lib/slack';
import type { TeamMember } from '@/types';

export const maxDuration = 60;

/**
 * Morning cron that sends each user a Slack DM with their day's calendar.
 * Scheduled daily at 7 AM MST (14:00 UTC) via vercel.json.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional date override for testing (e.g. ?date=2026-03-02)
  const dateOverride = request.nextUrl.searchParams.get('date') ?? undefined;

  const { data: members, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('is_active', true)
    .eq('feature_calendar_scheduling', true)
    .not('slack_user_id', 'is', null)
    .not('gmail_refresh_token', 'is', null);

  if (error || !members?.length) {
    return NextResponse.json({
      message: 'No active members with calendar feature enabled',
      sent: [],
      failed: [],
    });
  }

  const sent: { memberId: string; name: string; eventCount: number }[] = [];
  const failed: { memberId: string; name: string; error: string }[] = [];

  for (const member of members) {
    try {
      const events = await fetchTodayEvents(member as TeamMember, dateOverride);

      await sendCalendarSummary(member.slack_user_id, events, dateOverride);

      sent.push({
        memberId: member.id,
        name: member.name,
        eventCount: events.length,
      });
    } catch (err) {
      console.error(`Calendar summary failed for ${member.name}:`, err);
      failed.push({
        memberId: member.id,
        name: member.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ sent, failed });
}
