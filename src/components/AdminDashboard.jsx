import { useEffect, useMemo, useState } from 'react'
import { getGroups, getDealerships, getOrders, getNetworkPerformance, getAuthorizedDealers, getProgramLinks, getNotificationState } from '../lib/db'
import { getAllPrograms } from '../lib/adminDb'
import { onNavigate } from '../lib/bus'
import UsersAdmin from './UsersAdmin'
import NetworkAdmin from './NetworkAdmin'
import CatalogAdmin from './CatalogAdmin'
import DealersAdmin from './DealersAdmin'
import OrdersList from './OrdersList'
import OrderWizard from './OrderWizard'
import StorePricingAdmin from './StorePricingAdmin'
import PerformanceDashboard from './PerformanceDashboard'
import { usePersistentState } from '../lib/uiState'
import { COLOR as X, FONT, CARD, money as fm, dateUS } from '../lib/theme'
import TabNav from './TabNav'
import { Eyebrow, Sheen, useCountUp } from './ui'

const money = (n) => fm(n, 0)
const STATUS_TABS = { all: 'All', submitted: 'Submitted', in_review: 'In Review', approved: 'Approved', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }
const TABS = { overview: 'Command Center', performance: 'Performance', orders: 'Orders', users: 'Users', network: 'Dealerships', dealers: 'Authorized Installers', catalog: 'Catalog & Programs' }

// Admin area, rebuilt around the Command Center: the whole network at a
// glance — who services whom, on what program, with how many packages, priced
// or not, and what happened last — with the power to step into any store's
// pricing or place an order on its behalf.
export default function AdminDashboard() {
  const [tab, setTab] = usePersistentState('xpel.admin.tab', 'overview')
  const [orderFilter, setOrderFilter] = usePersistentState('xpel.admin.orderFilter', 'all')
  const [focusOrder, setFocusOrder] = useState(null)

  const go = (nextTab, filter) => {
    if (filter) setOrderFilter(filter)
    setTab(nextTab)
  }

  // The pinned bell lands admins straight on the order an alert refers to.
  useEffect(() => onNavigate((d) => {
    if (d.view === 'order' && d.orderId) { setOrderFilter('all'); setFocusOrder({ id: d.orderId }); setTab('orders') }
  }), [])

  return (
    <div style={{ maxWidth: 1000, fontFamily: FONT.body }}>
      <TabNav tabs={TABS} value={tab} onChange={(k) => { if (k === 'orders') setOrderFilter('all'); setTab(k) }} />
      {tab === 'overview' && <CommandCenter onNavigate={go} />}
      {tab === 'performance' && (
        <PerformanceDashboard mode="admin"
          onOpenOrder={(id) => { setOrderFilter('all'); setFocusOrder({ id }); setTab('orders') }} />
      )}
      {tab === 'orders' && <OrdersTab filter={orderFilter} setFilter={setOrderFilter} focus={focusOrder} />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'network' && <NetworkAdmin />}
      {tab === 'dealers' && <DealersAdmin />}
      {tab === 'catalog' && <CatalogAdmin />}
    </div>
  )
}

function CommandCenter({ onNavigate }) {
  const [groups, setGroups] = useState([])
  const [dealerships, setDealerships] = useState([])
  const [orders, setOrders] = useState([])
  const [perf, setPerf] = useState([])
  const [dealers, setDealers] = useState([])
  const [programs, setPrograms] = useState([])
  const [links, setLinks] = useState([])
  const [feed, setFeed] = useState([])
  const [err, setErr] = useState('')
  const [openDealer, setOpenDealer] = useState(null)
  const [pricingStore, setPricingStore] = useState(null)   // {id, name} -> Store-pricing module
  const [orderStore, setOrderStore] = useState(null)       // {group_id, dealership_id} -> Order module

  const load = () => Promise.all([
    getGroups(), getDealerships(), getOrders(), getNetworkPerformance(),
    getAuthorizedDealers(), getAllPrograms(), getProgramLinks(),
  ]).then(([g, d, o, p, ad, pr, ln]) => {
    setGroups(g); setDealerships(d); setOrders(o); setPerf(p)
    setDealers(ad); setPrograms(pr); setLinks(ln)
  }).catch((e) => setErr(e.message))

  useEffect(() => {
    load()
    getNotificationState(12).then((n) => setFeed(n.items.filter((i) => i.kind === 'network'))).catch(() => {})
  }, [])

  const view = useMemo(() => {
    const totals = perf.reduce((a, p) => ({ revenue: a.revenue + Number(p.revenue || 0), margin: a.margin + Number(p.margin || 0) }), { revenue: 0, margin: 0 })
    const marginPct = totals.revenue ? Math.round((totals.margin / totals.revenue) * 100) : 0
    const active = orders.filter((o) => !['completed', 'cancelled'].includes(o.status)).length

    const programById = new Map(programs.map((p) => [p.id, p]))
    const linksByProgram = new Map()
    for (const l of links) {
      if (!linksByProgram.has(l.program_id)) linksByProgram.set(l.program_id, new Set())
      linksByProgram.get(l.program_id).add(l.product_id)
    }
    const lastOrderByStore = new Map()
    for (const o of orders) {
      const prev = lastOrderByStore.get(o.dealership_id)
      if (!prev || o.created_at > prev) lastOrderByStore.set(o.dealership_id, o.created_at)
    }
    const rows = dealers.map((ad) => {
      const stores = dealerships.filter((d) => d.authorized_dealer_id === ad.id)
      const progIds = [...new Set(stores.map((s) => s.program_id).filter(Boolean))]
      const pkgIds = new Set()
      for (const pid of progIds) for (const x of (linksByProgram.get(pid) ?? [])) pkgIds.add(x)
      const last = stores.map((s) => lastOrderByStore.get(s.id)).filter(Boolean).sort().pop() ?? null
      return {
        dealer: ad, stores,
        programNames: progIds.map((pid) => programById.get(pid)?.name).filter(Boolean),
        packageCount: pkgIds.size,
        unassigned: stores.filter((s) => !s.program_id).length,
        lastOrder: last,
        storeRows: stores.map((s) => ({
          ...s,
          programName: programById.get(s.program_id)?.name ?? null,
          lastOrder: lastOrderByStore.get(s.id) ?? null,
        })),
      }
    })
    return { totals, marginPct, active, rows }
  }, [perf, orders, dealers, dealerships, programs, links])

  // Live feed: real network notifications, with placed-order fallback so the
  // panel is never empty on day one.
  const feedItems = feed.length > 0 ? feed.map((n) => ({ id: n.id, when: n.created_at, text: n.title }))
    : orders.slice(0, 10).map((o) => ({ id: o.id, when: o.created_at, text: `${o.order_number} placed` }))

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: FONT.headingWeight }}>Command Center</h2>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Stat label="Active orders" value={view.active} onClick={() => onNavigate('orders', 'all')} />
        <Stat label="Network revenue" value={view.totals.revenue} format={money} onClick={() => onNavigate('performance')} />
        <Stat label="Network margin" value={view.totals.margin} format={(v) => `${money(v)} · ${view.marginPct}%`} onClick={() => onNavigate('performance')} />
        <Stat label="Enrolled rooftops" value={dealerships.length} onClick={() => onNavigate('network')} />
        <Stat label="Installers" value={dealers.length} onClick={() => onNavigate('dealers')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 16, alignItems: 'start' }}>
        <Panel title="Network at a glance — who services whom (click a row to step in)">
          <table style={tbl}>
            <thead>
              <tr><Th>Installer</Th><Th>Stores served</Th><Th>Program</Th><Th r>Packages</Th><Th r>Last order</Th></tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <RelationshipRow key={r.dealer.id} row={r}
                  open={openDealer === r.dealer.id}
                  onToggle={() => setOpenDealer(openDealer === r.dealer.id ? null : r.dealer.id)}
                  onPricing={(s) => setPricingStore({ id: s.id, name: s.name })}
                  onOrder={(s) => setOrderStore({ group_id: s.group_id, dealership_id: s.id })} />
              ))}
              {view.rows.length === 0 && (
                <tr><Td colSpan={5} style={{ color: X.slate }}>No installers yet — add one under Authorized Installers.</Td></tr>
              )}
            </tbody>
          </table>
        </Panel>

        <Panel title="Live activity">
          {feedItems.length === 0 && <div style={{ color: X.slate, fontSize: 13 }}>Activity appears here as orders move.</div>}
          {feedItems.map((f) => (
            <div key={f.id} style={{ padding: '7px 0', borderBottom: `1px solid ${X.line}`, fontSize: 12.5 }}>
              <div style={{ fontWeight: 600, lineHeight: 1.35 }}>{f.text}</div>
              <div style={{ color: X.slate, fontSize: 11, marginTop: 2 }}>{dateUS(f.when)} · {new Date(f.when).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
            </div>
          ))}
        </Panel>
      </div>

      {pricingStore && (
        <Modal title={`Store pricing — ${pricingStore.name}`} onClose={() => { setPricingStore(null); load() }}>
          <StorePricingAdmin dealershipId={pricingStore.id} adminMode />
        </Modal>
      )}
      <OrderWizard open={!!orderStore} adminMode initialStore={orderStore}
        onClose={() => { setOrderStore(null); load() }} onCreated={load} />
    </div>
  )
}

function RelationshipRow({ row: r, open, onToggle, onPricing, onOrder }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}
          onMouseEnter={(e) => e.currentTarget.style.background = X.bg}
          onMouseLeave={(e) => e.currentTarget.style.background = ''}>
        <Td><span style={{ fontWeight: 700 }}>{open ? '▾ ' : '▸ '}{r.dealer.name}</span></Td>
        <Td>
          {r.stores.length === 0 ? <span style={{ color: X.slate }}>none yet</span> : (
            <span>
              {r.stores.slice(0, 2).map((s) => <Chip key={s.id}>{s.name}</Chip>)}
              {r.stores.length > 2 && <span style={{ color: X.slate, fontSize: 12 }}> +{r.stores.length - 2} more</span>}
            </span>
          )}
        </Td>
        <Td>
          {r.programNames.length ? r.programNames.join(', ') : <span style={{ color: X.slate }}>—</span>}
          {r.unassigned > 0 && <span style={{ color: X.red, fontSize: 11.5, fontWeight: 700 }}> · {r.unassigned} unassigned</span>}
        </Td>
        <Td r>{r.packageCount}</Td>
        <Td r>{r.lastOrder ? dateUS(r.lastOrder) : <span style={{ color: X.slate }}>never</span>}</Td>
      </tr>
      {open && r.storeRows.map((s) => (
        <tr key={s.id} style={{ background: '#FBFAF6' }}>
          <Td style={{ paddingLeft: 26, fontSize: 13 }}>{s.name}</Td>
          <Td style={{ fontSize: 12.5, color: X.slate }}>{[s.city, s.state].filter(Boolean).join(', ') || '—'}</Td>
          <Td style={{ fontSize: 12.5 }}>{s.programName ?? <span style={{ color: X.red, fontWeight: 700 }}>no program</span>}</Td>
          <Td r style={{ fontSize: 12.5, color: X.slate }}>{s.lastOrder ? dateUS(s.lastOrder) : 'never'}</Td>
          <Td r>
            <button onClick={(e) => { e.stopPropagation(); onPricing(s) }} style={rowBtn}>Store pricing</button>
            <button onClick={(e) => { e.stopPropagation(); onOrder(s) }} style={{ ...rowBtn, background: X.yellow, color: X.black, borderColor: X.yellow, marginLeft: 6 }}>Place order</button>
          </Td>
        </tr>
      ))}
    </>
  )
}

function OrdersTab({ filter, setFilter, focus }) {
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const load = () => getOrders().then(setOrders).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter)
  const title = filter === 'all' ? 'All Orders' : `Orders — ${filter.replace('_', ' ')}`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <TabNav tabs={STATUS_TABS} value={filter} onChange={setFilter} style={{ marginBottom: 0 }} />
        <button onClick={() => setWizardOpen(true)} style={{ background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: FONT.body }}>+ Order for a store</button>
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      <OrdersList orders={shown} title={title} focus={focus} onChanged={load} />
      <OrderWizard open={wizardOpen} adminMode onClose={() => setWizardOpen(false)} onCreated={load} />
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,19,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 20px', overflowY: 'auto' }}>
      <div className="x-fade" onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(960px, 100%)', padding: 0, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: X.black, color: X.white, padding: '14px 20px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {title}
          <button onClick={onClose} style={{ background: 'transparent', color: 'rgba(255,255,253,0.7)', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}

const Chip = ({ children }) => (
  <span style={{ display: 'inline-block', background: X.stone, borderRadius: 999, padding: '2.5px 10px', fontSize: 11.5, fontWeight: 600, marginRight: 4, marginBottom: 2 }}>{children}</span>
)

const Stat = ({ label, value, format, onClick }) => {
  const shown = useCountUp(value)
  const display = typeof value === 'number'
    ? (format ? format(shown) : Math.round(shown).toLocaleString())
    : value
  return (
    <button onClick={onClick} className="x-lift"
      style={{ position: 'relative', overflow: 'hidden', background: X.black, borderRadius: 16, padding: 18, border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: FONT.body, boxShadow: '0 10px 28px rgba(20,18,19,0.18)' }}>
      <Sheen />
      <div style={{ color: X.white, fontSize: 23, fontWeight: 800, whiteSpace: 'nowrap' }}>{display}</div>
      <div style={{ color: X.yellow, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: FONT.subWeight, marginTop: 4 }}>{label} →</div>
    </button>
  )
}

const Panel = ({ title, children }) => (
  <div style={{ ...CARD, padding: 22, marginTop: 16, minWidth: 0, overflowX: 'auto' }}>
    <Eyebrow>{title}</Eyebrow>
    {children}
  </div>
)

const Th = ({ children, r }) => <th style={{ textAlign: r ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: X.slate, padding: '8px 6px', borderBottom: `1px solid ${X.gray}` }}>{children}</th>
const Td = ({ children, r, style, colSpan }) => <td colSpan={colSpan} style={{ textAlign: r ? 'right' : 'left', fontSize: 14, padding: '8px 6px', borderBottom: `1px solid ${X.line}`, ...style }}>{children}</td>
const tbl = { width: '100%', borderCollapse: 'collapse', marginTop: 12 }
const rowBtn = { background: 'transparent', color: X.black, border: `1px solid ${X.gray}`, borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: FONT.body }
