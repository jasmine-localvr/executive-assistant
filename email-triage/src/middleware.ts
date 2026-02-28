import NextAuth from 'next-auth';
import authConfig from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);
import { NextResponse } from 'next/server';

const publicPaths = ['/login', '/api/auth', '/api/cron', '/api/ea/webhook', '/api/slack/events'];

function isPublic(pathname: string) {
  return publicPaths.some((p) => pathname.startsWith(p));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Allow public paths through
  if (isPublic(pathname)) {
    // Redirect logged-in users away from login page
    if (isLoggedIn && pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // If logged in but Slack not connected, nudge to connect-slack
  // (skip if already there, or if user previously skipped)
  const slackConnected = req.auth?.user?.slackConnected;
  const isConnectSlack = pathname === '/connect-slack';
  const isSlackAuth = pathname.startsWith('/api/auth/slack');

  if (!slackConnected && !isConnectSlack && !isSlackAuth) {
    // Check for skip cookie — user chose "Skip for now"
    const skipped = req.cookies.get('slack_skipped')?.value === '1';
    if (!skipped) {
      return NextResponse.redirect(new URL('/connect-slack', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
