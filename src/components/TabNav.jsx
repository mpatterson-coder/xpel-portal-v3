import { COLOR as X, FONT } from '../lib/theme'

// The tab strip used across role views (visually matches the admin tabs).
export default function TabNav({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {Object.entries(tabs).map(([k, lbl]) => (
        <button key={k} onClick={() => onChange(k)} style={{
          border: `1px solid ${value === k ? X.black : X.gray}`,
          background: value === k ? X.black : '#fff',
          color: value === k ? '#fff' : X.slate,
          borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing,
          cursor: 'pointer', fontFamily: FONT.body,
        }}>{lbl}</button>
      ))}
    </div>
  )
}
