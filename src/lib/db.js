import { supabase } from './supabaseClient'

// =============================================================================
// Data-access layer for the XPEL Dealership Portal pilot.
//
// This is the bridge between the UI and the validated Supabase schema. Every
// function here returns LIVE data and enforces nothing on its own — the
// database's Row-Level Security does the enforcing, so e.g. getOrders() simply
// returns "the orders this logged-in user is allowed to see" automatically.
//
// When wiring the prototype, each mock array/object gets replaced by the
// matching call below. Nothing here talks to any XPEL-owned system.
// =============================================================================

// ---- Catalog ----------------------------------------------------------------

// Returns the product catalog with each product's EFFECTIVE price for the
// current user's group: a private group override if one exists, otherwise the
// base list price. (group_pricing is RLS-protected, so a user only ever sees
// their own group's overrides.)
export async function getCatalog() {
  const [{ data: products, error: pErr }, { data: overrides, error: oErr }] =
    await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('group_pricing').select('product_id, unit_price'),
    ])
  if (pErr) throw pErr
  if (oErr) throw oErr

  const overrideByProduct = new Map((overrides ?? []).map((o) => [o.product_id, o.unit_price]))
  return (products ?? []).map((p) => ({
    ...p,
    effective_price: overrideByProduct.has(p.id) ? overrideByProduct.get(p.id) : p.unit_price,
  }))
}

// ---- Dealership network -----------------------------------------------------

export async function getGroups() {
  const { data, error } = await supabase.from('dealership_groups').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function getDealerships() {
  const { data, error } = await supabase.from('dealerships').select('*').order('name')
  if (error) throw error
  return data ?? []
}

// XPEL Authorized Dealers (RLS: admins see all; an installer sees their own;
// a dealership user sees the dealer that services their rooftop).
export async function getAuthorizedDealers() {
  const { data, error } = await supabase.from('authorized_dealers').select('*').order('name')
  if (error) throw error
  return data ?? []
}

// ---- Orders -----------------------------------------------------------------

// All orders the current user may see (RLS scopes this automatically:
// admin -> everything, installer -> their group, dealership -> their location).
export async function getOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, dealership:dealerships(name), creator:profiles!orders_created_by_fkey(full_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Full detail for one order: header, line items (with product names), and the
// status timeline.
export async function getOrderDetail(orderId) {
  const [{ data: order, error: oErr }, { data: items, error: iErr }, { data: history, error: hErr }] =
    await Promise.all([
      supabase.from('orders').select('*, dealership:dealerships(name)').eq('id', orderId).single(),
      supabase.from('order_items').select('*, product:products(name, sku, cost)').eq('order_id', orderId),
      supabase.from('order_status_history').select('*').eq('order_id', orderId).order('created_at'),
    ])
  if (oErr) throw oErr
  if (iErr) throw iErr
  if (hErr) throw hErr
  return { order, items: items ?? [], history: history ?? [] }
}

// Place a new order. `profile` is the current user's profile (from useAuth),
// which supplies the group_id / dealership_id the RLS insert policy checks.
// `lines` is an array of { product_id, quantity, unit_price }.
export async function createOrder(profile, {
  lines, customer_name, customer_first_name, customer_last_name,
  customer_phone, customer_email, pickup_date,
  vin, vehicle_year, vehicle_make, vehicle_model, vehicle_trim, vehicle_size,
  dap_work_order, notes,
}) {
  if (!profile?.group_id || !profile?.dealership_id) {
    throw new Error('Your account is not yet assigned to a dealership. Ask an admin to finish setup.')
  }
  const total = (lines ?? []).reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0)

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      group_id: profile.group_id,
      dealership_id: profile.dealership_id,
      created_by: profile.id,
      customer_name,
      customer_first_name,
      customer_last_name,
      customer_phone,
      customer_email,
      pickup_date,
      vin,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_trim,
      vehicle_size,
      dap_work_order,
      notes,
      total_amount: total,
    })
    .select()
    .single()
  if (oErr) throw oErr

  if (lines && lines.length) {
    const rows = lines.map((l) => ({
      order_id: order.id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
    }))
    const { error: iErr } = await supabase.from('order_items').insert(rows)
    if (iErr) throw iErr
  }
  return order
}

// Move an order through fulfillment (installer/admin). The status-history row is
// written automatically by a database trigger.
export async function updateOrderStatus(orderId, status) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ---- Notifications ----------------------------------------------------------

export async function getNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
  if (error) throw error
}

// ---- Admin: simple network rollups -----------------------------------------

// Admin-only convenience: order counts/totals grouped by dealership group.
// (Returns [] for non-admins because RLS hides other groups' orders.)
export async function getNetworkSummary() {
  const { data, error } = await supabase
    .from('orders')
    .select('group_id, total_amount, status, group:dealership_groups(name)')
  if (error) throw error
  const byGroup = new Map()
  for (const o of data ?? []) {
    const key = o.group_id
    const row = byGroup.get(key) ?? { group_id: key, name: o.group?.name ?? 'Unknown', orders: 0, revenue: 0 }
    row.orders += 1
    row.revenue += Number(o.total_amount || 0)
    byGroup.set(key, row)
  }
  return Array.from(byGroup.values())
}

// Admin-only: per-group sales performance WITH margin. Joins order line items to
// product cost and aggregates by dealership group. Returns [] for non-admins
// (RLS hides other groups' line items automatically).
export async function getNetworkPerformance() {
  const { data, error } = await supabase
    .from('order_items')
    .select('quantity, unit_price, product:products(cost), order:orders(group_id, group:dealership_groups(name))')
  if (error) throw error
  const byGroup = new Map()
  for (const it of data ?? []) {
    const gid = it.order?.group_id
    if (!gid) continue
    const row = byGroup.get(gid) ?? { group_id: gid, name: it.order?.group?.name ?? 'Unknown', revenue: 0, cost: 0, lines: 0 }
    row.revenue += Number(it.unit_price) * it.quantity
    row.cost += Number(it.product?.cost || 0) * it.quantity
    row.lines += 1
    byGroup.set(gid, row)
  }
  return Array.from(byGroup.values()).map((r) => ({
    ...r,
    margin: r.revenue - r.cost,
    marginPct: r.revenue ? Math.round(((r.revenue - r.cost) / r.revenue) * 100) : 0,
  }))
}

// Installer (or admin) attaches the DAP work order number to an order.
export async function setOrderWorkOrder(orderId, dap_work_order) {
  const { error } = await supabase.from('orders').update({ dap_work_order }).eq('id', orderId)
  if (error) throw error
}
