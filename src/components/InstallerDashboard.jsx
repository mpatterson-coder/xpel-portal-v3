import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getOrders, getOrderDetail, updateOrderStatus, setOrderWorkOrder, getDealerships } from '../lib/db'
import { getAllPrograms, getAllProducts, setDealershipProgram } from '../lib/adminDb'
import { usePersistentState } from '../lib/uiState'
import ProgramsAdmin from './ProgramsAdmin'
import InstallerCatalog from './InstallerCatalog'
import MessagesHub from './MessagesHub'
import { Spinner } from './ui'
import { COLOR as X, FONT, CARD, STATUS_TONE, money, dateUS } from '../lib/theme'
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
      <TabNav tabs={{ queue: 'Fulfillment Queue', stores: 'My Stores', packages: 'My Packages', programs: 'Programs', messages: 'Messages', performance: 'Performance' }} value={view} onChange={setView} />
      {view === 'queue' && <QueueView />}
      {view === 'stores' && <StoresView />}
      {view === 'packages' && <InstallerCatalog />}
      {view === 'programs' && <ProgramsView />}
      {view === 'messages' && <MessagesHub mode="installer" />}
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
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: FONT.headingWeight }}>Fulfillment Queue</h2>
        <TabNav tabs={FILTERS} value={filter} onChange={setFilter} style={{ marginBottom: 0 }} />
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      <div style={{ ...CARD, padding: 8, overflow: 'hidden' }}>
        {shown.length === 0 && <div style={{ color: X.slate, padding: 16, fontSize: 14 }}>All clear — nothing in this view.</div>}
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
    ? detail.items.reduce((s, it) => s + Number(it.unit_cost ?? it.product?.cost ?? 0) * it.quantity, 0)
    : null

  return (
    <div style={{ borderBottom: `1px solid ${X.line}`, padding: '11px 12px' }}>
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
        <div className="x-fade" style={{ marginTop: 10, padding: 16, background: X.bg, borderRadius: 12 }}>
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
                  <span>
                    {it.quantity} × {it.product?.name}
                    {detail.aliases?.[it.product_id] && detail.aliases[it.product_id] !== it.product?.name && (
                      <span style={{ color: X.slate, fontSize: 12 }}> · listed at the store as “{detail.aliases[it.product_id]}”</span>
                    )}
                  </span>
                  <span>{money(Number(it.unit_cost ?? it.product?.cost ?? 0) * it.quantity)}</span>
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
  return <span style={{ fontFamily: FONT.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: t.fg, background: t.bg, borderRadius: 999, padding: '4px 11px', width: 96, textAlign: 'center', fontWeight: 700 }}>{(status || '').replace('_', ' ')}</span>
}

// Every rooftop this shop services: assign one of the shop's programs to set
// the store's package menu and the shop's wholesale. Retail stays the store's.
function StoresView() {
  const { dealerId } = useAuth()
  const [stores, setStores] = useState(null)
  const [programs, setPrograms] = useState([])
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = () =>
    Promise.all([getDealerships(), getAllPrograms()])
      .then(([s, p]) => { setStores(s); setPrograms(p) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const own = programs.filter((p) => p.authorized_dealer_id === dealerId)

  async function setProgram(store, v) {
    setBusyId(store.id)
    try { await setDealershipProgram(store.id, v || null); await load() }
    catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: FONT.headingWeight }}>My Stores</h2>
      <div style={{ fontSize: 13, color: X.slate, marginBottom: 12, maxWidth: 680 }}>
        The dealership rooftops your shop services. Assign one of <b>your programs</b> to set a store's
        package menu and your wholesale rates; each store manages its own retail pricing.
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      {stores === null && <Spinner />}
      {stores !== null && stores.length === 0 && (
        <div style={{ ...CARD, padding: 18, color: X.slate, fontSize: 14 }}>
          No rooftops are assigned to your shop yet — XPEL manages those assignments.
        </div>
      )}
      {stores !== null && stores.length > 0 && (
        <div style={{ ...CARD, padding: 8, overflow: 'hidden' }}>
          {stores.map((store) => {
            const foreign = store.program_id && !own.some((p) => p.id === store.program_id)
            return (
              <div key={store.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderBottom: `1px solid ${X.line}` }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{store.name}</div>
                  <div style={{ fontSize: 12, color: X.slate }}>{[store.city, store.state].filter(Boolean).join(', ') || '—'}</div>
                </div>
                {!store.program_id && <span style={{ fontSize: 11.5, fontWeight: 700, color: X.red }}>No program — empty menu</span>}
                <select value={store.program_id || ''} disabled={busyId === store.id}
                  onChange={(e) => setProgram(store, e.target.value)}
                  style={storeSel} title="Which of your programs this store is on">
                  <option value="">No program (empty menu)</option>
                  {foreign && <option value={store.program_id} disabled>Assigned by XPEL</option>}
                  {own.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// The shop's program library (package sets + wholesale), scoped to this shop.
function ProgramsView() {
  const { dealerId } = useAuth()
  const [products, setProducts] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { getAllProducts().then(setProducts).catch((e) => setErr(e.message)) }, [])
  if (err) return <div style={{ color: X.red }}>{err}</div>
  if (products === null) return <Spinner />
  return <ProgramsAdmin products={products} mode="installer" dealerId={dealerId} />
}

const storeSel = { border: `1px solid ${X.gray}`, background: '#FFFFFD', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT.body, color: X.black, minWidth: 220 }
const secLbl = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, marginBottom: 6, fontWeight: 700 }
const flag = { fontFamily: FONT.body, fontSize: 11, borderRadius: 999, padding: '4px 10px', fontWeight: 700 }
const statusSel = { border: `1px solid ${X.gray}`, background: '#FFFFFD', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT.body, color: X.black }
const saveBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
