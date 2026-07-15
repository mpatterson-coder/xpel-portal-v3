import { supabase } from './supabaseClient'

// =============================================================================
// Performance analytics for all three roles — ONE data path, scoped by RLS.
//
// The same order_items query powers every dashboard: Row-Level Security
// automatically returns only the rows the logged-in user may see (dealership
// -> their store, installer -> their group, admin -> the whole network), so
// there is nothing role-specific to enforce here.
//
// Money semantics used throughout:
//   retail    = what the consumer pays the dealership (price snapshot taken
//               when the order was placed: order_items.unit_price)
//   wholesale = what the dealership pays the installer — snapshotted onto the
//               order line (order_items.unit_cost) at submission, so history
//               never drifts when prices change (legacy rows fall back to the
//               catalog cost they were backfilled with)
//   margin    = retail − wholesale  (the dealership's profit)
// =============================================================================

export async function fetchPerformanceRows() {
  const PAGE = 1000
  const all = []
  let from = 0
  // Supabase caps a single response at 1000 rows, so page until done
  // (pilot guardrail: stops at 10k line items).
  for (let page = 0; page < 10; page++) {
    const { data, error } = await supabase
      .from('order_items')
      .select(`quantity, unit_price, list_price, unit_cost,
        product:products(id, name, category, tier, cost),
        order:orders(id, created_at, completed_at, created_by, status, dealership_id, group_id,
          creator:profiles!orders_created_by_fkey(full_name, title),
          dealership:dealerships(name), group:dealership_groups(name))`)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  return all
    .filter((r) => r.order && r.product)
    .map((r) => ({
      date: r.order.created_at,
      status: r.order.status,
      orderId: r.order.id,
      groupId: r.order.group_id,
      groupName: r.order.group?.name ?? '—',
      dealershipId: r.order.dealership_id,
      dealershipName: r.order.dealership?.name ?? '—',
      productId: r.product.id,
      productName: r.product.name,
      category: r.product.category || 'Other',
      qty: r.quantity,
      retail: Number(r.unit_price) * r.quantity,
      listRetail: Number(r.list_price ?? r.unit_price) * r.quantity,
      wholesale: Number(r.unit_cost ?? r.product.cost ?? 0) * r.quantity,
      completedAt: r.order.completed_at,
      createdBy: r.order.created_by,
      sellerName: r.order.creator?.full_name ?? '—',
      sellerTitle: r.order.creator?.title ?? 'No title set',
    }))
}

// Cancelled orders never count toward performance numbers.
export function applyFilters(rows, f = {}) {
  const fromTs = f.from ? new Date(f.from + 'T00:00:00') : null
  const toTs = f.to ? new Date(f.to + 'T23:59:59') : null
  return rows.filter((r) => {
    if (r.status === 'cancelled') return false
    const d = new Date(r.date)
    if (fromTs && d < fromTs) return false
    if (toTs && d > toTs) return false
    if (f.category && r.category !== f.category) return false
    if (f.productId && r.productId !== f.productId) return false
    if (f.groupId && r.groupId !== f.groupId) return false
    return true
  })
}

export function computeTotals(rows) {
  let retail = 0, wholesale = 0, listRetail = 0, units = 0
  const orderIds = new Set()
  const completed = new Set()
  const completionDays = new Map() // orderId -> days from submitted to completed
  for (const r of rows) {
    retail += r.retail; wholesale += r.wholesale; listRetail += (r.listRetail ?? r.retail); units += r.qty
    orderIds.add(r.orderId)
    if (r.status === 'completed') completed.add(r.orderId)
    if (r.completedAt) {
      const d = (new Date(r.completedAt) - new Date(r.date)) / 86400000
      if (isFinite(d) && d >= 0) completionDays.set(r.orderId, d)
    }
  }
  const margin = retail - wholesale
  const cds = [...completionDays.values()]
  return {
    retail, wholesale, margin, units,
    discount: Math.max(0, listRetail - retail),
    marginPct: retail ? Math.round((margin / retail) * 100) : 0,
    orders: orderIds.size,
    completed: completed.size,
    avgOrder: orderIds.size ? retail / orderIds.size : 0,
    avgWholesaleOrder: orderIds.size ? wholesale / orderIds.size : 0,
    avgCompletionDays: cds.length ? cds.reduce((a, b) => a + b, 0) / cds.length : null,
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Revenue over time. Buckets by DAY when the data spans ≤ 62 days, otherwise
// by MONTH — with empty buckets filled in so the line doesn't lie.
export function timeSeries(rows) {
  if (!rows.length) return []
  let min = Infinity, max = -Infinity
  for (const r of rows) {
    const t = new Date(r.date).getTime()
    if (t < min) min = t
    if (t > max) max = t
  }
  const daily = (max - min) / 86400000 <= 62
  const key = (d) => daily
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`

  const buckets = []
  const map = new Map()
  const cur = new Date(min)
  if (daily) cur.setHours(0, 0, 0, 0)
  else { cur.setDate(1); cur.setHours(0, 0, 0, 0) }
  const end = new Date(max)
  while (cur <= end) {
    const k = key(cur)
    const b = { label: k, retail: 0, wholesale: 0, margin: 0 }
    buckets.push(b); map.set(k, b)
    if (daily) cur.setDate(cur.getDate() + 1)
    else cur.setMonth(cur.getMonth() + 1)
  }
  for (const r of rows) {
    const b = map.get(key(new Date(r.date)))
    if (!b) continue
    b.retail += r.retail
    b.wholesale += r.wholesale
    b.margin += r.retail - r.wholesale
  }
  return buckets.map((b) => ({
    ...b,
    retail: Math.round(b.retail),
    wholesale: Math.round(b.wholesale),
    margin: Math.round(b.margin),
  }))
}

// Aggregate by any dimension (productName, category, groupName, dealershipName).
export function breakdown(rows, keyField) {
  const map = new Map()
  for (const r of rows) {
    const k = r[keyField]
    const b = map.get(k) ?? { key: k, name: k, retail: 0, wholesale: 0, units: 0, orderIds: new Set() }
    b.retail += r.retail; b.wholesale += r.wholesale; b.units += r.qty
    b.orderIds.add(r.orderId)
    map.set(k, b)
  }
  return Array.from(map.values()).map((b) => ({
    key: b.key, name: b.name, retail: b.retail, wholesale: b.wholesale,
    units: b.units, orders: b.orderIds.size, margin: b.retail - b.wholesale,
  }))
}

// Options for the filter dropdowns, derived from the data the user can see.
export function filterOptions(rows) {
  const cats = new Map(), prods = new Map(), groups = new Map()
  for (const r of rows) {
    cats.set(r.category, true)
    prods.set(r.productId, { id: r.productId, name: r.productName, category: r.category })
    groups.set(r.groupId, { id: r.groupId, name: r.groupName })
  }
  return {
    categories: Array.from(cats.keys()).sort(),
    products: Array.from(prods.values()).sort((a, b) => a.name.localeCompare(b.name)),
    groups: Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name)),
  }
}
