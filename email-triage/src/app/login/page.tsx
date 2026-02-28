import { auth, signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect('/');

  const params = await searchParams;
  const error = params.error;

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-md border border-brand-border bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl tracking-tight">
            <span className="text-tan-dark">Local</span>
            <span className="text-charcoal">Luxe</span>
          </h1>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-medium-gray">
            Email Triage
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded border border-error/20 bg-error/5 px-4 py-3 text-center text-sm text-error">
            {error === 'AccessDenied'
              ? 'Access denied. Only @golocalvr.com accounts can sign in.'
              : 'Something went wrong. Please try again.'}
          </div>
        )}

        <form
          action={async () => {
            'use server';
            await signIn('google');
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded bg-charcoal px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-charcoal/90"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-light-gray">
          Restricted to @golocalvr.com accounts
        </p>
      </div>
    </div>
  );
}
