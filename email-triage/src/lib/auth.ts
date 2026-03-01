import NextAuth from 'next-auth';
import { encrypt } from './encryption';
import { createServerClient } from './supabase';
import { setupUserWatchWithToken } from './gmail';
import authConfig from './auth.config';

// Full auth config with server-only callbacks (uses Node.js crypto via encrypt).
// API routes and server components import from here.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ profile }) {
      // Only allow @golocalvr.com emails
      return profile?.email?.endsWith('@golocalvr.com') ?? false;
    },

    async jwt({ token, account, profile, trigger }) {
      // On session update (e.g. after Slack connection), re-fetch from DB
      if (trigger === 'update' && token.teamMemberId) {
        const supabase = createServerClient();
        const { data } = await supabase
          .from('team_members')
          .select('slack_user_id')
          .eq('id', token.teamMemberId)
          .single();

        token.slackUserId = data?.slack_user_id ?? null;
        return token;
      }

      // On initial sign-in: store Gmail tokens and upsert team member
      if (account && profile?.email) {
        const supabase = createServerClient();

        const upsertData: Record<string, unknown> = {
          email: profile.email,
          name: profile.name ?? profile.email,
          avatar_url: profile.picture ?? null,
          gmail_access_token: account.access_token
            ? encrypt(account.access_token)
            : null,
          gmail_token_expiry: account.expires_at
            ? new Date(account.expires_at * 1000).toISOString()
            : null,
          last_login_at: new Date().toISOString(),
          is_active: true,
        };

        // Only store refresh token if provided (Google only sends it on first consent)
        if (account.refresh_token) {
          upsertData.gmail_refresh_token = encrypt(account.refresh_token);
        }

        const { data, error } = await supabase
          .from('team_members')
          .upsert(upsertData, { onConflict: 'email' })
          .select('id, slack_user_id')
          .single();

        // Set up Gmail push notifications for instant email processing
        if (account.access_token && process.env.GOOGLE_CLOUD_PROJECT_ID) {
          try {
            const topicName = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/ea-inbox-notifications`;
            await setupUserWatchWithToken(account.access_token, topicName);
          } catch (watchErr) {
            console.error('Gmail watch setup on sign-in failed:', watchErr);
          }
        }

        if (error) {
          console.error('Failed to upsert team member:', error);
          // Fallback: try to find existing member by email
          const { data: existing } = await supabase
            .from('team_members')
            .select('id, slack_user_id')
            .eq('email', profile.email)
            .single();
          token.teamMemberId = existing?.id;
          token.slackUserId = existing?.slack_user_id ?? null;
        } else {
          token.teamMemberId = data?.id;
          token.slackUserId = data?.slack_user_id ?? null;
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.teamMemberId = token.teamMemberId as string;
      session.user.slackConnected = !!token.slackUserId;
      return session;
    },
  },
});
