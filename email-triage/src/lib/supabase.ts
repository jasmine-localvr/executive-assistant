import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use a permissive Database type until we generate proper Supabase types.
// This allows .from('table').update/insert/select to accept any shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

// Client for browser-side usage (respects RLS)
export function createBrowserClient(): SupabaseClient<DB> {
  return createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Client for server-side usage (bypasses RLS)
export function createServerClient(): SupabaseClient<DB> {
  return createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Lazy singleton — avoids crash during build when env vars are empty
let _supabase: SupabaseClient<DB> | null = null;

export const supabase = new Proxy({} as SupabaseClient<DB>, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createServerClient();
    }
    return (_supabase as unknown as Record<string | symbol, unknown>)[prop];
  },
});
