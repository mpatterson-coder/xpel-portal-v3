import { COLOR as X, FONT, STATUS_TONE, money, dateUS } from '../lib/theme'
import StatusTimeline from './StatusTimeline'

// Presentational list of orders. The parent decides which orders to pass in;
// RLS already guarantees the user only receives orders they're allowed to see.
export default function OrdersList({ orders, title = 'Orders' }) {
  return (
    <div style={{ background: X.panel, border: `1px solid ${X.line}`, borderRadius: 10, padding: 24 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: FONT.headingWeight }}>{title}</h2>
      {(!orders || orders.length === 0) && <div style={{ color: X.slate, fontSize: 14 }}>No orders yet.</div>}
      {orders?.map((o) => (
        <div key={o.id} style={{ padding: '10px 0', borderTop: `1px solid ${X.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: FONT.body, fontSize: 12, color: X.slate, width: 96 }}>{o.order_number}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{o.customer_name || '—'}</div>
            <div style={{ fontSize: 12, color: X.slate }}>
              {[o.vehicle_year, o.vehicle_make, o.vehicle_model, o.vehicle_trim].filter(Boolean).join(' ') || 'Vehicle not entered'}
              {o.vehicle_size ? ` · ${o.vehicle_size}` : ''}
              {o.pickup_date ? ` · Avail ${dateUS(o.pickup_date)}` : ''}
            </div>
          </div>
            <div style={{ width: 90, textAlign: 'right', fontWeight: 700 }}>{money(o.total_amount)}</div>
            <Badge status={o.status} />
          </div>
          <StatusTimeline status={o.status} compact style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}

function Badge({ status }) {
  const t = STATUS_TONE[status] || STATUS_TONE.submitted
  return (
    <span style={{
      fontFamily: FONT.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
      color: t.fg, background: t.bg,
      borderRadius: 4, padding: '3px 8px', width: 92, textAlign: 'center',
    }}>{(status || '').replace('_', ' ')}</span>
  )
}
