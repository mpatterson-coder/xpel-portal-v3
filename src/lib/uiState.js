import { useEffect, useState } from 'react'

// =============================================================================
// "Remember where I was" helper.
//
// usePersistentState works exactly like React's useState, except the value is
// also saved in THIS browser tab's sessionStorage. If the page ever fully
// reloads (manual refresh, or the browser suspending and restoring a
// background tab), the screen comes back exactly where the user left it —
// active tab, filter, even an in-progress order draft — instead of resetting
// to its home view.
//
// Storage is per-tab and clears automatically when the tab is closed, so
// nothing lingers on shared computers. If storage is unavailable (some
// private-browsing modes), it silently falls back to normal in-memory state.
// =============================================================================

export function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.sessionStorage.getItem(key)
      return raw === null ? initialValue : JSON.parse(raw)
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable — state still works in memory for this session */
    }
  }, [key, value])

  return [value, setValue]
}
