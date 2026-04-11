'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';

function DropdownMenu({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isGroupActive = items.some((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1 transition-colors ${
          isGroupActive
            ? 'text-charcoal font-semibold'
            : 'text-dark-gray hover:text-charcoal'
        }`}
      >
        {label}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 min-w-[160px] rounded-lg border border-brand-border bg-white py-1.5 shadow-lg">
          {items.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-cream text-charcoal font-semibold'
                    : 'text-dark-gray hover:bg-cream/50 hover:text-charcoal'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
            Exec Assistant
          </span>
        </Link>

        {session?.user && (
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-6 text-sm font-medium">
              <DropdownMenu
                label="Emails"
                items={[
                  { href: '/', label: 'Dashboard' },
                  { href: '/history', label: 'History' },
                  { href: '/cleanup', label: 'Cleanup' },
                ]}
              />
              <DropdownMenu
                label="Tools"
                items={[
                  { href: '/todos', label: 'Todos' },
                  { href: '/contacts', label: 'Contacts' },
                  { href: '/chat', label: 'Chat' },
                  { href: '/ea', label: 'Scheduling' },
                ]}
              />
              <DropdownMenu
                label="Settings"
                items={[
                  { href: '/features', label: 'Features' },
                  { href: '/settings', label: 'Team Settings' },
                ]}
              />
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
