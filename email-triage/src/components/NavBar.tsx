'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function NavBar() {
  const { data: session } = useSession();

  return (
    <nav className="border-b border-brand-border bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-serif text-xl tracking-tight">
            <span className="text-tan-dark">Local</span>
            <span className="text-charcoal">Luxe</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-medium-gray">
            Email Triage
          </span>
        </Link>

        {session?.user && (
          <div className="flex items-center gap-6">
            <div className="flex gap-6 text-sm font-medium">
              <Link
                href="/"
                className="text-dark-gray transition-colors hover:text-charcoal"
              >
                Dashboard
              </Link>
              <Link
                href="/history"
                className="text-dark-gray transition-colors hover:text-charcoal"
              >
                History
              </Link>
              <Link
                href="/features"
                className="text-dark-gray transition-colors hover:text-charcoal"
              >
                Features
              </Link>
              <Link
                href="/ea"
                className="text-dark-gray transition-colors hover:text-charcoal"
              >
                EA
              </Link>
              <Link
                href="/settings"
                className="text-dark-gray transition-colors hover:text-charcoal"
              >
                Settings
              </Link>
            </div>

            <div className="flex items-center gap-3 border-l border-brand-border pl-6">
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt=""
                  className="h-7 w-7 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="text-sm text-dark-gray">
                {session.user.name}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-xs font-medium text-medium-gray transition-colors hover:text-charcoal"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
