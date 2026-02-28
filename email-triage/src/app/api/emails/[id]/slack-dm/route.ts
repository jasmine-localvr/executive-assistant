import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { sendSlackDM } from '@/lib/slack';
import type { ClassifiedEmail, TeamMember } from '@/types';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: email, error: emailError } = await supabase
    .from('classified_emails')
    .select('*, team_members(*)')
    .eq('id', id)
    .eq('team_member_id', session.user.teamMemberId)
    .single();

  if (emailError || !email) {
    return NextResponse.json(
      { error: 'Email not found' },
      { status: 404 }
    );
  }

  const member = email.team_members as unknown as TeamMember;
  if (!member.slack_user_id) {
    return NextResponse.json(
      { error: 'Team member has no Slack user ID configured' },
      { status: 400 }
    );
  }

  try {
    await sendSlackDM(member.slack_user_id, email as unknown as ClassifiedEmail);

    await supabase
      .from('classified_emails')
      .update({ slack_dm_sent: true })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Slack DM error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Slack DM failed' },
      { status: 500 }
    );
  }
}
