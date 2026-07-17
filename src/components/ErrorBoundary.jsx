import { Component } from 'react'
import { COLOR as X, FONT, CARD } from '../lib/theme'

// =============================================================================
// Safety net: if any screen throws while rendering, React normally unmounts
// the ENTIRE app — a blank white page with no way back, made worse here by the
// portal remembering the crashed view and restoring it on every reload. This
// boundary catches the crash instead: the app shell survives, the real error
// message is shown (screenshot-able), and one click clears this tab's
// remembered view state and reloads fresh.
// =============================================================================
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) { console.error('View crashed:', error, info) }

  reset = () => {
    try {
      // Clear remembered views/filters/drafts so the crash can't resurrect
      // itself on reload. (Login/session state lives under different keys and
      // is untouched — nobody gets signed out.)
      const doomed = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i)
        if (k && k.startsWith('xpel.')) doomed.push(k)
      }
      doomed.forEach((k) => window.sessionStorage.removeItem(k))
    } catch { /* storage unavailable — a plain reload is still worth trying */ }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="x-fade" style={{ ...CARD, maxWidth: 640, margin: '40px auto', padding: '32px 30px', fontFamily: FONT.body }}>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>This view hit a snag.</div>
        <div style={{ fontSize: 13.5, color: X.slate, lineHeight: 1.55, marginBottom: 14 }}>
          The rest of the portal is fine — this screen crashed while drawing. The button below
          clears this tab's remembered view and reloads (you stay signed in). If it happens
          again, screenshot the message here:
        </div>
        <pre style={{ background: '#F7F5EF', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '12px 14px', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: X.red, margin: '0 0 16px', fontFamily: 'ui-monospace, Menlo, monospace' }}>
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <button onClick={this.reset} style={{ background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '12px 20px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', fontFamily: FONT.body }}>
          Reset &amp; reload this view
        </button>
      </div>
    )
  }
}
