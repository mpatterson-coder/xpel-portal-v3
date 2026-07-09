import { dateUS } from '../lib/theme'

const X = { yellow: '#FDB521', black: '#000', teal: '#1A9392', slate: '#505A72', red: '#C94543', gray: '#D1D3D5', green: '#2E7D5B' }
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TONE = {
  submitted: X.slate, in_review: X.teal, approved: X.teal,
  in_progress: X.yellow, completed: X.green, cancelled: X.red,
}

// Presentational list of orders. The parent decides which orders to pass in;
// RLS already guarantees the user only receives orders they're allowed to see.
export default function OrdersList({ orders, title = 'Orders' }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${X.gray}`, borderRadius: 10, padding: 24 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>{title}</h2>
      {(!orders || orders.length === 0) && <div style={{ color: X.slate, fontSize: 14 }}>No orders yet.</div>}
      {orders?.map((o) => (
        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${X.gray}` }}>
          <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: X.slate, width: 96 }}>{o.order_number}</div>
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
      ))}
    </div>
  )
}

function Badge({ status }) {
  return (
    <span style={{
      fontFamily: "'Jost', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
      color: status === 'in_progress' ? X.black : '#fff', background: TONE[status] || X.slate,
      borderRadius: 4, padding: '3px 8px', width: 92, textAlign: 'center',
    }}>{(status || '').replace('_', ' ')}</span>
  )
}
