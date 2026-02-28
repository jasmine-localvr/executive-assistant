import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default async function ConnectSlackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.slackConnected) redirect('/');

  const params = await searchParams;
  const error = params.error;

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md rounded-md border border-brand-border bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="mb-2 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-light">
            <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="font-serif text-xl text-charcoal">Gmail Connected</h1>
          <p className="mt-2 text-sm text-medium-gray">
            Your Gmail account is linked. Now connect Slack to receive
            priority email notifications via direct message.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded border border-error/20 bg-error/5 px-4 py-3 text-center text-sm text-error">
            Failed to connect Slack. Please try again.
          </div>
        )}

        <div className="mt-8 space-y-3">
          <a
            href="/api/auth/slack/connect"
            className="flex w-full items-center justify-center gap-3 rounded bg-charcoal px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-charcoal/90"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z" />
            </svg>
            Connect Slack
          </a>

          <form
            action={async () => {
              'use server';
              const cookieStore = await cookies();
              cookieStore.set('slack_skipped', '1', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7, // 7 days
              });
              redirect('/');
            }}
          >
            <button
              type="submit"
              className="w-full rounded border border-brand-border bg-white px-5 py-3 text-sm font-medium text-medium-gray transition-colors hover:border-tan hover:text-charcoal"
            >
              Skip for now
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-light-gray">
          You can connect Slack later from Settings.
        </p>
      </div>
    </div>
  );
}
