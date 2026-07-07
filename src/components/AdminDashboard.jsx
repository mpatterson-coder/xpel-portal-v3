import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getGroups, getDealerships, getOrders, getNetworkPerformance } from '../lib/db'
import UsersAdmin from './UsersAdmin'
import NetworkAdmin from './NetworkAdmin'
import CatalogAdmin from './CatalogAdmin'

const X = { yellow: '#FDB521', black: '#000', teal: '#1A9392', slate: '#505A72', red: '#C94543', gray: '#D1D3D5', green: '#2E7D5B' }
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const STATUSES = ['submitted', 'in_review', 'approved', 'in_progress', 'completed', 'cancelled']
const TABS = { overview: 'Overview', users: 'Users', network: 'Network', catalog: 'Catalog & Pricing' }

// The Admin (XPEL) area: network-wide oversight PLUS in-app management of
// users, the dealer network, and the catalog. All management writes are
// admin-only, enforced by the database's row-level security.
export default function AdminDashboard() {
  const [tab, setTab] = useState('overview')
  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {Object.entries(TABS).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              border: `1px solid ${tab === k ? X.black : X.gray}`, background: tab === k ? X.black : '#fff',
              color: tab === k ? '#fff' : X.slate, borderRadius: 6, padding: '8px 14px', fontSize: 12,
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
              fontFamily: "'Jost', sans-serif",
            }}>{lbl}</button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'network' && <NetworkAdmin />}
      {tab === 'catalog' && <CatalogAdmin />}
    </div>
  )
}

function OverviewTab() {
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
      return {
        name: g.name,
        rooftops: rooftopsByGroup.get(g.id) || 0,
        orders: ordersByGroup.get(g.id) || 0,
        revenue: p.revenue, margin: p.margin, marginPct: p.marginPct,
      }
    })
    const statusCounts = STATUSES.map((s) => ({ status: s, n: orders.filter((o) => o.status === s).length }))
    return { revenue, rows, statusCounts }
  }, [groups, dealerships, orders, perf])

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>Network Overview</h2>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat label="Dealer groups" value={groups.length} />
        <Stat label="Enrolled rooftops" value={dealerships.length} />
        <Stat label="Orders" value={orders.length} />
        <Stat label="Network revenue" value={money(view.revenue)} />
      </div>

      <Panel title="Sales performance by group">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={view.rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Jost' }} />
            <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 11 }} width={70} />
            <Tooltip formatter={(v) => money(v)} />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
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
              <tr key={r.name}>
                <Td>{r.name}</Td><Td r>{r.rooftops}</Td><Td r>{r.orders}</Td>
                <Td r>{money(r.revenue)}</Td><Td r style={{ color: X.teal }}>{money(r.margin)}</Td><Td r>{r.marginPct}%</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Operational performance">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {view.statusCounts.map((s) => (
            <div key={s.status} style={opCard}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{s.n}</div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, fontFamily: 'Jost' }}>{s.status.replace('_', ' ')}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

const Stat = ({ label, value }) => (
  <div style={{ background: X.black, borderRadius: 10, padding: 18 }}>
    <div style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>{value}</div>
    <div style={{ color: X.yellow, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: 'Jost', marginTop: 4 }}>{label}</div>
  </div>
)
const Panel = ({ title, children }) => (
  <div style={{ background: '#fff', border: `1px solid ${X.gray}`, borderRadius: 10, padding: 20, marginTop: 16 }}>
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: X.slate, fontFamily: 'Jost', marginBottom: 12 }}>{title}</div>
    {children}
  </div>
)
const Th = ({ children, r }) => <th style={{ textAlign: r ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, padding: '8px 6px', borderBottom: `1px solid ${X.gray}` }}>{children}</th>
const Td = ({ children, r, style }) => <td style={{ textAlign: r ? 'right' : 'left', fontSize: 14, padding: '8px 6px', borderBottom: `1px solid #EEF0F2`, ...style }}>{children}</td>
const tbl = { width: '100%', borderCollapse: 'collapse', marginTop: 12 }
const opCard = { flex: '1 1 120px', background: '#FAFBFC', border: `1px solid ${X.gray}`, borderRadius: 8, padding: 14, textAlign: 'center' }
