// =============================================================================
// A one-line event bus: lets the always-pinned notification bell (which lives
// in the top bar, outside any dashboard) tell the active dashboard to switch
// tabs and focus a specific order or chat channel.
// =============================================================================
export const navigate = (detail) =>
  window.dispatchEvent(new CustomEvent('xpel:navigate', { detail }))

export const onNavigate = (fn) => {
  const handler = (e) => fn(e.detail || {})
  window.addEventListener('xpel:navigate', handler)
  return () => window.removeEventListener('xpel:navigate', handler)
}
