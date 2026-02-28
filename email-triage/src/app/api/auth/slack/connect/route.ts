import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL!));
  }

  // Get team member ID — prefer session, fall back to DB lookup
  let memberId = session.user.teamMemberId;
  if (!memberId) {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('team_members')
      .select('id')
      .eq('email', session.user.email)
      .single();
    memberId = data?.id;
  }

  if (!memberId) {
    return NextResponse.redirect(
      new URL('/connect-slack?error=no_member', process.env.NEXT_PUBLIC_APP_URL!)
    );
  }

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    user_scope: 'identity.basic',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/slack/callback`,
    state: memberId,
  });

  return NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`
  );
}
