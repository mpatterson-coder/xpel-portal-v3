// =============================================================================
// Remembered accounts — powers the "Continue as …" picker on the login screen.
//
// Sessions themselves are per-tab (see supabaseClient.js). This module keeps a
// small directory of recently signed-in people in localStorage so a fresh tab
// can resume any of them with one click instead of a password. The security
// model is unchanged from an ordinary web login: these are the same tokens
// Supabase would normally keep in localStorage — one per person instead of
// one per browser. "Sign out" removes that person from the picker.
// =============================================================================
const KEY = 'xpel-portal-accounts'

function readAll() {
  try { return JSON.parse(window.localStorage.getItem(KEY)) ?? {} } catch { return {} }
}
function writeAll(map) {
  try { window.localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* blocked storage: picker simply won't remember */ }
}

export function listAccounts() {
  return Object.values(readAll()).sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
}

// Called on every sign-in AND every token refresh, so the stored tokens stay
// as fresh as the most recently active tab for that person.
export function rememberAccount(session, extra = {}) {
  if (!session?.user?.id || !session.refresh_token) return
  const map = readAll()
  const prev = map[session.user.id] ?? {}
  map[session.user.id] = {
    ...prev,
    id: session.user.id,
    email: session.user.email ?? prev.email ?? '',
    ...extra,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    updated_at: Date.now(),
  }
  writeAll(map)
}

export function updateAccountInfo(userId, extra) {
  const map = readAll()
  if (!map[userId]) return
  map[userId] = { ...map[userId], ...extra }
  writeAll(map)
}

export function forgetAccount(userId) {
  const map = readAll()
  delete map[userId]
  writeAll(map)
}
