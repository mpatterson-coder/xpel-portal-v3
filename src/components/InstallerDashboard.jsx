import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getOrders, getOrderDetail, updateOrderStatus, setOrderWorkOrder,
  getDealerships, getGroups, getOrderReads, markOrderRead,
  getOrderPhotos, addOrderPhotos, deleteOrderPhoto,
  installerCreateGroup, installerCreateStore, ensureStoreMenu,
  getStoreMenu, addMenuPackage, removeMenuPackage, setMenuWholesale,
} from '../lib/db'
import { getAllProducts } from '../lib/adminDb'
import { usePersistentState } from '../lib/uiState'
import { useUnread } from '../lib/useUnread'
import InstallerCatalog from './InstallerCatalog'
import MessagesHub from './MessagesHub'
import { Spinner, Modal, AlertPill } from './ui'
import { COLOR as X, FONT, CARD, ELEV, STATUS_TONE, money, dateUS } from '../lib/theme'
import StatusTimeline from './StatusTimeline'
import TabNav from './TabNav'
import Wizard from './Wizard'
import GettingStarted from './GettingStarted'
import { useConfirm } from './ConfirmDialog'
import { onNavigate, navigate } from '../lib/bus'
import PerformanceDashboard from './PerformanceDashboard'

const STATUS_LABELS = {
  submitted: 'Submitted', in_review: 'In Review', approved: 'Approved',
  in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
}

// =============================================================================
// The Installer view.
//   Fulfillment Queue — every job as a compact card; tap one to open the full
//                       work-order module (status, photos, notes, chat).
//   My Network        — the rooftops this shop services: add a store, build its
//                       package menu, set wholesale, see the store's retail.
//   My Packages       — the shop's own service catalog.
// MONEY RULE for this whole view: installers see WHOLESALE amounts only.
// =============================================================================
export default function InstallerDashboard() {
  const [view, setView] = usePersistentState('xpel.installer.view', 'queue')
  const { profile } = useAuth()
  const { unread, refresh: refreshUnread } = useUnread(profile?.id)
  const [focusOrder, setFocusOrder] = useState(null)
  useEffect(() => onNavigate((d) => {
    if (d.view === 'messages') setView('messages')
    if (d.view === 'order') { if (d.orderId) setFocusOrder({ id: d.orderId }); setView('queue') }
  }), [])
  const TABS = { queue: 'Fulfillment Queue', network: 'My Network', packages: 'My Packages', messages: 'Messages', performance: 'Performance' }
  // Older saved tab names ("stores"/"programs") land on My Network, their successor.
  const safeView = TABS[view] ? view : (view === 'stores' || view === 'programs' ? 'network' : 'queue')
  return (
    <div style={{ maxWidth: 1000 }}>
      <TabNav tabs={TABS} value={safeView} onChange={setView} badges={{ messages: unread.total }} />
      {safeView === 'queue' && <QueueView focus={focusOrder} onFocused={() => setFocusOrder(null)} />}
      {safeView === 'network' && <NetworkView />}
      {safeView === 'packages' && <InstallerCatalog />}
      {safeView === 'messages' && <MessagesHub mode="installer" unread={unread} onRead={refreshUnread} />}
      {safeView === 'performance' && (
        <PerformanceDashboard mode="installer"
          onOpenOrder={(id) => { setFocusOrder({ id }); setView('queue') }} />
      )}
    </div>
  )
}

// =============================================================================
// FULFILLMENT QUEUE — stacked sections of compact job cards. No sideways
// scrolling anywhere: cards wrap to fit whatever screen this is on, and all
// the detail lives in the module that opens when a card is tapped.
// =============================================================================
function QueueView({ focus, onFocused }) {
  const { profile } = useAuth()
  const [orders, setOrders] = useState(null)
  const [newIds, setNewIds] = useState(new Set())
  const [err, setErr] = useState('')
  const [openOrder, setOpenOrder] = useState(null)

  const load = () => getOrders().then(setOrders).catch((e) => setErr(e.message))
  useEffect(() => {
    load()
    getOrderReads()
      .then((reads) => getOrders().then((os) => setNewIds(new Set(os.filter((o) => !reads.has(o.id)).map((o) => o.id)))))
      .catch(() => {})
  }, [])

  // Opening a job marks it seen — the NEW pill and section count update instantly.
  const markSeen = (orderId) => {
    if (!newIds.has(orderId)) return
    setNewIds((prev) => { const n = new Set(prev); n.delete(orderId); return n })
    if (profile?.id) markOrderRead(profile.id, orderId).catch(() => {})
  }

  const openCard = (o) => { markSeen(o.id); setOpenOrder(o) }

  // A jump from Performance (or the bell) opens that job's module directly.
  useEffect(() => {
    if (focus?.id && orders?.length) {
      const found = orders.find((o) => o.id === focus.id)
      if (found) { openCard(found); onFocused?.() }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, orders])

  // Soonest pick-up first (no date sinks to the bottom), then oldest first.
  const bySchedule = (a, b) => {
    if (a.pickup_date && b.pickup_date && a.pickup_date !== b.pickup_date) return a.pickup_date < b.pickup_date ? -1 : 1
    if (a.pickup_date && !b.pickup_date) return -1
    if (!a.pickup_date && b.pickup_date) return 1
    return new Date(a.created_at) - new Date(b.created_at)
  }

  const SECTIONS = [
    { key: 'incoming', label: 'Submitted', sub: 'New work awaiting your review', statuses: ['submitted', 'in_review'] },
    { key: 'active', label: 'In progress', sub: 'Approved and in the bay', statuses: ['approved', 'in_progress'] },
    { key: 'done', label: 'Recently completed', sub: 'Completed & cancelled', statuses: ['completed', 'cancelled'] },
  ]

  const all = orders ?? []
  return (
    <div>
      <GettingStarted storageKey={`xpel.gs.installer.${profile?.id}`} title="Getting started at your shop" items={[
        { label: 'New orders arrive under Submitted wearing a NEW badge — tap a card to open the full job', done: all.length > 0 && newIds.size === 0 },
        { label: 'Inside a job: change the status, add photos, enter the DAP #, or jump to its chat', done: false },
        { label: 'Under My Network you can add the stores you service and build each store’s package menu', done: false },
      ]} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: FONT.headingWeight }}>Fulfillment Queue</h2>
        {newIds.size > 0 && (
          <span style={{ background: X.yellow, color: X.black, borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 800 }}>
            {newIds.size} NEW {newIds.size === 1 ? 'order' : 'orders'}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: X.slate, marginBottom: 12 }}>
        Tap any job card to open the full work order — status, photos, notes, and its chat.
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      {orders === null && <Spinner label="Loading your queue…" />}
      {SECTIONS.map((sec) => {
        const inSec = all.filter((o) => sec.statuses.includes(o.status)).sort(bySchedule)
        const secNew = inSec.filter((o) => newIds.has(o.id)).length
        return (
          <div key={sec.key} style={{ ...CARD, padding: 0, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ background: X.black, color: X.white, padding: '10px 14px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>{sec.label}</span>
                <span style={{ color: 'rgba(255,255,253,0.55)', fontSize: 11, marginLeft: 8 }}>{sec.sub}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: secNew ? X.yellow : 'rgba(255,255,253,0.7)', whiteSpace: 'nowrap' }}>
                {inSec.length}{secNew ? ` · ${secNew} NEW` : ''}
              </span>
            </div>
            <div style={{ padding: 12 }}>
              {inSec.length === 0 && <div style={{ color: X.slate, fontSize: 13, padding: '4px 2px' }}>Nothing here right now.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))', gap: 10 }}>
                {inSec.map((o) => (
                  <JobCard key={o.id} order={o} isNew={newIds.has(o.id)} onOpen={() => openCard(o)} />
                ))}
              </div>
            </div>
          </div>
        )
      })}
      {openOrder && (
        <OrderModal order={openOrder} onClose={() => setOpenOrder(null)} onChanged={load} />
      )}
    </div>
  )
}

function JobCard({ order: o, isNew, onOpen }) {
  const [hover, setHover] = useState(false)
  const vehicle = [o.vehicle_year, o.vehicle_make, o.vehicle_model].filter(Boolean).join(' ')
  return (
    <button onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left', background: '#FFFFFD', border: `1.5px solid ${isNew ? X.yellow : X.gray}`,
        borderRadius: 12, padding: '11px 13px', cursor: 'pointer', fontFamily: FONT.body,
        boxShadow: hover ? ELEV.raise : 'none', transition: 'box-shadow .15s ease, transform .15s ease',
        transform: hover ? 'translateY(-1px)' : 'none', minWidth: 0,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11.5, color: X.slate }}>{o.order_number}</span>
        {isNew && <span style={{ background: X.yellow, color: X.black, borderRadius: 5, padding: '1.5px 6px', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em' }}>NEW</span>}
        <span style={{ flex: 1 }} />
        <StatusChip status={o.status} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name || '—'}</div>
      <div style={{ fontSize: 12, color: X.slate, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {vehicle || 'Vehicle not entered'}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {o.pickup_date && (
          <span style={{ ...chip, background: '#FFF3D6', border: `1px solid ${X.yellow}`, color: X.black }}>Avail {dateUS(o.pickup_date)}</span>
        )}
        {!o.dap_work_order
          ? <span style={{ ...chip, background: X.red, color: '#fff' }}>DAP # missing</span>
          : <span style={{ ...chip, border: `1px solid ${X.gray}`, color: X.slate }}>DAP {o.dap_work_order}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: hover ? X.black : X.slate, whiteSpace: 'nowrap' }}>Open ›</span>
      </div>
    </button>
  )
}

function StatusChip({ status }) {
  const t = STATUS_TONE[status] || STATUS_TONE.submitted
  return (
    <span style={{ fontFamily: FONT.body, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.fg, background: t.bg, borderRadius: 999, padding: '3px 9px', fontWeight: 800, whiteSpace: 'nowrap' }}>
      {(status || '').replace('_', ' ')}
    </span>
  )
}

// =============================================================================
// THE JOB MODULE — everything about one order in one place, sized to always
// fit the screen. Status changes are confirmed first, and if the database
// refuses one for any reason, the exact error appears right here in red —
// nothing fails silently.
// =============================================================================
function OrderModal({ order, onClose, onChanged }) {
  const { profile, role } = useAuth()
  const confirm = useConfirm()
  const [detail, setDetail] = useState(null)
  const [photos, setPhotos] = useState(null)
  const [status, setStatus] = useState(order.status)
  const [errMsg, setErrMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [dapDraft, setDapDraft] = useState(order.dap_work_order || '')
  const [dapSaved, setDapSaved] = useState(!!order.dap_work_order)
  const [uploadNote, setUploadNote] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    getOrderDetail(order.id).then(setDetail).catch((e) => setDetail({ error: e.message }))
    getOrderPhotos(order.id).then(setPhotos).catch(() => setPhotos([]))
  }, [order.id])

  async function changeStatus(next) {
    if (next === status) return
    setErrMsg('')
    const ok = await confirm({
      title: next === 'completed' ? `Mark ${order.order_number} complete?`
        : next === 'cancelled' ? `Cancel ${order.order_number}?`
        : `Move ${order.order_number} to ${STATUS_LABELS[next]}?`,
      message: 'The store sees this change immediately and the customer-facing status updates.',
      summary: [
        ['Order', order.order_number],
        ['Customer', order.customer_name || '—'],
        ['From', STATUS_LABELS[status] ?? status],
        ['To', STATUS_LABELS[next] ?? next],
      ],
      confirmLabel: next === 'completed' ? 'Mark complete' : next === 'cancelled' ? 'Cancel order' : 'Move it',
      tone: next === 'cancelled' ? 'danger' : 'default',
    })
    if (!ok) return
    setBusy(true)
    try {
      await updateOrderStatus(order.id, next)
      setStatus(next)
      await onChanged()
    } catch (e) {
      setErrMsg(`The status change didn’t save. The database said: ${e.message}`)
    } finally { setBusy(false) }
  }

  async function saveDap() {
    setBusy(true); setErrMsg('')
    try {
      await setOrderWorkOrder(order.id, dapDraft.trim() || null)
      setDapSaved(true)
      await onChanged()
    } catch (e) { setErrMsg(`Couldn’t save the DAP number: ${e.message}`) }
    finally { setBusy(false) }
  }

  async function onPickPhotos(e) {
    const files = Array.from(e.target.files ?? []).slice(0, 6)
    e.target.value = ''
    if (!files.length) return
    setErrMsg('')
    try {
      await addOrderPhotos(order.id, profile.id, files, (i, n) => setUploadNote(`Uploading photo ${i} of ${n}…`))
      setUploadNote('')
      setPhotos(await getOrderPhotos(order.id))
    } catch (e2) {
      setUploadNote('')
      setErrMsg(`Photo upload failed: ${e2.message}`)
    }
  }

  async function removePhoto(ph) {
    setErrMsg('')
    try { await deleteOrderPhoto(ph); setPhotos((ps) => ps.filter((p) => p.id !== ph.id)) }
    catch (e) { setErrMsg(e.message) }
  }

  const wholesale = detail && !detail.error
    ? detail.items.reduce((s, it) => s + Number(it.unit_cost ?? it.product?.cost ?? 0) * it.quantity, 0)
    : null
  const vehicle = [order.vehicle_year, order.vehicle_make, order.vehicle_model, order.vehicle_trim].filter(Boolean).join(' ')

  return (
    <Modal
      title={`${order.order_number} — ${order.customer_name || 'Order'}`}
      subtitle={order.dealership?.name}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => { navigate({ view: 'messages', channel: { dealership_id: order.dealership_id, order_id: order.id } }); onClose() }} style={ghostBtn}>
            Open this order’s chat
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={doneBtn}>Done</button>
        </div>
      }>

      <div style={secLbl}>Status</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <StatusChip status={status} />
        <select value={status} disabled={busy} onChange={(e) => changeStatus(e.target.value)} style={statusSel} title="Set order status">
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: X.slate }}>You’ll confirm before anything changes.</span>
      </div>
      {errMsg && <AlertPill tone="important" style={{ marginBottom: 10 }}>{errMsg}</AlertPill>}
      <StatusTimeline status={status} style={{ margin: '8px 0 16px', maxWidth: 560 }} />

      <div style={secLbl}>Customer</div>
      <div style={{ fontSize: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 600 }}>{order.customer_name || '—'}</div>
        {(order.customer_phone || order.customer_email) && (
          <div style={{ fontSize: 13, color: X.slate }}>{[order.customer_phone, order.customer_email].filter(Boolean).join(' · ')}</div>
        )}
        {order.pickup_date && <div style={{ fontSize: 13, color: X.slate }}>Vehicle available for pick-up: {dateUS(order.pickup_date)}</div>}
      </div>

      <div style={secLbl}>Vehicle</div>
      <div style={{ fontSize: 14, marginBottom: 14 }}>
        {vehicle || '—'}{order.vehicle_size ? ` · ${order.vehicle_size}` : ''}
        {order.vin && <div style={{ fontSize: 12, color: X.slate, marginTop: 2, fontFamily: 'ui-monospace, Menlo, monospace' }}>{order.vin}</div>}
      </div>

      {order.notes && (
        <>
          <div style={secLbl}>Notes from the store</div>
          <div style={{ fontSize: 13.5, background: '#F7F5EF', border: `1px solid ${X.line}`, borderRadius: 10, padding: '10px 13px', marginBottom: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {order.notes}
          </div>
        </>
      )}

      <div style={secLbl}>DAP work order #</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, maxWidth: 360 }}>
        <input value={dapDraft} onChange={(e) => { setDapDraft(e.target.value); setDapSaved(false) }} placeholder="Enter DAP work order number"
          style={{ flex: 1, border: `1px solid ${X.gray}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: FONT.body }} />
        <button disabled={busy || dapSaved || dapDraft.trim() === (order.dap_work_order || '')} onClick={saveDap}
          style={{ ...saveBtn, opacity: busy || dapSaved || dapDraft.trim() === (order.dap_work_order || '') ? 0.5 : 1 }}>
          {dapSaved && dapDraft.trim() ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: X.slate, marginBottom: 14 }}>Ties this job to your DAP system so both records match.</div>

      <div style={secLbl}>Photos</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
        {photos === null && <Spinner label="Loading photos…" />}
        {photos?.map((ph) => (
          <span key={ph.id} style={{ position: 'relative', display: 'inline-block' }}>
            <a href={ph.url ?? '#'} target="_blank" rel="noreferrer">
              <img src={ph.url ?? ''} alt="Order photo" style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 10, border: `1px solid ${X.gray}`, display: 'block' }} />
            </a>
            {(ph.uploaded_by === profile?.id || role === 'admin') && (
              <button onClick={() => removePhoto(ph)} title="Remove photo"
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: 'none', background: X.black, color: X.white, fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>×</button>
            )}
          </span>
        ))}
        <button onClick={() => fileRef.current?.click()} style={addPhotoBtn}>+ Add photos</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPickPhotos} />
      </div>
      <div style={{ fontSize: 11.5, color: X.slate, marginBottom: 14 }}>
        {uploadNote || (photos?.length ? 'Tap a photo to view it full size.' : 'The store’s photos appear here — and you can add install shots of your own.')}
      </div>

      <div style={secLbl}>Coverage — wholesale (billed to the dealership)</div>
      {!detail && <Spinner label="Loading order lines…" />}
      {detail?.error && <div style={{ color: X.red, fontSize: 13 }}>{detail.error}</div>}
      {detail && !detail.error && (
        <>
          {detail.items.map((it) => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, padding: '2px 0' }}>
              <span style={{ minWidth: 0 }}>
                {it.quantity} × {it.product?.name}
                {detail.aliases?.[it.product_id] && detail.aliases[it.product_id] !== it.product?.name && (
                  <span style={{ color: X.slate, fontSize: 12 }}> · listed at the store as “{detail.aliases[it.product_id]}”</span>
                )}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>{money(Number(it.unit_cost ?? it.product?.cost ?? 0) * it.quantity)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, padding: '6px 0', borderTop: `1px solid ${X.stone}`, marginTop: 4, marginBottom: 12 }}>
            <span>Wholesale total</span><span>{money(wholesale)}</span>
          </div>
          <div style={secLbl}>Status history</div>
          {detail.history.map((h) => (
            <div key={h.id} style={{ fontSize: 12, color: X.slate, fontFamily: FONT.body }}>
              {new Date(h.created_at).toLocaleString()} — {STATUS_LABELS[h.status] ?? h.status}
            </div>
          ))}
        </>
      )}
    </Modal>
  )
}

// =============================================================================
// MY NETWORK — the rooftops this shop services. Add a store (with its full
// address), build its package menu, set your wholesale, and see the retail
// each store has set. Replaces the old My Stores + Programs tabs.
// =============================================================================
function NetworkView() {
  const { profile, dealerId } = useAuth()
  const [stores, setStores] = useState(null)
  const [groups, setGroups] = useState([])
  const [products, setProducts] = useState([])
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [menuStore, setMenuStore] = useState(null)

  const load = () =>
    Promise.all([getDealerships(), getGroups(), getAllProducts()])
      .then(([s, g, p]) => { setStores(s); setGroups(g); setProducts(p) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const myProducts = products.filter((p) => p.authorized_dealer_id === dealerId && p.active)
  const groupName = (id) => groups.find((g) => g.id === id)?.name

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: FONT.headingWeight }}>My Network</h2>
        <button onClick={() => { setNotice(''); setAdding(true) }} style={primaryBtn}>+ Add a store</button>
      </div>
      <div style={{ fontSize: 13, color: X.slate, marginBottom: 12, maxWidth: 700, lineHeight: 1.5 }}>
        Every dealership rooftop your shop services. Add a store, then open <b>Manage packages</b> to choose
        what it can order and set your wholesale. Each store prices its own retail — you’ll see it here once they do.
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      {notice && <AlertPill tone="success" style={{ marginBottom: 12 }}>{notice}</AlertPill>}
      {stores === null && <Spinner label="Loading your network…" />}
      {stores !== null && stores.length === 0 && (
        <div style={{ ...CARD, padding: 20, color: X.slate, fontSize: 14, lineHeight: 1.55 }}>
          No stores yet. Tap <b>+ Add a store</b> to add the first dealership you service — you’ll pick its
          packages and set your wholesale in the same flow.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))', gap: 12 }}>
        {(stores ?? []).map((s) => (
          <div key={s.id} style={{ ...CARD, padding: '14px 16px', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
            <div style={{ fontSize: 12, color: X.slate, marginTop: 3, lineHeight: 1.5 }}>
              {s.street && <div>{s.street}</div>}
              <div>{[s.city, s.state].filter(Boolean).join(', ')}{s.zip ? ` ${s.zip}` : ''}</div>
              {groupName(s.group_id) && <div style={{ marginTop: 2 }}>{groupName(s.group_id)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setMenuStore(s)} style={ghostBtn}>Manage packages</button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <AddStoreWizard
          dealerId={dealerId} groups={groups} myProducts={myProducts}
          onGroupsChanged={load}
          onClose={() => setAdding(false)}
          onCreated={async (store) => {
            setAdding(false)
            await load()
            setNotice(`${store.name} is set up. The store manages its own retail prices — they’ll appear under Manage packages once set.`)
          }}
        />
      )}
      {menuStore && (
        <StoreMenuModal store={menuStore} dealerId={dealerId} myProducts={myProducts}
          onClose={() => { setMenuStore(null); load() }} />
      )}
    </div>
  )
}

// ---- Add-a-store: one guided flow — details, packages, wholesale, review ----
function AddStoreWizard({ dealerId, groups, myProducts, onGroupsChanged, onClose, onCreated }) {
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ name: '', street: '', city: '', state: '', zip: '', group_id: '' })
  const [newGroup, setNewGroup] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [picked, setPicked] = useState(new Set())
  const [wholesale, setWholesale] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const togglePick = (id) => setPicked((prev) => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else { n.add(id); if (wholesale[id] === undefined) { const p = myProducts.find((x) => x.id === id); setWholesale((w) => ({ ...w, [id]: p ? String(p.cost ?? '') : '' })) } }
    return n
  })

  async function createGroupInline() {
    if (!newGroup.trim()) return
    setGroupBusy(true); setErr('')
    try {
      const g = await installerCreateGroup(newGroup)
      await onGroupsChanged()
      setF((prev) => ({ ...prev, group_id: g.id }))
      setNewGroup('')
    } catch (e) { setErr(`Couldn’t create the group: ${e.message}`) }
    finally { setGroupBusy(false) }
  }

  async function create() {
    setBusy(true); setErr('')
    try {
      const store = await installerCreateStore(dealerId, f)
      for (const id of picked) {
        const w = Number(wholesale[id])
        await addMenuPackage(store.program_id, id, Number.isFinite(w) ? w : null)
      }
      onCreated(store)
    } catch (e) {
      setErr(`Something didn’t save: ${e.message}. If the store was created, you can finish its menu from Manage packages.`)
    } finally { setBusy(false) }
  }

  const detailsValid = !!(f.name.trim() && f.street.trim() && f.city.trim() && f.state.trim() && f.zip.trim() && f.group_id)
  const steps = [
    {
      key: 'details', label: 'Store details', valid: detailsValid,
      render: () => (
        <div>
          <WStepIntro title="Which store are you adding?" sub="The full address is required — it identifies the exact rooftop." />
          <WField label="Dealership name *" hint="e.g. BMW of Austin">
            <input value={f.name} onChange={set('name')} style={winput} placeholder="Dealership name" />
          </WField>
          <WField label="Street address *">
            <input value={f.street} onChange={set('street')} style={winput} placeholder="e.g. 9000 Research Blvd" />
          </WField>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <WField label="City *"><input value={f.city} onChange={set('city')} style={winput} /></WField>
            <WField label="State *" hint="2 letters"><input value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase().slice(0, 2) })} style={winput} placeholder="TX" /></WField>
            <WField label="ZIP *"><input value={f.zip} onChange={set('zip')} style={winput} placeholder="78758" /></WField>
          </div>
          <WField label="Dealer group *" hint="The parent company this rooftop belongs to. Don’t see it? Create it right here.">
            <select value={f.group_id} onChange={set('group_id')} style={winput}>
              <option value="">Select a group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New group name, e.g. Penske Automotive" style={{ ...winput, flex: 1 }} />
              <button onClick={createGroupInline} disabled={groupBusy || !newGroup.trim()} style={{ ...ghostBtn, opacity: groupBusy || !newGroup.trim() ? 0.5 : 1 }}>
                {groupBusy ? 'Creating…' : '+ Create group'}
              </button>
            </div>
          </WField>
        </div>
      ),
    },
    {
      key: 'packages', label: 'Packages', valid: true,
      render: () => (
        <div>
          <WStepIntro title="What can this store order?" sub="Pick from your shop’s catalog. You can always change the menu later under Manage packages." />
          {myProducts.length === 0 && (
            <AlertPill tone="alert">Your catalog is empty — add your offerings under the <b>My Packages</b> tab first, then come back. You can still create the store now with an empty menu.</AlertPill>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginTop: 10 }}>
            {myProducts.map((p) => {
              const on = picked.has(p.id)
              return (
                <button key={p.id} onClick={() => togglePick(p.id)}
                  style={{ textAlign: 'left', background: on ? '#FFF7E0' : '#FFFFFD', border: `1.5px solid ${on ? X.yellow : X.gray}`, borderRadius: 12, padding: '11px 13px', cursor: 'pointer', fontFamily: FONT.body, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</div>
                  {p.category && <div style={{ fontSize: 11, color: X.slate, marginTop: 2 }}>{p.category}</div>}
                  {on && <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: 800, color: X.black, background: X.yellow, borderRadius: 999, padding: '2px 9px', display: 'inline-block' }}>ADDED ✓</div>}
                </button>
              )
            })}
          </div>
        </div>
      ),
    },
    {
      key: 'wholesale', label: 'Your wholesale', valid: true,
      render: () => (
        <div>
          <WStepIntro title="Set your wholesale for this store" sub="Wholesale is what the store pays YOUR shop per package. The store sets its own customer retail on top — that’s theirs, not yours." />
          {picked.size === 0 && <div style={{ color: X.slate, fontSize: 13.5 }}>No packages selected — you can skip ahead and build the menu later.</div>}
          {[...picked].map((id) => {
            const p = myProducts.find((x) => x.id === id)
            if (!p) return null
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px dashed ${X.line}` }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{p.name}</span>
                <span style={{ fontSize: 11.5, color: X.slate }}>$</span>
                <input type="number" min="0" step="1" value={wholesale[id] ?? ''}
                  onChange={(e) => setWholesale((w) => ({ ...w, [id]: e.target.value }))}
                  style={{ ...winput, width: 110 }} placeholder={String(p.cost ?? 0)} />
              </div>
            )
          })}
        </div>
      ),
    },
    {
      key: 'review', label: 'Review', valid: true,
      render: () => (
        <div>
          <WStepIntro title="One last look" sub="Create the store and its menu in one go." />
          <WReview label="Store">{f.name}<div style={{ fontSize: 12, color: X.slate, marginTop: 2 }}>{f.street} · {f.city}, {f.state} {f.zip} · {groups.find((g) => g.id === f.group_id)?.name}</div></WReview>
          <WReview label={`Menu (${picked.size} package${picked.size === 1 ? '' : 's'})`}>
            {picked.size === 0 && <span style={{ color: X.slate }}>Empty for now — build it any time under Manage packages.</span>}
            {[...picked].map((id) => {
              const p = myProducts.find((x) => x.id === id)
              return p ? (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '3px 0' }}>
                  <span style={{ minWidth: 0 }}>{p.name}</span>
                  <span style={{ fontWeight: 700 }}>{money(Number(wholesale[id]) || 0)} wholesale</span>
                </div>
              ) : null
            })}
          </WReview>
          <AlertPill tone="note">XPEL is notified automatically when a new rooftop joins your network.</AlertPill>
          {err && <AlertPill tone="important" style={{ marginTop: 10 }}>{err}</AlertPill>}
        </div>
      ),
    },
  ]

  return (
    <Wizard
      title="Add a store" subtitle="A new rooftop for your shop — details, menu, wholesale."
      steps={steps} step={step} onStep={setStep} onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={create} disabled={busy || !detailsValid}
            style={{ ...primaryBtn, opacity: busy || !detailsValid ? 0.5 : 1 }}>
            {busy ? 'Creating store…' : 'Create store'}
          </button>
        </div>
      }
    />
  )
}

// ---- Manage one store's menu: packages, your wholesale, their retail --------
function StoreMenuModal({ store, dealerId, myProducts, onClose }) {
  const [programId, setProgramId] = useState(store.program_id)
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [addId, setAddId] = useState('')
  const [addW, setAddW] = useState('')

  const load = (pid) => getStoreMenu({ ...store, program_id: pid }).then(setItems).catch((e) => setErr(e.message))

  useEffect(() => {
    let pid = store.program_id
    ;(async () => {
      try {
        if (!pid) {
          const prog = await ensureStoreMenu(store, dealerId)
          pid = prog.id
          setProgramId(pid)
        }
        await load(pid)
      } catch (e) { setErr(e.message) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id])

  const inMenu = new Set((items ?? []).map((it) => it.product.id))
  const addable = myProducts.filter((p) => !inMenu.has(p.id))

  async function add() {
    if (!addId) return
    setBusy(true); setErr('')
    try {
      const w = Number(addW)
      await addMenuPackage(programId, addId, Number.isFinite(w) && addW !== '' ? w : (myProducts.find((p) => p.id === addId)?.cost ?? null))
      setAddId(''); setAddW('')
      await load(programId)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function remove(it) {
    setBusy(true); setErr('')
    try { await removeMenuPackage(it.link_id); await load(programId) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Package menu — ${store.name}`} subtitle="What this store can order, your wholesale, and the retail they’ve set" onClose={onClose}
      footer={<div style={{ display: 'flex' }}><span style={{ flex: 1 }} /><button onClick={onClose} style={doneBtn}>Done</button></div>}>
      {err && <AlertPill tone="important" style={{ marginBottom: 10 }}>{err}</AlertPill>}
      {items === null && <Spinner label="Loading the menu…" />}
      {items !== null && (
        <>
          <div style={{ display: 'flex', gap: 10, fontSize: 10.5, fontWeight: 800, color: X.slate, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 0 6px', borderBottom: `1px solid ${X.line}` }}>
            <span style={{ flex: 1 }}>Package</span>
            <span style={{ width: 110, textAlign: 'right' }}>Your wholesale</span>
            <span style={{ width: 110, textAlign: 'right' }}>Store retail</span>
            <span style={{ width: 26 }} />
          </div>
          {items.length === 0 && (
            <div style={{ color: X.slate, fontSize: 13.5, padding: '12px 0' }}>
              This store’s menu is empty — add packages below and they appear on the store’s order screen once priced.
            </div>
          )}
          {items.map((it) => (
            <MenuRow key={it.link_id} it={it} busy={busy} onRemove={() => remove(it)} onError={setErr} />
          ))}
          <div style={{ fontSize: 11.5, color: X.slate, margin: '8px 0 14px', lineHeight: 1.5 }}>
            <b>Your wholesale</b> is what the store pays your shop. <b>Store retail</b> is what the store charges
            its customers — the store sets that themselves, and it shows here (read-only) once they do.
          </div>
          <div style={secLbl}>Add a package to this menu</div>
          {addable.length === 0 && (
            <div style={{ fontSize: 13, color: X.slate }}>
              Every package in your catalog is already on this menu. Add new offerings under the <b>My Packages</b> tab.
            </div>
          )}
          {addable.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={addId} onChange={(e) => setAddId(e.target.value)} style={{ ...winput, flex: 2, minWidth: 180 }}>
                <option value="">Choose a package…</option>
                {addable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" min="0" value={addW} onChange={(e) => setAddW(e.target.value)} placeholder="Wholesale $"
                style={{ ...winput, width: 120 }} />
              <button onClick={add} disabled={busy || !addId} style={{ ...primaryBtn, opacity: busy || !addId ? 0.5 : 1 }}>Add</button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

function MenuRow({ it, busy, onRemove, onError }) {
  const [w, setW] = useState(String(it.wholesale ?? ''))
  useEffect(() => { setW(String(it.wholesale ?? '')) }, [it.wholesale])
  async function commit() {
    const n = Number(w)
    if (!Number.isFinite(n) || n < 0 || n === Number(it.wholesale)) { setW(String(it.wholesale ?? '')); return }
    try { await setMenuWholesale(it.link_id, n) } catch (e) { onError(e.message); setW(String(it.wholesale ?? '')) }
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: `1px dashed ${X.line}` }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.product.name}</span>
      <input type="number" min="0" value={w} disabled={busy} onChange={(e) => setW(e.target.value)} onBlur={commit}
        style={{ ...winput, width: 110, textAlign: 'right' }} title="Your wholesale — commits when you click away" />
      <span style={{ width: 110, textAlign: 'right', fontSize: 13.5, color: it.retail != null ? X.black : X.slate, fontWeight: it.retail != null ? 700 : 400 }}>
        {it.retail != null ? money(it.retail) : 'not set yet'}
      </span>
      <button onClick={onRemove} disabled={busy} title="Remove from this store's menu"
        style={{ width: 26, background: 'transparent', border: 'none', color: X.slate, fontSize: 16, cursor: 'pointer' }}>×</button>
    </div>
  )
}

// ---- Small shared bits ------------------------------------------------------
const WStepIntro = ({ title, sub }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
    <div style={{ fontSize: 12.5, color: X.slate, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
  </div>
)
const WField = ({ label, hint, children }) => (
  <label style={{ display: 'block', marginTop: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: X.slate, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
    {children}
    {hint && <div style={{ fontSize: 11.5, color: X.slate, marginTop: 4 }}>{hint}</div>}
  </label>
)
const WReview = ({ label, children }) => (
  <div style={{ border: `1px solid ${X.line}`, borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 800, color: X.slate, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 14 }}>{children}</div>
  </div>
)

const chip = { fontFamily: FONT.body, fontSize: 10.5, borderRadius: 999, padding: '3px 9px', fontWeight: 700, whiteSpace: 'nowrap' }
const secLbl = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, marginBottom: 6, fontWeight: 700 }
const statusSel = { border: `1px solid ${X.gray}`, background: '#FFFFFD', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT.body, color: X.black }
const saveBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
const primaryBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: FONT.body }
const ghostBtn = { background: '#FFFFFD', color: X.black, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
const doneBtn = { background: X.black, color: X.white, border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: FONT.body }
const addPhotoBtn = { width: 76, height: 76, borderRadius: 10, border: `1.5px dashed ${X.gray}`, background: '#FBFAF7', color: X.slate, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT.body }
const winput = { width: '100%', boxSizing: 'border-box', border: `1.5px solid ${X.gray}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: FONT.body, outline: 'none', background: '#FFFFFD' }
