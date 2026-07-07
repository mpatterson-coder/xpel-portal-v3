import { createClient } from '@supabase/supabase-js'

// These come from your .env file (see .env.example). The anon key is safe to
// ship to the browser — all real protection is enforced by Row-Level Security
// in the database, which we validated. NEVER put the service_role key here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Exported for the admin "create user" flow, which needs a second, throwaway
// client so signing UP a new user doesn't sign OUT the admin.
export { supabaseUrl, supabaseAnonKey }

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly during local dev if env vars are missing.
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
