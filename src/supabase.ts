import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Server-side only. The service-role key bypasses RLS — never import this into
// anything that ships to a browser.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
