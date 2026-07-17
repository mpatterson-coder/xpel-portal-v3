import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getGroups, getDealerships, getOrders, getNetworkPerformance } from '../lib/db'
import UsersAdmin from './UsersAdmin'
import NetworkAdmin from './NetworkAdmin'
import CatalogAdmin from './CatalogAdmin'
import DealersAdmin from './DealersAdmin'
import OrdersList from './OrdersList'
import PerformanceDashboard from './PerformanceDashboard'
import { usePersistentState } from '../lib/uiState'
import { COLOR as X, FONT, CARD, money as fm } from '../lib/theme'
import TabNav from './TabNav'
import { Eyebrow, Sheen, useCountUp } from './ui'

const money = (n) => fm(n, 0)
const STATUSES = ['submitted', 'in_review', 'approved', 'in_progress', 'completed', 'cancelled']
const STATUS_TABS = { all: 'All', submitted: 'Submitted', in_review: 'In Review', approved: 'Approved', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }
const TABS = { overview: 'Overview', performance: 'Performance', orders: 'Orders', users: 'Users', network: 'Dealerships', dealers: 'Authorized Installers', catalog: 'Catalog & Programs' }

// Admin area. The Overview is fully interactive: stat cards and status tiles
// navigate to the data they represent (Orders view with a preset filter, the
// Network tab, etc.).
export default function AdminDashboard() {
  const [tab, setTab] = usePersistentState('xpel.admin.tab', 'overview')
  const [orderFilter, setOrderFilter] = usePersistentState('xpel.admin.orderFilter', 'all')

  const go = (nextTab, filter) => {
    if (filter) setOrderFilter(filter)
    setTab(nextTab)
  }

  return (
    <div style={{ maxWidth: 1000, fontFamily: FONT.body }}>
      <TabNav tabs={TABS} value={tab} onChange={(k) => { if (k === 'orders') setOrderFilter('all'); setTab(k) }} />
      {tab === 'overview' && <OverviewTab onNavigate={go} />}
      {tab === 'performance' && <PerformanceDashboard mode="admin" />}
      {tab === 'orders' && <OrdersTab filter={orderFilter} setFilter={setOrderFilter} />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'network' && <NetworkAdmin />}
      {tab === 'dealers' && <DealersAdmin />}
      {tab === 'catalog' && <CatalogAdmin />}
    </div>
  )
}

function OverviewTab({ onNavigate }) {
  const [groups, setGroups] = useState([])
  const [dealerships, setDealerships] = useState([])
  const [orders, setOrders] = useState([])
  const [perf, setPerf] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([getGroups(), getDealerships(), getOrders(), getNetworkPerformance()])
      .then(([g, d, o, p]) => { setGroups(g); setDealerships(d); setOrders(o); setPerf(p) })
      .catch((e) => setErr(e.message))
  }, [])

  const view = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
    const rooftopsByGroup = new Map()
    const ordersByGroup = new Map()
    for (const d of dealerships) rooftopsByGroup.set(d.group_id, (rooftopsByGroup.get(d.group_id) || 0) + 1)
    for (const o of orders) ordersByGroup.set(o.group_id, (ordersByGroup.get(o.group_id) || 0) + 1)
    const perfByGroup = new Map(perf.map((p) => [p.group_id, p]))
    const rows = groups.map((g) => {
      const p = perfByGroup.get(g.id) || { revenue: 0, margin: 0, marginPct: 0 }
      return { name: g.name, rooftops: rooftopsByGroup.get(g.id) || 0, orders: ordersByGroup.get(g.id) || 0, revenue: p.revenue, margin: p.margin, marginPct: p.marginPct }
    })
    const statusCounts = STATUSES.map((s) => ({ status: s, n: orders.filter((o) => o.status === s).length }))
    return { revenue, rows, statusCounts }
  }, [groups, dealerships, orders, perf])

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: FONT.headingWeight }}>Network Overview</h2>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat label="Dealership groups" value={groups.length} onClick={() => onNavigate('network')} />
        <Stat label="Enrolled rooftops" value={dealerships.length} onClick={() => onNavigate('network')} />
        <Stat label="Orders" value={orders.length} onClick={() => onNavigate('orders', 'all')} />
        <Stat label="Network revenue" value={view.revenue} format={money} onClick={() => onNavigate('orders', 'all')} />
      </div>

      <Panel title="Sales performance by group">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={view.rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Arial', fill: X.slate }} tickLine={false} axisLine={{ stroke: X.stone }} />
            <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 11, fill: X.slate }} width={70} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ background: '#141213', border: 'none', borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.35)', padding: '10px 12px' }} labelStyle={{ color: 'rgba(255,255,253,0.7)', fontSize: 11 }} itemStyle={{ color: '#FFFFFD' }} cursor={{ fill: 'rgba(231,228,218,0.35)' }} />
            <Bar dataKey="revenue" radius={[6, 6, 0, 0]} cursor="pointer" onClick={() => onNavigate('orders', 'all')}>
              {view.rows.map((_, i) => <Cell key={i} fill={X.yellow} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <table style={tbl}>
          <thead>
            <tr><Th>Group</Th><Th r>Rooftops</Th><Th r>Orders</Th><Th r>Revenue</Th><Th r>Margin</Th><Th r>Margin %</Th></tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.name} onClick={() => onNavigate('orders', 'all')} style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = X.bg}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                <Td>{r.name}</Td><Td r>{r.rooftops}</Td><Td r>{r.orders}</Td>
                <Td r>{money(r.revenue)}</Td><Td r style={{ color: X.green }}>{money(r.margin)}</Td><Td r>{r.marginPct}%</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Operational performance — click a status to see its orders">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {view.statusCounts.map((s) => (
            <button key={s.status} onClick={() => onNavigate('orders', s.status)} className="x-lift" style={opCard}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{s.n}</div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, color: X.slate, fontWeight: FONT.subWeight }}>
                {s.status.replace('_', ' ')}
              </div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function OrdersTab({ filter, setFilter }) {
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')
  useEffect(() => { getOrders().then(setOrders).catch((e) => setErr(e.message)) }, [])

  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter)
  const title = filter === 'all' ? 'All Orders' : `Orders — ${filter.replace('_', ' ')}`

  return (
    <div>
      <TabNav tabs={STATUS_TABS} value={filter} onChange={setFilter} style={{ marginBottom: 12 }} />
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      <OrdersList orders={shown} title={title} />
    </div>
  )
}

const Stat = ({ label, value, format, onClick }) => {
  const shown = useCountUp(value)
  const display = typeof value === 'number'
    ? (format ? format(shown) : Math.round(shown).toLocaleString())
    : value
  return (
    <button onClick={onClick} className="x-lift"
      style={{ position: 'relative', overflow: 'hidden', background: X.black, borderRadius: 16, padding: 18, border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: FONT.body, boxShadow: '0 10px 28px rgba(20,18,19,0.18)' }}>
      <Sheen />
      <div style={{ color: X.white, fontSize: 26, fontWeight: 800 }}>{display}</div>
      <div style={{ color: X.yellow, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: FONT.subWeight, marginTop: 4 }}>{label} →</div>
    </button>
  )
}

const Panel = ({ title, children }) => (
  <div style={{ ...CARD, padding: 22, marginTop: 16 }}>
    <Eyebrow>{title}</Eyebrow>
    {children}
  </div>
)

const Th = ({ children, r }) => <th style={{ textAlign: r ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: X.slate, padding: '8px 6px', borderBottom: `1px solid ${X.gray}` }}>{children}</th>
const Td = ({ children, r, style }) => <td style={{ textAlign: r ? 'right' : 'left', fontSize: 14, padding: '8px 6px', borderBottom: `1px solid ${X.line}`, ...style }}>{children}</td>
const tbl = { width: '100%', borderCollapse: 'collapse', marginTop: 12 }
const opCard = { flex: '1 1 120px', background: X.bg, border: '1px solid rgba(20,18,19,0.05)', borderRadius: 12, padding: 14, textAlign: 'center', cursor: 'pointer', fontFamily: FONT.body }
