import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';

// Edge-compatible auth config (no Node.js crypto imports).
// Used by middleware for session checks only.
export default {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.labels https://www.googleapis.com/auth/calendar.events',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    // Expose custom JWT fields to the session so middleware can read them.
    // This must stay edge-compatible (no Node.js APIs).
    session({ session, token }) {
      session.user.teamMemberId = token.teamMemberId as string;
      session.user.slackConnected = !!token.slackUserId;
      return session;
    },
  },
} satisfies NextAuthConfig;
