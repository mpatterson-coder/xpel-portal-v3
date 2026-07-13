import { COLOR as X } from '../lib/theme'

// The forward fulfillment path shown as a progress timeline.
// compact  -> thin 5-segment bar (order lists)
// full     -> dots + labels stepper (order detail)
// Colors: done = Carbon Black, current = XPEL Yellow, upcoming = Stone.
const STAGES = [
  ['submitted', 'Submitted'],
  ['in_review', 'In Review'],
  ['approved', 'Approved'],
  ['in_progress', 'In Progress'],
  ['completed', 'Completed'],
]

export default function StatusTimeline({ status, compact = false, style }) {
  const cancelled = status === 'cancelled'
  const idx = Math.max(0, STAGES.findIndex(([k]) => k === status))

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...style }}
        title={cancelled ? 'Order cancelled' : `Stage ${idx + 1} of 5 — ${STAGES[idx][1]}`}>
        {STAGES.map(([k, l], i) => (
          <div key={k} title={l} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: cancelled ? X.stone : i < idx ? X.black : i === idx ? X.yellow : X.stone,
          }} />
        ))}
        {cancelled && (
          <span style={{ fontSize: 10, color: X.red, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Cancelled
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={style}>
      <div style={{ display: 'flex' }}>
        {STAGES.map(([k, l], i) => {
          const done = !cancelled && i < idx
          const current = !cancelled && i === idx
          return (
            <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i > 0 && (
                <div style={{
                  position: 'absolute', top: 6, right: '50%', width: '100%', height: 2,
                  background: done || current ? X.black : X.stone, zIndex: 0,
                }} />
              )}
              <div style={{
                width: 14, height: 14, borderRadius: '50%', zIndex: 1, boxSizing: 'border-box',
                background: current ? X.yellow : done ? X.black : X.white,
                border: `2px solid ${current ? X.yellow : done ? X.black : X.gray}`,
              }} />
              <div style={{
                fontSize: 10, marginTop: 6, textAlign: 'center',
                color: current ? X.black : X.slate, fontWeight: current ? 700 : 400,
              }}>{l}</div>
            </div>
          )
        })}
      </div>
      {cancelled && (
        <div style={{ marginTop: 8, fontSize: 12, color: X.red, fontWeight: 700 }}>Order cancelled</div>
      )}
    </div>
  )
}
