import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // teamMemberId
  const error = searchParams.get('error');

  if (error || !code || !state) {
    return NextResponse.redirect(
      new URL('/connect-slack?error=slack_denied', request.url)
    );
  }

  // Verify state matches the logged-in user
  if (state !== session.user.teamMemberId) {
    return NextResponse.redirect(
      new URL('/connect-slack?error=state_mismatch', request.url)
    );
  }

  try {
    // Exchange code for token via Slack OAuth V2
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/slack/callback`,
      }),
    });

    const data = await tokenResponse.json();

    if (!data.ok || !data.authed_user?.id) {
      console.error('Slack OAuth error:', JSON.stringify(data, null, 2));
      const errDetail = encodeURIComponent(data.error || 'unknown');
      return NextResponse.redirect(
        new URL(`/connect-slack?error=slack_exchange_failed&detail=${errDetail}`, request.url)
      );
    }

    const slackUserId = data.authed_user.id;

    // Store Slack user ID in team_members
    const supabase = createServerClient();
    const { error: dbError } = await supabase
      .from('team_members')
      .update({ slack_user_id: slackUserId })
      .eq('id', state);

    if (dbError) {
      console.error('Failed to store Slack user ID:', dbError);
      return NextResponse.redirect(
        new URL('/connect-slack?error=db_update_failed', request.url)
      );
    }

    // Redirect back to connect-slack with success flag.
    // The middleware allows /connect-slack through, and the page will
    // trigger a session update to refresh the JWT before redirecting home.
    return NextResponse.redirect(new URL('/connect-slack?connected=true', request.url));
  } catch (err) {
    console.error('Slack OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/connect-slack?error=slack_failed', request.url)
    );
  }
}
