import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTriageDigest } from '@/lib/slack';
import type { ClassifiedEmail } from '@/types';
import type { UpdateFrequency } from '@/types';

const DEFAULT_TIMEZONE = 'America/Phoenix';

const FREQUENCY_HOURS: Record<UpdateFrequency, number> = {
  hourly: 1,
  every_2_hours: 2,
  every_4_hours: 4,
};

/**
 * Digest-only cron. Emails are now processed instantly via Gmail Pub/Sub webhook.
 * This cron only sends Slack digests on each user's chosen cadence.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nowUTC = new Date();

  const localNow = new Date(
    nowUTC.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE })
  );
  const localHour = localNow.getHours();
  const localDay = localNow.getDay();
  const isWeekday = localDay >= 1 && localDay <= 5;

  if (localHour < 8 || localHour >= 18) {
    return NextResponse.json({
      message: `Outside business hours (${localHour}:00 ${DEFAULT_TIMEZONE})`,
      digests: [],
      skipped: [],
    });
  }

  // Get all candidate members with Slack + summaries enabled
  const { data: members, error } = await supabase
    .from('team_members')
    .select(
      'id, name, slack_user_id, feature_inbox_summaries, summary_weekly_schedule, summary_update_frequency, last_digest_sent_at'
    )
    .eq('is_active', true)
    .not('slack_user_id', 'is', null);

  if (error || !members?.length) {
    return NextResponse.json({
      message: 'No active members with Slack connected',
      digests: [],
      skipped: [],
    });
  }

  const digests: { memberId: string; name: string; emailCount: number }[] = [];
  const skipped: { memberId: string; name: string; reason: string }[] = [];

  for (const member of members) {
    if (!member.feature_inbox_summaries) {
      skipped.push({ memberId: member.id, name: member.name, reason: 'summaries disabled' });
      continue;
    }

    if (member.summary_weekly_schedule === 'weekday' && !isWeekday) {
      skipped.push({ memberId: member.id, name: member.name, reason: 'weekend (weekday-only)' });
      continue;
    }

    // Check cadence: enough time since last digest?
    if (member.last_digest_sent_at) {
      const hoursSince =
        (nowUTC.getTime() - new Date(member.last_digest_sent_at).getTime()) /
        (1000 * 60 * 60);
      const requiredHours =
        FREQUENCY_HOURS[member.summary_update_frequency as UpdateFrequency] ?? 2;
      if (hoursSince < requiredHours - 0.1) {
        skipped.push({
          memberId: member.id,
          name: member.name,
          reason: `too soon (${hoursSince.toFixed(1)}h < ${requiredHours}h)`,
        });
        continue;
      }
    }

    // Collect undigested T2+ emails
    const { data: undigested } = await supabase
      .from('classified_emails')
      .select('*')
      .eq('team_member_id', member.id)
      .eq('slack_dm_sent', false)
      .gte('tier', 2)
      .order('tier', { ascending: false });

    if (!undigested || undigested.length === 0) {
      skipped.push({ memberId: member.id, name: member.name, reason: 'no undigested emails' });
      continue;
    }

    // Count T1 noise that hasn't been included in a digest yet
    const { count: noiseCount } = await supabase
      .from('classified_emails')
      .select('*', { count: 'exact', head: true })
      .eq('team_member_id', member.id)
      .eq('slack_dm_sent', false)
      .eq('tier', 1);

    const tier4Count = undigested.filter((e) => e.tier === 4).length;
    const tier3Count = undigested.filter((e) => e.tier === 3).length;
    const tier2Count = undigested.filter((e) => e.tier === 2).length;
    const archivedCount = undigested.filter((e) => e.archived).length;
    const draftsCreated = undigested.filter((e) => e.draft_created).length;

    try {
      await sendTriageDigest(
        member.slack_user_id,
        undigested as ClassifiedEmail[],
        {
          totalClassified: undigested.length + (noiseCount ?? 0),
          tier1Count: noiseCount ?? 0,
          tier2Count,
          tier3Count,
          tier4Count,
          archivedCount,
          draftsCreated,
        }
      );

      // Mark all undigested emails (including T1) as sent
      await supabase
        .from('classified_emails')
        .update({ slack_dm_sent: true })
        .eq('team_member_id', member.id)
        .eq('slack_dm_sent', false);

      // Update last digest timestamp
      await supabase
        .from('team_members')
        .update({ last_digest_sent_at: nowUTC.toISOString() })
        .eq('id', member.id);

      digests.push({
        memberId: member.id,
        name: member.name,
        emailCount: undigested.length,
      });
    } catch (err) {
      console.error(`Digest failed for ${member.name}:`, err);
      skipped.push({
        memberId: member.id,
        name: member.name,
        reason: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({ digests, skipped });
}
