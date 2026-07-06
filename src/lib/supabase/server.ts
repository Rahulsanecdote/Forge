import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for route handlers and server components.
 * Uses the public URL + anon key — RLS governs what this client can do
 * (e.g. anon INSERT into `leads`, nothing else).
 *
 * Fails closed: throws at call time if the env contract is not met.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — see docs/ENVIRONMENT_CONTRACT.md'
    );
  }

  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false },
  });
}
