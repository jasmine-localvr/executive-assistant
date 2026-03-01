import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runTriagePipeline } from '@/lib/pipeline';

/**
 * Gmail Pub/Sub push notification webhook.
 *
 * Google Cloud Pub/Sub sends a POST when a user's inbox changes.
 * The notification payload (base64-decoded) contains:
 *   { "emailAddress": "user@example.com", "historyId": "12345" }
 *
 * We look up the team member by email and run the pipeline
 * with skipDigest=true (the cron handles digests on cadence).
 */
export async function POST(request: NextRequest) {
  // Auth: verify secret query param matches CRON_SECRET
  const secret = request.nextUrl.searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let emailAddress: string;
  try {
    const body = await request.json();
    const data = JSON.parse(
      Buffer.from(body.message?.data ?? '', 'base64').toString('utf-8')
    );
    emailAddress = data.emailAddress;
  } catch {
    return NextResponse.json(
      { error: 'Invalid Pub/Sub notification' },
      { status: 400 }
    );
  }

  if (!emailAddress) {
    return NextResponse.json(
      { error: 'Missing emailAddress in notification' },
      { status: 400 }
    );
  }

  // Look up the team member
  const { data: member } = await supabase
    .from('team_members')
    .select('id, name, is_active, feature_inbox_management')
    .eq('email', emailAddress.toLowerCase())
    .single();

  if (!member || !member.is_active) {
    // Unknown or inactive user — acknowledge so Pub/Sub doesn't retry
    return NextResponse.json({ message: 'User not found or inactive' });
  }

  if (!member.feature_inbox_management) {
    return NextResponse.json({ message: 'Inbox management disabled for user' });
  }

  // Check if there's already a running pipeline for this member (prevent overlap)
  const { data: running } = await supabase
    .from('triage_runs')
    .select('id')
    .eq('team_member_id', member.id)
    .eq('status', 'running')
    .limit(1);

  if (running && running.length > 0) {
    return NextResponse.json({ message: 'Pipeline already running' });
  }

  try {
    const result = await runTriagePipeline(member.id, {
      emailCount: 20,
      skipDigest: true,
    });
    return NextResponse.json({
      memberId: member.id,
      name: member.name,
      ...result,
    });
  } catch (err) {
    console.error(`Gmail webhook pipeline error for ${emailAddress}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pipeline failed' },
      { status: 500 }
    );
  }
}
