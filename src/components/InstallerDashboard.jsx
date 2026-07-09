import { useEffect, useState } from 'react'
import { getOrders, getOrderDetail, updateOrderStatus, setOrderWorkOrder } from '../lib/db'
import { usePersistentState } from '../lib/uiState'
import { dateUS } from '../lib/theme'

const X = { yellow: '#FDB521', black: '#000', teal: '#1A9392', slate: '#505A72', red: '#C94543', gray: '#D1D3D5', green: '#2E7D5B' }
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TONE = { submitted: X.slate, in_review: X.teal, approved: X.teal, in_progress: X.yellow, completed: X.green, cancelled: X.red }
// The forward fulfillment path an installer walks an order through.
const NEXT = { submitted: 'in_review', in_review: 'approved', approved: 'in_progress', in_progress: 'completed' }
const FILTERS = { active: 'Active', completed: 'Completed', all: 'All' }

// The Installer view: the group's fulfillment queue. RLS scopes getOrders() to
// the installer's own group automatically (no Lithia orders for a Penske
// installer, and vice-versa). Installers advance status and need the DAP work
// order number, which is flagged when missing (matches DPV1).
export default function InstallerDashboard() {
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = usePersistentState('xpel.installer.filter', 'active')
  const [err, setErr] = useState('')

  const load = () => getOrders().then(setOrders).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const shown = orders.filter((o) => {
    if (filter === 'all') return true
    if (filter === 'completed') return o.status === 'completed' || o.status === 'cancelled'
    return o.status !== 'completed' && o.status !== 'cancelled'
  })

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Fulfillment Queue</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.entries(FILTERS).map(([k, lbl]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ ...tab, ...(filter === k ? tabOn : {}) }}>{lbl}</button>
          ))}
        </div>
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      <div style={{ background: '#fff', border: `1px solid ${X.gray}`, borderRadius: 10, padding: 8 }}>
        {shown.length === 0 && <div style={{ color: X.slate, padding: 16, fontSize: 14 }}>Nothing in this view.</div>}
        {shown.map((o) => <QueueRow key={o.id} order={o} onChanged={load} />)}
      </div>
    </div>
  )
}

function QueueRow({ order, onChanged }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dapDraft, setDapDraft] = useState(order.dap_work_order || '')
  const missingDap = !order.dap_work_order

  async function saveDap() {
    setBusy(true)
    try { await setOrderWorkOrder(order.id, dapDraft.trim() || null); await onChanged() } finally { setBusy(false) }
  }

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !detail) {
      try { setDetail(await getOrderDetail(order.id)) } catch (e) { setDetail({ error: e.message }) }
    }
  }
  async function advance(status) {
    setBusy(true)
    try { await updateOrderStatus(order.id, status); await onChanged() } finally { setBusy(false) }
  }

  const next = NEXT[order.status]

  return (
    <div style={{ borderBottom: `1px solid ${X.gray}`, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: X.slate, width: 92 }}>{order.order_number}</div>
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={toggle}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{order.customer_name || '—'}</div>
          <div style={{ fontSize: 12, color: X.slate }}>
            {[order.vehicle_year, order.vehicle_make, order.vehicle_model, order.vehicle_trim].filter(Boolean).join(' ') || 'Vehicle not entered'}
            {order.vehicle_size ? ` · ${order.vehicle_size}` : ''}
          </div>
        </div>
        {order.pickup_date && (
          <span style={{ ...flag, color: X.black, background: '#FFF3D6', border: `1px solid ${X.yellow}` }}>
            Avail&nbsp;{dateUS(order.pickup_date)}
          </span>
        )}
        {missingDap
          ? <span style={{ ...flag, color: '#fff', background: X.red }}>DAP&nbsp;#&nbsp;Missing</span>
          : <span style={{ ...flag, color: X.slate, border: `1px solid ${X.gray}` }}>DAP&nbsp;{order.dap_work_order}</span>}
        <Badge status={order.status} />
        {next && (
          <button disabled={busy} onClick={() => advance(next)} style={advBtn}>
            Mark {next.replace('_', ' ')} →
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10, padding: 12, background: '#FAFBFC', borderRadius: 8 }}>
          {!detail && <div style={{ color: X.slate, fontSize: 13 }}>Loading…</div>}
          {detail?.error && <div style={{ color: X.red, fontSize: 13 }}>{detail.error}</div>}
          {detail && !detail.error && (
            <>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, marginBottom: 6 }}>Customer</div>
              <div style={{ fontSize: 14, marginBottom: 14 }}>
                <div style={{ fontWeight: 600 }}>{order.customer_name || '—'}</div>
                {(order.customer_phone || order.customer_email) && (
                  <div style={{ fontSize: 13, color: X.slate }}>
                    {[order.customer_phone, order.customer_email].filter(Boolean).join(' · ')}
                  </div>
                )}
                {order.pickup_date && (
                  <div style={{ fontSize: 13, color: X.slate }}>Vehicle available for pick-up: {dateUS(order.pickup_date)}</div>
                )}
              </div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, marginBottom: 6 }}>DAP work order #</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, maxWidth: 340 }}>
                <input value={dapDraft} onChange={(e) => setDapDraft(e.target.value)} placeholder="Enter DAP work order number"
                  style={{ flex: 1, border: `1px solid ${X.gray}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: "'Jost', sans-serif" }} />
                <button disabled={busy || (dapDraft.trim() === (order.dap_work_order || ''))} onClick={saveDap}
                  style={{ ...advBtn, opacity: busy || (dapDraft.trim() === (order.dap_work_order || '')) ? 0.5 : 1 }}>Save</button>
              </div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, marginBottom: 6 }}>Coverage</div>
              {detail.items.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '2px 0' }}>
                  <span>{it.quantity} × {it.product?.name}</span><span>{money(it.line_total)}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, margin: '12px 0 6px' }}>Status history</div>
              {detail.history.map((h) => (
                <div key={h.id} style={{ fontSize: 12, color: X.slate, fontFamily: "'Jost', sans-serif" }}>
                  {new Date(h.created_at).toLocaleString()} — {h.status.replace('_', ' ')}
                </div>
              ))}
              {order.status !== 'cancelled' && order.status !== 'completed' && (
                <button disabled={busy} onClick={() => advance('cancelled')} style={cancelLink}>Cancel order</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Badge({ status }) {
  return <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: status === 'in_progress' ? X.black : '#fff', background: TONE[status] || X.slate, borderRadius: 4, padding: '3px 8px', width: 92, textAlign: 'center' }}>{(status || '').replace('_', ' ')}</span>
}

const tab = { border: `1px solid ${X.gray}`, background: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: "'Jost', sans-serif" }
const tabOn = { background: X.black, color: '#fff', borderColor: X.black }
const flag = { fontFamily: "'Jost', sans-serif", fontSize: 11, borderRadius: 4, padding: '3px 8px' }
const advBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 6, padding: '7px 12px', fontWeight: 700, fontSize: 12, textTransform: 'capitalize', cursor: 'pointer', fontFamily: "'Jost', sans-serif" }
const cancelLink = { marginTop: 12, background: 'transparent', border: 'none', color: X.red, fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }
