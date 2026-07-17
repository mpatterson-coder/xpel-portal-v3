import { useCallback, useEffect, useState } from 'react'
import { getUnreadState } from './db'

const BASE_TITLE = 'XPEL Dealership Portal'

// =============================================================================
// Global unread-messages state for a dashboard. Refreshes every 30 seconds,
// again the moment the browser tab regains focus, and instantly whenever a
// channel is read. The total is mirrored into the browser tab's title —
// "(2) XPEL Dealership Portal" — so new messages are visible even while
// working in another tab entirely.
// =============================================================================
export function useUnread(profileId) {
  const [unread, setUnread] = useState({ counts: new Map(), total: 0 })

  const refresh = useCallback(() => {
    if (!profileId) return
    getUnreadState(profileId).then(setUnread).catch(() => {})
  }, [profileId])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30000)
    const onFocus = () => { if (!document.hidden) refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    document.title = unread.total > 0 ? `(${unread.total}) ${BASE_TITLE}` : BASE_TITLE
    return () => { document.title = BASE_TITLE }
  }, [unread.total])

  return { unread, refresh }
}
