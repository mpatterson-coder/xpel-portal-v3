import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts'
import { fetchPerformanceRows, applyFilters, computeTotals, timeSeries, breakdown, filterOptions, ordersFromRows, makeBucketKey } from '../lib/analytics'
import { downloadCsv } from '../lib/csv'
import { usePersistentState } from '../lib/uiState'
import { COLOR as X, FONT, CARD, STATUS_TONE, money, dateUS } from '../lib/theme'
import { Eyebrow, Sheen, Spinner, useCountUp } from './ui'

// =============================================================================
// The performance dashboard, shared by all three roles via `mode`:
//
//   mode="dealership" -> retail revenue + THEIR margin (profitability of the
//                        program at this store). Filters: date, product line,
//                        package.
//   mode="installer"  -> WHOLESALE numbers only (what the shop bills the
//                        dealership). Retail and margin are never computed or
//                        shown in this mode.
//   mode="admin"      -> full transparency: retail, wholesale, and margin,
//                        plus group filter and group/rooftop breakdowns.
//
// The data feed is identical for everyone; RLS trims it to what each user is
// allowed to see (see analytics.js).
// =============================================================================

const PRESETS = { 30: 'Last 30 days', 90: 'Last 90 days', ytd: 'Year to date', all: 'All time', custom: 'Custom range' }

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysAgoStr = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_FILTERS = { preset: 'all', from: '', to: '', category: '', productId: '', groupId: '' }

export default function PerformanceDashboard({ mode, onOpenOrder }) {
  const [rows, setRows] = useState(null)   // null = loading
  const [err, setErr] = useState('')
  const [fRaw, setF] = usePersistentState(`xpel.perf.${mode}.filters`, EMPTY_FILTERS)
  const f = { ...EMPTY_FILTERS, ...fRaw }

  useEffect(() => { fetchPerformanceRows().then(setRows).catch((e) => setErr(e.message)) }, [])

  const opts = useMemo(() => filterOptions(rows ?? []), [rows])

  // Resolve the date preset into an actual from/to range.
  const range = useMemo(() => {
    if (f.preset === 'custom') return { from: f.from, to: f.to }
    if (f.preset === 'ytd') return { from: `${new Date().getFullYear()}-01-01`, to: todayStr() }
    if (f.preset === 'all') return { from: '', to: '' }
    return { from: daysAgoStr(Number(f.preset)), to: todayStr() }
  }, [f.preset, f.from, f.to])

  const filtered = useMemo(
    () => applyFilters(rows ?? [], { ...range, category: f.category, productId: f.productId, groupId: f.groupId }),
    [rows, range, f.category, f.productId, f.groupId],
  )
  const totals = useMemo(() => computeTotals(filtered), [filtered])
  const series = useMemo(() => timeSeries(filtered), [filtered])
  const byProduct = useMemo(() => breakdown(filtered, 'productName'), [filtered])
  const byCategory = useMemo(() => breakdown(filtered, 'category'), [filtered])
  const byGroup = useMemo(() => (mode === 'admin' ? breakdown(filtered, 'groupName') : []), [filtered, mode])
  const byRooftop = useMemo(() => (mode !== 'dealership' ? breakdown(filtered, 'dealershipName') : []), [filtered, mode])
  const bySeller = useMemo(() => (mode === 'dealership' ? breakdown(filtered, 'sellerName') : []), [filtered, mode])
  const byTitle = useMemo(() => (mode === 'dealership' ? breakdown(filtered, 'sellerTitle') : []), [filtered, mode])
  const sellerTitles = useMemo(() => {
    const m = new Map()
    for (const r of filtered) if (r.sellerName && !m.has(r.sellerName)) m.set(r.sellerName, r.sellerTitle)
    return m
  }, [filtered])

  // Which money column drives bars/sorting in this mode.
  const valueKey = mode === 'installer' ? 'wholesale' : 'retail'
  const fm0 = (n) => money(n, 0)

  // Drill-down: every number opens the list of orders behind it.
  const [drill, setDrill] = useState(null)
  const openDrill = (title, drillRows, metric, only = null) =>
    setDrill({ title, rows: drillRows, metric, only })

  // Full filtered dataset as a spreadsheet (role-appropriate columns).
  const exportAll = () => {
    const list = ordersFromRows(filtered)
    const base = ['Order #', 'Date', 'Status', 'Customer', 'Vehicle', mode === 'dealership' ? 'Seller' : 'Store', 'Packages']
    const moneyCols = mode === 'installer'
      ? ['Wholesale', 'Completion days']
      : ['Retail', 'Wholesale', 'Margin', 'Discount', 'Completion days']
    downloadCsv(`xpel-performance-${mode}.csv`, [...base, ...moneyCols], list.map((o) => [
      o.orderNumber, dateUS(o.date), o.status, o.customerName, o.vehicle,
      mode === 'dealership' ? o.sellerName : o.dealershipName, o.units,
      ...(mode === 'installer'
        ? [o.wholesale.toFixed(2), o.completionDays != null ? o.completionDays.toFixed(1) : '']
        : [o.retail.toFixed(2), o.wholesale.toFixed(2), o.margin.toFixed(2), o.discount.toFixed(2), o.completionDays != null ? o.completionDays.toFixed(1) : '']),
    ]))
  }
  const productsInCategory = f.category ? opts.products.filter((p) => p.category === f.category) : opts.products
  const filtersActive = f.preset !== 'all' || f.category || f.productId || f.groupId

  const titles = {
    dealership: ['Store Performance', 'Margin on every order, tracked live.'],
    installer: ['Shop Performance', 'Wholesale volume billed to your dealerships.'],
    admin: ['Network Performance', 'Full-transparency view across every group, rooftop, and product.'],
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: FONT.headingWeight }}>{titles[mode][0]}</h2>
      <div style={{ fontSize: 13, color: X.slate, marginBottom: 14 }}>{titles[mode][1]}</div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select value={f.preset} onChange={(e) => setF({ ...f, preset: e.target.value })} style={sel}>
          {Object.entries(PRESETS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {f.preset === 'custom' && (
          <>
            <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} style={sel} />
            <span style={{ color: X.slate, fontSize: 12 }}>to</span>
            <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} style={sel} />
          </>
        )}
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, productId: '' })} style={sel}>
          <option value="">All product lines</option>
          {opts.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })} style={sel}>
          <option value="">All packages</option>
          {productsInCategory.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {mode === 'admin' && (
          <select value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })} style={sel}>
            <option value="">All groups</option>
            {opts.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {filtersActive && (
          <button onClick={() => setF(EMPTY_FILTERS)} style={clearBtn}>Clear filters</button>
        )}
        {rows !== null && filtered.length > 0 && (
          <button onClick={exportAll} style={clearBtn} title="Download every order in the current view as a spreadsheet">Export CSV</button>
        )}
      </div>

      {rows === null && !err && <Spinner label="Loading performance data…" />}

      {rows !== null && (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {mode === 'dealership' && (
              <>
                <Kpi label="Revenue (retail)" value={totals.retail} format={fm0}
                  onClick={() => openDrill('Revenue (retail)', filtered, 'retail')} />
                <Kpi label="Your margin" value={totals.margin} format={fm0} sub={`${totals.marginPct}% of revenue`}
                  onClick={() => openDrill('Your margin', filtered, 'margin')} />
                <Kpi label="Orders" value={totals.orders} sub={`${totals.units} packages sold`}
                  onClick={() => openDrill('All orders', filtered, 'retail')} />
                <Kpi label="Avg order" value={totals.avgOrder} format={fm0}
                  onClick={() => openDrill('All orders (avg basis)', filtered, 'retail')} />
                <Kpi label="Discounts given" value={totals.discount} format={fm0} sub="off list price"
                  onClick={() => openDrill('Discounted orders', filtered, 'discount', (o) => o.discount > 0)} />
              </>
            )}
            {mode === 'installer' && (
              <>
                <Kpi label="Wholesale revenue" value={totals.wholesale} format={fm0}
                  onClick={() => openDrill('Wholesale revenue', filtered, 'wholesale')} />
                <Kpi label="Jobs" value={totals.orders}
                  onClick={() => openDrill('All jobs', filtered, 'wholesale')} />
                <Kpi label="Packages installed" value={totals.units}
                  onClick={() => openDrill('Packages installed', filtered, 'units')} />
                <Kpi label="Jobs completed" value={totals.completed} sub={`avg ${fm0(totals.avgWholesaleOrder)} / job`}
                  onClick={() => openDrill('Completed jobs', filtered, 'wholesale', (o) => o.status === 'completed')} />
                <Kpi label="Avg completion" value={totals.avgCompletionDays ?? '—'} format={(v) => `${v.toFixed(1)} days`} sub="submitted → completed"
                  onClick={() => openDrill('Completed jobs — days to complete', filtered, 'completionDays', (o) => o.completionDays != null)} />
              </>
            )}
            {mode === 'admin' && (
              <>
                <Kpi label="Retail revenue" value={totals.retail} format={fm0}
                  onClick={() => openDrill('Retail revenue', filtered, 'retail')} />
                <Kpi label="Wholesale revenue" value={totals.wholesale} format={fm0}
                  onClick={() => openDrill('Wholesale revenue', filtered, 'wholesale')} />
                <Kpi label="Dealer margin" value={totals.margin} format={fm0} sub={`${totals.marginPct}% of retail`}
                  onClick={() => openDrill('Dealer margin', filtered, 'margin')} />
                <Kpi label="Orders" value={totals.orders} sub={`${totals.units} packages`}
                  onClick={() => openDrill('All orders', filtered, 'retail')} />
              </>
            )}
          </div>

          {filtered.length === 0 && (
            <div style={{ color: X.slate, fontSize: 14, marginTop: 20 }}>No orders match these filters yet.</div>
          )}

          {filtered.length > 0 && (
            <>
              <Panel title="Revenue over time">
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
                    onClick={(e) => {
                      const lbl = e?.activeLabel
                      if (!lbl) return
                      const keyOf = makeBucketKey(filtered)
                      openDrill(lbl, filtered.filter((r) => keyOf(r.date) === lbl), valueKey)
                    }}>
                    <defs>
                      <linearGradient id="xPrimaryFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={X.black} stopOpacity={0.10} />
                        <stop offset="100%" stopColor={X.black} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={X.stone} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'Arial', fill: X.slate }} tickLine={false} axisLine={{ stroke: X.stone }} />
                    <YAxis tickFormatter={fm0} tick={{ fontSize: 11, fill: X.slate }} width={74} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => fm0(v)} contentStyle={tipStyle} labelStyle={tipLabel} itemStyle={{ color: X.white }} cursor={{ stroke: X.gray }} />
                    {mode !== 'installer' && <Legend wrapperStyle={{ fontSize: 12 }} />}
                    {mode !== 'installer' && <Area type="monotone" dataKey="retail" name="Retail" stroke={X.black} strokeWidth={2.5} fill="url(#xPrimaryFill)" dot={false} activeDot={{ r: 4, fill: X.yellow, stroke: X.black, strokeWidth: 2 }} />}
                    {mode === 'admin' && <Line type="monotone" dataKey="wholesale" name="Wholesale" stroke={X.slate} strokeWidth={2} dot={false} />}
                    {mode !== 'installer' && <Line type="monotone" dataKey="margin" name="Margin" stroke={X.green} strokeWidth={2} dot={false} />}
                    {mode === 'installer' && <Area type="monotone" dataKey="wholesale" name="Wholesale revenue" stroke={X.black} strokeWidth={2.5} fill="url(#xPrimaryFill)" dot={false} activeDot={{ r: 4, fill: X.yellow, stroke: X.black, strokeWidth: 2 }} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </Panel>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                <Panel title="Package performance">
                  <BarList items={byProduct} valueKey={valueKey} totals={totals} mode={mode}
                    onSelect={(i) => openDrill(i.name, filtered.filter((r) => r.productName === i.name), valueKey)} />
                </Panel>
                <Panel title="Product line mix">
                  <BarList items={byCategory} valueKey={valueKey} totals={totals} mode={mode}
                    onSelect={(i) => openDrill(i.name, filtered.filter((r) => r.category === i.name), valueKey)} />
                </Panel>
              </div>

              {mode === 'dealership' && (
                <>
                  <Panel title="Top sellers">
                    {bySeller.length === 0 ? (
                      <div style={{ fontSize: 13, color: X.slate }}>No orders in this range yet.</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT.body }}>
                        <thead>
                          <tr><Th>Team member</Th><Th r>Orders</Th><Th r>Packages</Th><Th r>Retail</Th><Th r>Margin</Th></tr>
                        </thead>
                        <tbody>
                          {[...bySeller].sort((a, b) => b.retail - a.retail).slice(0, 12).map((sl) => (
                            <tr key={sl.key} style={{ cursor: 'pointer' }} title="See this person's orders"
                                onClick={() => openDrill(sl.name, filtered.filter((r) => r.sellerName === sl.name), 'retail')}
                                onMouseEnter={(e) => { e.currentTarget.style.background = X.bg }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>
                              <td style={sellerTd}>
                                <div style={{ fontWeight: 600 }}>{sl.name}</div>
                                <div style={{ fontSize: 11.5, color: X.slate }}>{sellerTitles.get(sl.name) ?? ''}</div>
                              </td>
                              <td style={{ ...sellerTd, textAlign: 'right' }}>{sl.orders}</td>
                              <td style={{ ...sellerTd, textAlign: 'right' }}>{sl.units}</td>
                              <td style={{ ...sellerTd, textAlign: 'right', fontWeight: 700 }}>{fm0(sl.retail)}</td>
                              <td style={{ ...sellerTd, textAlign: 'right', color: X.green }}>{fm0(sl.margin)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Panel>
                  <Panel title="By department (title)">
                    <BarList items={byTitle} valueKey="retail" totals={totals} mode={mode}
                      onSelect={(i) => openDrill(i.name, filtered.filter((r) => r.sellerTitle === i.name), 'retail')} />
                  </Panel>
                </>
              )}

              {mode === 'installer' && (
                <Panel title="By store (wholesale)">
                  <BarList items={byRooftop} valueKey="wholesale" totals={totals} mode={mode}
                    onSelect={(i) => openDrill(i.name, filtered.filter((r) => r.dealershipName === i.name), 'wholesale')} />
                </Panel>
              )}

              {mode === 'admin' && (
                <>
                  <Panel title="Performance by dealer group">
                    <BarList items={byGroup} valueKey="retail" totals={totals} mode={mode}
                      onSelect={(i) => openDrill(i.name, filtered.filter((r) => r.groupName === i.name), 'retail')} />
                  </Panel>
                  <Panel title="Top rooftops">
                    <table style={tbl}>
                      <thead>
                        <tr><Th>Rooftop</Th><Th r>Orders</Th><Th r>Packages</Th><Th r>Retail</Th><Th r>Margin</Th></tr>
                      </thead>
                      <tbody>
                        {[...byRooftop].sort((a, b) => b.retail - a.retail).slice(0, 10).map((r) => (
                          <tr key={r.key} style={{ transition: 'background .15s ease', cursor: 'pointer' }} title="See this rooftop's orders"
                              onClick={() => openDrill(r.name, filtered.filter((x) => x.dealershipName === r.name), 'retail')}
                              onMouseEnter={(e) => { e.currentTarget.style.background = X.bg }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>
                            <Td>{r.name}</Td><Td r>{r.orders}</Td><Td r>{r.units}</Td>
                            <Td r>{fm0(r.retail)}</Td><Td r style={{ color: X.green }}>{fm0(r.margin)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Panel>
                </>
              )}

              <div style={{ fontSize: 11.5, color: X.slate, marginTop: 14 }}>
                Cancelled orders are excluded. Wholesale, retail, and margin are frozen onto each order
                at submission — later price changes never rewrite history. Avg completion counts days from
                submitted to completed. Every KPI card, bar, table row, and chart point is clickable —
                tap any number to see the exact orders behind it.
              </div>
            </>
          )}
        </>
      )}

      {drill && (
        <DrillPanel drill={drill} mode={mode}
          onClose={() => setDrill(null)}
          onOpenOrder={onOpenOrder} />
      )}
    </div>
  )
}

// Horizontal bar list: sorted by the mode's money basis, XPEL Yellow fill.
function BarList({ items, valueKey, mode, onSelect }) {
  const sorted = [...items].sort((a, b) => b[valueKey] - a[valueKey])
  const max = Math.max(...sorted.map((i) => i[valueKey]), 1)
  return (
    <div>
      {sorted.map((i) => (
        <div key={i.key}
          onClick={onSelect ? () => onSelect(i) : undefined}
          title={onSelect ? 'See the orders behind this bar' : undefined}
          onMouseEnter={onSelect ? (e) => { e.currentTarget.style.background = X.bg } : undefined}
          onMouseLeave={onSelect ? (e) => { e.currentTarget.style.background = '' } : undefined}
          style={{ marginBottom: 12, cursor: onSelect ? 'pointer' : 'default', borderRadius: 10, padding: '4px 6px', margin: '0 -6px 8px', transition: 'background .15s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
            <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {money(i[valueKey], 0)}
              <span style={{ color: X.slate, fontSize: 12 }}> · {i.units} unit{i.units === 1 ? '' : 's'}</span>
              {mode !== 'installer' && <span style={{ color: X.green, fontSize: 12 }}> · {money(i.margin, 0)} margin</span>}
            </span>
          </div>
          <div style={{ height: 8, background: X.stone, borderRadius: 999, marginTop: 5, overflow: 'hidden' }}>
            <div style={{ width: `${(i[valueKey] / max) * 100}%`, height: '100%', background: X.yellow, borderRadius: 999, transition: 'width .45s cubic-bezier(.2,.7,.3,1)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// The drill-down: a modal listing the exact ORDERS behind whichever number was
// clicked — one line per order, metric-relevant value on the right, CSV export,
// and (when the dashboard provides it) a jump straight to the real order.
// =============================================================================
function DrillPanel({ drill, mode, onClose, onOpenOrder }) {
  const list = useMemo(() => {
    let l = ordersFromRows(drill.rows)
    if (drill.only) l = l.filter(drill.only)
    return l
  }, [drill])

  const metric = drill.metric
  const metricLabel = { retail: 'Retail', wholesale: 'Wholesale', margin: 'Margin', discount: 'Discount', completionDays: 'Days', units: 'Pkgs' }[metric] ?? 'Value'
  const fmtMetric = (o) => metric === 'completionDays'
    ? (o.completionDays != null ? `${o.completionDays.toFixed(1)} d` : '—')
    : metric === 'units'
      ? o.units
      : money(o[metric] ?? 0, 0)
  const metricTotal = metric === 'completionDays' || metric === 'units'
    ? null
    : list.reduce((s2, o) => s2 + (o[metric] ?? 0), 0)

  const exportDrill = () => {
    const base = ['Order #', 'Date', 'Status', 'Customer', 'Vehicle', mode === 'dealership' ? 'Seller' : 'Store', 'Packages']
    const moneyCols = mode === 'installer'
      ? ['Wholesale', 'Completion days']
      : ['Retail', 'Wholesale', 'Margin', 'Discount', 'Completion days']
    downloadCsv(
      `xpel-${String(drill.title || 'orders').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
      [...base, ...moneyCols],
      list.map((o) => [
        o.orderNumber, dateUS(o.date), o.status, o.customerName, o.vehicle,
        mode === 'dealership' ? o.sellerName : o.dealershipName, o.units,
        ...(mode === 'installer'
          ? [o.wholesale.toFixed(2), o.completionDays != null ? o.completionDays.toFixed(1) : '']
          : [o.retail.toFixed(2), o.wholesale.toFixed(2), o.margin.toFixed(2), o.discount.toFixed(2), o.completionDays != null ? o.completionDays.toFixed(1) : '']),
      ]),
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,19,0.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="x-fade" onClick={(e) => e.stopPropagation()}
        style={{ ...CARD, width: 'min(780px, 100%)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: X.black, color: X.white, padding: '14px 18px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{drill.title}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,253,0.65)' }}>
              {list.length} order{list.length === 1 ? '' : 's'}
              {metricTotal != null && <> · {metricLabel} total {money(metricTotal, 0)}</>}
            </div>
          </div>
          <button onClick={exportDrill} style={drillCsvBtn}>CSV</button>
          <button onClick={onClose} title="Close" style={drillX}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 16px 14px' }}>
          {list.length === 0 && (
            <div style={{ color: X.slate, fontSize: 13.5, padding: '18px 4px' }}>No orders behind this number in the current range.</div>
          )}
          {list.map((o) => (
            <div key={o.orderId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${X.line}`, fontSize: 13 }}>
              <span style={{ width: 92, color: X.slate, fontSize: 12, flexShrink: 0 }}>{o.orderNumber}</span>
              <span style={{ width: 76, color: X.slate, fontSize: 12, flexShrink: 0 }}>{dateUS(o.date)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customerName || '—'}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: X.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.vehicle || 'Vehicle not entered'}{mode === 'dealership' ? (o.sellerName !== '—' ? ` · ${o.sellerName}` : '') : ` · ${o.dealershipName}`}
                </span>
              </span>
              <StatusMini status={o.status} />
              <span style={{ width: 88, textAlign: 'right', fontWeight: 700, flexShrink: 0 }}>{fmtMetric(o)}</span>
              {onOpenOrder && (
                <button onClick={() => { onClose(); onOpenOrder(o.orderId) }} style={viewBtn} title="Open this order">View →</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatusMini({ status }) {
  const t = STATUS_TONE[status] || STATUS_TONE.submitted
  return (
    <span style={{ fontFamily: FONT.body, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.fg, background: t.bg, borderRadius: 999, padding: '3px 9px', fontWeight: 700, flexShrink: 0, width: 78, textAlign: 'center' }}>
      {(status || '').replace('_', ' ')}
    </span>
  )
}

const drillCsvBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', fontFamily: FONT.body, flexShrink: 0 }
const drillX = { background: 'transparent', color: 'rgba(255,255,253,0.7)', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }
const viewBtn = { background: '#FFFFFD', color: X.black, border: `1px solid ${X.gray}`, borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: FONT.body, flexShrink: 0, whiteSpace: 'nowrap' }

const Kpi = ({ label, value, format, sub, onClick }) => {
  const shown = useCountUp(value)
  const display = typeof value === 'number'
    ? (format ? format(shown) : Math.round(shown).toLocaleString())
    : value
  return (
    <div onClick={onClick} className={onClick ? 'x-lift' : undefined}
      title={onClick ? 'See the orders behind this number' : undefined}
      style={{ position: 'relative', overflow: 'hidden', background: X.black, borderRadius: 16, padding: 18, fontFamily: FONT.body, boxShadow: '0 10px 28px rgba(20,18,19,0.18)', cursor: onClick ? 'pointer' : 'default' }}>
      <Sheen />
      <div style={{ color: X.white, fontSize: 24, fontWeight: 800 }}>{display}</div>
      <div style={{ color: X.yellow, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: FONT.subWeight, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ color: '#8C8983', fontSize: 11, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

const Panel = ({ title, children }) => (
  <div style={{ ...CARD, padding: 22, marginTop: 16 }}>
    <Eyebrow>{title}</Eyebrow>
    {children}
  </div>
)

// Cell style for the Top sellers table (dealership mode). This constant was
// referenced but never defined in update 15 — the cause of the dealership
// Performance white-screen crash.
const sellerTd = { padding: '8px 6px', borderTop: `1px solid ${X.line}`, fontSize: 13.5 }

const Th = ({ children, r }) => <th style={{ textAlign: r ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: X.slate, padding: '8px 6px', borderBottom: `1px solid ${X.gray}` }}>{children}</th>
const Td = ({ children, r, style }) => <td style={{ textAlign: r ? 'right' : 'left', fontSize: 14, padding: '8px 6px', borderBottom: `1px solid ${X.line}`, ...style }}>{children}</td>
const tbl = { width: '100%', borderCollapse: 'collapse' }
const tipStyle = { background: '#141213', border: 'none', borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.35)', padding: '10px 12px' }
const tipLabel = { color: 'rgba(255,255,253,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }
const sel = { border: `1px solid ${X.gray}`, background: '#FFFFFD', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, fontFamily: FONT.body, color: X.black }
const clearBtn = { border: 'none', background: 'transparent', color: X.slate, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: FONT.body }
