'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function SlackConnectedRedirect() {
  const { update } = useSession();
  const router = useRouter();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    // Refresh the JWT so slackConnected becomes true, then go home
    update().then(() => router.replace('/'));
  }, [update, router]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md rounded-md border border-brand-border bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="mb-2 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-light">
            <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="font-serif text-xl text-charcoal">Slack Connected</h1>
          <p className="mt-2 text-sm text-medium-gray">Redirecting to dashboard&hellip;</p>
        </div>
      </div>
    </div>
  );
}
