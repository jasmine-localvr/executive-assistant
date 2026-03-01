import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runTriagePipeline } from '@/lib/pipeline';
import type { UpdateFrequency } from '@/types';

const DEFAULT_TIMEZONE = 'America/Phoenix';

const FREQUENCY_HOURS: Record<UpdateFrequency, number> = {
  hourly: 1,
  every_2_hours: 2,
  every_4_hours: 4,
};

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (in production)
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nowUTC = new Date();

  // Compute local time in Arizona (UTC-7, no DST)
  const localNow = new Date(
    nowUTC.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE })
  );
  const localHour = localNow.getHours();
  const localDay = localNow.getDay(); // 0=Sun, 6=Sat
  const isWeekday = localDay >= 1 && localDay <= 5;

  // Early exit: outside business hours (8am–6pm local), skip DB queries entirely
  if (localHour < 8 || localHour >= 18) {
    return NextResponse.json({
      message: `Outside business hours (${localHour}:00 ${DEFAULT_TIMEZONE})`,
      runs: [],
      skipped: [],
    });
  }

  // Step 1: Get all candidate members with Gmail connected
  const { data: members, error } = await supabase
    .from('team_members')
    .select(
      'id, name, feature_inbox_summaries, summary_weekly_schedule, summary_update_frequency'
    )
    .eq('is_active', true)
    .not('gmail_refresh_token', 'is', null);

  if (error || !members?.length) {
    return NextResponse.json({
      message: 'No active members with Gmail connected',
      runs: [],
      skipped: [],
    });
  }

  // Step 2: Get the most recent completed triage run for each member
  const memberIds = members.map((m) => m.id);
  const { data: recentRuns } = await supabase
    .from('triage_runs')
    .select('team_member_id, completed_at')
    .in('team_member_id', memberIds)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  const lastRunMap = new Map<string, string>();
  for (const run of recentRuns ?? []) {
    if (!lastRunMap.has(run.team_member_id)) {
      lastRunMap.set(run.team_member_id, run.completed_at);
    }
  }

  // Step 3: Filter members based on their settings
  const eligible: typeof members = [];
  const skipped: { memberId: string; name: string; reason: string }[] = [];

  for (const member of members) {
    // Check 1: feature enabled
    if (!member.feature_inbox_summaries) {
      skipped.push({
        memberId: member.id,
        name: member.name,
        reason: 'feature_inbox_summaries disabled',
      });
      continue;
    }

    // Check 2: weekly schedule
    if (member.summary_weekly_schedule === 'weekday' && !isWeekday) {
      skipped.push({
        memberId: member.id,
        name: member.name,
        reason: 'weekend (weekday-only schedule)',
      });
      continue;
    }

    // Check 3: frequency — enough time since last run?
    const lastCompleted = lastRunMap.get(member.id);
    if (lastCompleted) {
      const hoursSince =
        (nowUTC.getTime() - new Date(lastCompleted).getTime()) /
        (1000 * 60 * 60);
      const requiredHours =
        FREQUENCY_HOURS[member.summary_update_frequency as UpdateFrequency] ?? 2;
      // 0.1h (6min) grace to handle pipeline execution time jitter
      if (hoursSince < requiredHours - 0.1) {
        skipped.push({
          memberId: member.id,
          name: member.name,
          reason: `too soon (${hoursSince.toFixed(1)}h < ${requiredHours}h)`,
        });
        continue;
      }
    }

    eligible.push(member);
  }

  // Step 4: Run pipeline for eligible members
  const results = [];
  for (const member of eligible) {
    try {
      const result = await runTriagePipeline(member.id, { emailCount: 20 });
      results.push({ memberId: member.id, name: member.name, ...result });
    } catch (err) {
      results.push({
        memberId: member.id,
        name: member.name,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ runs: results, skipped });
}
