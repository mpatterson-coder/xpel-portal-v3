import { COLOR as X, FONT, ELEV } from '../lib/theme'

// Segmented control (iOS-style): a recessed Stone track with the active
// segment floating on it as an Off-White pill. Used for role views, queue
// filters, and the admin's order-status filter — one consistent gesture.
export default function TabNav({ tabs, value, onChange, style }) {
  return (
    <div style={{
      display: 'inline-flex', flexWrap: 'wrap', gap: 2,
      background: '#ECEAE2', borderRadius: 12, padding: 4, marginBottom: 18, ...style,
    }}>
      {Object.entries(tabs).map(([k, lbl]) => {
        const on = value === k
        return (
          <button key={k} onClick={() => onChange(k)} style={{
            border: 'none', borderRadius: 9, padding: '8px 16px',
            fontSize: 13, fontWeight: on ? 700 : 600, letterSpacing: '0.01em',
            cursor: 'pointer', fontFamily: FONT.body,
            background: on ? X.panel : 'transparent',
            color: on ? X.black : X.slate,
            boxShadow: on ? ELEV.seg : 'none',
          }}>{lbl}</button>
        )
      })}
    </div>
  )
}
