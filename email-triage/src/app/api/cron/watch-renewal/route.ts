import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { setupUserWatch } from '@/lib/gmail';
import type { TeamMember } from '@/types';

/**
 * Daily cron that renews Gmail push notification watches for all active users.
 * Gmail watches expire after 7 days, so running this daily keeps them alive.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLOUD_PROJECT_ID is not set' },
      { status: 500 }
    );
  }

  const topicName = `projects/${projectId}/topics/ea-inbox-notifications`;

  const { data: members, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('is_active', true)
    .eq('feature_inbox_management', true)
    .not('gmail_refresh_token', 'is', null);

  if (error || !members?.length) {
    return NextResponse.json({
      message: 'No active members with Gmail connected',
      renewed: [],
      failed: [],
    });
  }

  const renewed: { memberId: string; name: string; expiration: string }[] = [];
  const failed: { memberId: string; name: string; error: string }[] = [];

  for (const member of members) {
    try {
      const result = await setupUserWatch(member as TeamMember, topicName);
      renewed.push({
        memberId: member.id,
        name: member.name,
        expiration: result.expiration,
      });
    } catch (err) {
      console.error(`Watch renewal failed for ${member.name}:`, err);
      failed.push({
        memberId: member.id,
        name: member.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ renewed, failed });
}
