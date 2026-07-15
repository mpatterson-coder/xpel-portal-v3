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

// PER-TAB SESSIONS (the multi-login fix): Supabase's default keeps ONE login
// per browser in localStorage, shared by every tab — sign in as someone else
// in a new tab and every open tab silently becomes that user. Storing the
// session in sessionStorage instead gives each TAB its own signed-in user:
// a dealership, an installer, and an admin can run side-by-side. A tab
// refresh keeps its login; a closed tab's login ends, and the account picker
// on the login screen (lib/accounts.js) brings it back with one click.
const perTabStorage = {
  getItem: (k) => window.sessionStorage.getItem(k),
  setItem: (k, v) => window.sessionStorage.setItem(k, v),
  removeItem: (k) => window.sessionStorage.removeItem(k),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: perTabStorage,
    storageKey: 'xpel-portal-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
