import { useState } from 'react'
import { COLOR as X, FONT, CARD } from '../lib/theme'

// =============================================================================
// A dismissible per-role "Getting started" checklist — the software teaching
// itself. Items check off automatically from live data where we can tell.
// =============================================================================
export default function GettingStarted({ storageKey, title = 'Getting started', items }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })
  if (dismissed || !items?.length) return null
  const done = items.filter((i) => i.done).length
  const allDone = done === items.length

  const dismiss = () => {
    try { localStorage.setItem(storageKey, '1') } catch { /* fine */ }
    setDismissed(true)
  }

  return (
    <div style={{ ...CARD, padding: '16px 18px', marginBottom: 18, borderLeft: `4px solid ${X.yellow}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>
          {allDone ? 'You\u2019re all set up' : title}
          <span style={{ color: X.slate, fontWeight: 600, fontSize: 12.5, marginLeft: 8 }}>{done}/{items.length}</span>
        </div>
        <button onClick={dismiss} style={{ background: 'transparent', border: 'none', color: X.slate, fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontFamily: FONT.body }}>Dismiss</button>
      </div>
      <div style={{ height: 6, background: X.stone, borderRadius: 999, margin: '10px 0 12px', overflow: 'hidden' }}>
        <div style={{ width: `${(done / items.length) * 100}%`, height: '100%', background: X.yellow, borderRadius: 999, transition: 'width .4s ease' }} />
      </div>
      {items.map((i, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13.5 }}>
          <span style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: i.done ? X.green : X.stone, color: i.done ? '#FFFFFD' : X.slate }}>
            {i.done ? '✓' : idx + 1}
          </span>
          <span style={{ color: i.done ? X.slate : X.black, textDecoration: i.done ? 'line-through' : 'none', flex: 1 }}>{i.label}</span>
          {!i.done && i.action && (
            <button onClick={i.action} style={{ background: X.black, color: X.white, border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: FONT.body }}>{i.actionLabel || 'Go'}</button>
          )}
        </div>
      ))}
    </div>
  )
}
