import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getGroups, getDealerships, getOrders, getNetworkPerformance } from '../lib/db'
import UsersAdmin from './UsersAdmin'
import NetworkAdmin from './NetworkAdmin'
import CatalogAdmin from './CatalogAdmin'
import OrdersList from './OrdersList'
import { usePersistentState } from '../lib/uiState'
import { COLOR as X, FONT, money as fm } from '../lib/theme'

const money = (n) => fm(n, 0)
const STATUSES = ['submitted', 'in_review', 'approved', 'in_progress', 'completed', 'cancelled']
const TABS = { overview: 'Overview', orders: 'Orders', users: 'Users', network: 'Network', catalog: 'Catalog & Pricing' }

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
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(TABS).map(([k, lbl]) => (
          <button key={k} onClick={() => { if (k === 'orders') setOrderFilter('all'); setTab(k) }}
            style={{
              border: `1px solid ${tab === k ? X.black : X.gray}`, background: tab === k ? X.black : '#fff',
              color: tab === k ? '#fff' : X.slate, borderRadius: 8, padding: '8px 14px', fontSize: 12,
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, cursor: 'pointer',
              fontFamily: FONT.body,
            }}>{lbl}</button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab onNavigate={go} />}
      {tab === 'orders' && <OrdersTab filter={orderFilter} setFilter={setOrderFilter} />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'network' && <NetworkAdmin />}
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
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: FONT.headingWeight }}>Network Overview</h2>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat label="Dealer groups" value={groups.length} onClick={() => onNavigate('network')} />
        <Stat label="Enrolled rooftops" value={dealerships.length} onClick={() => onNavigate('network')} />
        <Stat label="Orders" value={orders.length} onClick={() => onNavigate('orders', 'all')} />
        <Stat label="Network revenue" value={money(view.revenue)} onClick={() => onNavigate('orders', 'all')} />
      </div>

      <Panel title="Sales performance by group">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={view.rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Arial' }} />
            <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 11 }} width={70} />
            <Tooltip formatter={(v) => money(v)} />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]} cursor="pointer" onClick={() => onNavigate('orders', 'all')}>
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
            <button key={s.status} onClick={() => onNavigate('orders', s.status)} style={opCard}>
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all', ...STATUSES].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ ...chip, ...(filter === s ? chipOn : {}) }}>
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      <OrdersList orders={shown} title={title} />
    </div>
  )
}

const Stat = ({ label, value, onClick }) => (
  <button onClick={onClick}
    style={{ background: X.black, borderRadius: 12, padding: 18, border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: FONT.body }}
    onMouseEnter={(e) => e.currentTarget.style.outline = `2px solid ${X.yellow}`}
    onMouseLeave={(e) => e.currentTarget.style.outline = 'none'}>
    <div style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>{value}</div>
    <div style={{ color: X.yellow, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: FONT.subWeight, marginTop: 4 }}>{label} →</div>
  </button>
)

const Panel = ({ title, children }) => (
  <div style={{ background: '#fff', border: `1px solid ${X.line}`, borderRadius: 12, padding: 20, marginTop: 16 }}>
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, color: X.slate, fontWeight: FONT.subWeight, marginBottom: 12 }}>{title}</div>
    {children}
  </div>
)

const Th = ({ children, r }) => <th style={{ textAlign: r ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: X.slate, padding: '8px 6px', borderBottom: `1px solid ${X.gray}` }}>{children}</th>
const Td = ({ children, r, style }) => <td style={{ textAlign: r ? 'right' : 'left', fontSize: 14, padding: '8px 6px', borderBottom: `1px solid ${X.line}`, ...style }}>{children}</td>
const tbl = { width: '100%', borderCollapse: 'collapse', marginTop: 12 }
const opCard = { flex: '1 1 120px', background: X.bg, border: `1px solid ${X.line}`, borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer', fontFamily: FONT.body }
const chip = { border: `1px solid ${X.gray}`, background: '#fff', color: X.slate, borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer', fontFamily: FONT.body }
const chipOn = { background: X.black, color: '#fff', borderColor: X.black }
