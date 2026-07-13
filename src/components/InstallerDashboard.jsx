import { useEffect, useState } from 'react'
import { getOrders, getOrderDetail, updateOrderStatus, setOrderWorkOrder } from '../lib/db'
import { usePersistentState } from '../lib/uiState'
import { COLOR as X, FONT, STATUS_TONE, money, dateUS } from '../lib/theme'
import StatusTimeline from './StatusTimeline'
import TabNav from './TabNav'
import PerformanceDashboard from './PerformanceDashboard'

const STATUS_LABELS = {
  submitted: 'Submitted', in_review: 'In Review', approved: 'Approved',
  in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
}
const FILTERS = { active: 'Active', completed: 'Completed', all: 'All' }

// The Installer view: the group's fulfillment queue plus a shop performance
// dashboard. RLS scopes everything to the installer's own group.
//
// MONEY RULE for this whole view: installers see WHOLESALE amounts only (what
// the shop bills the dealership). The consumer retail price never appears here.
export default function InstallerDashboard() {
  const [view, setView] = usePersistentState('xpel.installer.view', 'queue')
  return (
    <div style={{ maxWidth: 1000 }}>
      <TabNav tabs={{ queue: 'Fulfillment Queue', performance: 'Performance' }} value={view} onChange={setView} />
      {view === 'queue' && <QueueView />}
      {view === 'performance' && <PerformanceDashboard mode="installer" />}
    </div>
  )
}

function QueueView() {
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
    <div>
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

  // The status control is a dropdown so the shop can move an order BOTH ways —
  // e.g. pull one back from In Progress to Approved if a bay frees up wrong,
  // or resurrect a cancelled order. Every change still lands in the history
  // log (database trigger) and fires the customer/dealer notifications.
  async function setStatus(status) {
    if (status === order.status) return
    setBusy(true)
    try { await updateOrderStatus(order.id, status); await onChanged() } finally { setBusy(false) }
  }

  // Wholesale amount for this order (installer's billing view).
  const wholesale = detail && !detail.error
    ? detail.items.reduce((s, it) => s + Number(it.product?.cost || 0) * it.quantity, 0)
    : null

  return (
    <div style={{ borderBottom: `1px solid ${X.gray}`, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: FONT.body, fontSize: 12, color: X.slate, width: 92 }}>{order.order_number}</div>
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
        <select value={order.status} disabled={busy} onChange={(e) => setStatus(e.target.value)} style={statusSel} title="Set order status">
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {open && (
        <div style={{ marginTop: 10, padding: 14, background: X.bg, borderRadius: 8 }}>
          {!detail && <div style={{ color: X.slate, fontSize: 13 }}>Loading…</div>}
          {detail?.error && <div style={{ color: X.red, fontSize: 13 }}>{detail.error}</div>}
          {detail && !detail.error && (
            <>
              <StatusTimeline status={order.status} style={{ margin: '4px 0 18px', maxWidth: 560 }} />
              <div style={secLbl}>Customer</div>
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
              <div style={secLbl}>DAP work order #</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, maxWidth: 340 }}>
                <input value={dapDraft} onChange={(e) => setDapDraft(e.target.value)} placeholder="Enter DAP work order number"
                  style={{ flex: 1, border: `1px solid ${X.gray}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: FONT.body }} />
                <button disabled={busy || (dapDraft.trim() === (order.dap_work_order || ''))} onClick={saveDap}
                  style={{ ...saveBtn, opacity: busy || (dapDraft.trim() === (order.dap_work_order || '')) ? 0.5 : 1 }}>Save</button>
              </div>
              <div style={secLbl}>Coverage — wholesale (billed to dealership)</div>
              {detail.items.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '2px 0' }}>
                  <span>{it.quantity} × {it.product?.name}</span>
                  <span>{money(Number(it.product?.cost || 0) * it.quantity)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, padding: '6px 0', borderTop: `1px solid ${X.stone}`, marginTop: 4 }}>
                <span>Wholesale total</span><span>{money(wholesale)}</span>
              </div>
              <div style={{ ...secLbl, margin: '12px 0 6px' }}>Status history</div>
              {detail.history.map((h) => (
                <div key={h.id} style={{ fontSize: 12, color: X.slate, fontFamily: FONT.body }}>
                  {new Date(h.created_at).toLocaleString()} — {STATUS_LABELS[h.status] ?? h.status}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Badge({ status }) {
  const t = STATUS_TONE[status] || STATUS_TONE.submitted
  return <span style={{ fontFamily: FONT.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: t.fg, background: t.bg, borderRadius: 4, padding: '3px 8px', width: 92, textAlign: 'center' }}>{(status || '').replace('_', ' ')}</span>
}

const secLbl = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, marginBottom: 6 }
const tab = { border: `1px solid ${X.gray}`, background: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
const tabOn = { background: X.black, color: '#fff', borderColor: X.black }
const flag = { fontFamily: FONT.body, fontSize: 11, borderRadius: 4, padding: '3px 8px' }
const statusSel = { border: `1px solid ${X.gray}`, background: '#fff', borderRadius: 6, padding: '7px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT.body, color: X.black }
const saveBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 6, padding: '7px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
