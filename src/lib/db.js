import { supabase } from './supabaseClient'
import { compressImage } from './img'

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

// The catalog a DEALERSHIP user can order from: the packages in their
// rooftop's PROGRAM, priced with this store's overrides on top of the base
// list price. RLS scopes both queries to the logged-in store automatically.
// Packages the store ordered historically but that left its program stay
// visible in reports — they just never reappear here as orderable.
export async function getCatalog() {
  const [
    { data: inProgram, error: aErr },
    { data: prices, error: prErr },
    { data: aliasRows, error: nErr },
  ] = await Promise.all([
    supabase.from('program_products').select('wholesale, product:products(*)'),
    supabase.from('dealership_pricing').select('product_id, unit_price, hidden'),
    supabase.from('dealership_package_names').select('product_id, display_name'),
  ])
  if (aErr) throw aErr
  if (prErr) throw prErr
  if (nErr) throw nErr

  const priceByProduct = new Map((prices ?? []).filter((o) => o.unit_price != null).map((o) => [o.product_id, o.unit_price]))
  const hiddenSet = new Set((prices ?? []).filter((o) => o.hidden).map((o) => o.product_id))
  const aliasByProduct = new Map((aliasRows ?? []).map((o) => [o.product_id, o.display_name]))
  return (inProgram ?? [])
    .map((r) => ({ row: r, p: r.product }))
    .filter(({ p }) => p && p.active)
    .map(({ row, p }) => ({
      ...p,
      canonical_name: p.name,
      // The store's own display name for the package, when they've set one.
      alias: aliasByProduct.get(p.id) ?? null,
      name: aliasByProduct.get(p.id) ?? p.name,
      base_price: p.unit_price,
      price_overridden: priceByProduct.has(p.id),
      effective_price: priceByProduct.has(p.id) ? priceByProduct.get(p.id) : p.unit_price,
      // Unpriced packages (installer-created, no retail anywhere yet) stay
      // hidden from the order screen until a store admin or XPEL prices them.
      priced: (priceByProduct.has(p.id) ? priceByProduct.get(p.id) : p.unit_price) != null,
      // The installer's wholesale for this store's program (catalog default when unset).
      effective_wholesale: row.wholesale ?? p.cost,
      // The store chose to hide this package from its order screen.
      hidden: hiddenSet.has(p.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
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

// ---- Store self-service (dealership managers) --------------------------------
// RLS + database triggers enforce every rule here: only managers of the store
// can write, retail can never go below wholesale, and claimed users must land
// in the manager's own store.

// Everyone at one rooftop, for the Team tab and staff performance.
export async function getStoreTeam(dealership_id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, title, role, is_store_admin, dealership_id, created_at')
    .eq('dealership_id', dealership_id)
    .eq('role', 'dealership')
    .order('full_name')
  if (error) throw error
  return data ?? []
}

export async function setUserTitle(userId, title) {
  // .select() makes a security-filtered no-op detectable instead of silent.
  const { data, error } = await supabase.from('profiles').update({ title }).eq('id', userId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Not permitted — only store admins can update teammates at their own store.')
}

// Grant or revoke the store-admin flag for a teammate at your own store.
export async function setStoreAdmin(userId, is_store_admin) {
  const { data, error } = await supabase.from('profiles').update({ is_store_admin }).eq('id', userId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Not permitted — only store admins can change this, and only at their own store.')
}

// A store admin pulls a freshly created (unassigned) account into their own
// store — via a database function that verifies everything and FAILS LOUDLY
// with the reason if it can't, so a user can never end up half-created.
export async function claimStoreUser(userId, { full_name, title, is_store_admin }) {
  const { data, error } = await supabase.rpc('claim_user_for_store', {
    p_user_id: userId,
    p_full_name: full_name ?? null,
    p_title: title ?? null,
    p_is_store_admin: !!is_store_admin,
  })
  if (error) throw error
  return data
}

// The store's display name for one package. Blank clears back to the official name.
export async function setPackageAlias(dealership_id, product_id, display_name) {
  if (display_name && display_name.trim()) {
    const { error } = await supabase
      .from('dealership_package_names')
      .upsert({ dealership_id, product_id, display_name: display_name.trim() }, { onConflict: 'dealership_id,product_id' })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('dealership_package_names')
      .delete().eq('dealership_id', dealership_id).eq('product_id', product_id)
    if (error) throw error
  }
}

// ---- Chat (store <-> servicing installer) -----------------------------------
// RLS keeps every conversation private to the store's users and the servicing
// shop's users — there is deliberately NO XPEL-admin read access.

// One channel's messages: the store's general channel (order_id null) or a
// specific order's thread. Oldest first, capped for sanity.
export async function getMessages(dealership_id, order_id = null) {
  let q = supabase
    .from('messages')
    .select('*')
    .eq('dealership_id', dealership_id)
    .order('created_at', { ascending: true })
    .limit(200)
  q = order_id ? q.eq('order_id', order_id) : q.is('order_id', null)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function sendMessage(profile, { dealership_id, authorized_dealer_id, order_id = null, body, attachments = [] }) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      dealership_id,
      authorized_dealer_id,
      order_id,
      sender_id: profile.id,
      sender_role: profile.role,
      sender_name: profile.full_name,
      body: (body ?? '').trim(),
      attachments,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Opening (or polling) a channel stamps it read for this user.
export async function markChannelRead(user_id, dealership_id, order_id = null) {
  const { error } = await supabase.from('chat_reads').upsert(
    { user_id, dealership_id, order_id, last_read_at: new Date().toISOString() },
    { onConflict: 'user_id,dealership_id,order_id' },
  )
  if (error) throw error
}

// Unread counts per channel (last 30 days), computed from my read stamps.
// Key format: `${dealership_id}|${order_id ?? 'general'}`.
export async function getUnreadState(myUserId) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const [{ data: reads, error: rErr }, { data: msgs, error: mErr }] = await Promise.all([
    supabase.from('chat_reads').select('dealership_id, order_id, last_read_at'),
    supabase
      .from('messages')
      .select('dealership_id, order_id, created_at, sender_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
  ])
  if (rErr) throw rErr
  if (mErr) throw mErr
  const readAt = new Map((reads ?? []).map((r) => [`${r.dealership_id}|${r.order_id ?? 'general'}`, new Date(r.last_read_at)]))
  const counts = new Map()
  let total = 0
  for (const m of msgs ?? []) {
    if (m.sender_id === myUserId) continue
    const key = `${m.dealership_id}|${m.order_id ?? 'general'}`
    const seen = readAt.get(key)
    if (!seen || new Date(m.created_at) > seen) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
      total++
    }
  }
  return { counts, total }
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

  // The store's display names for packages, so the shop can see how the
  // dealership lists what it's installing.
  const { data: aliasRows } = await supabase
    .from('dealership_package_names')
    .select('product_id, display_name')
    .eq('dealership_id', order.dealership_id)
  const aliases = Object.fromEntries((aliasRows ?? []).map((a) => [a.product_id, a.display_name]))

  return { order, items: items ?? [], history: history ?? [], aliases }
}

// Place a new order. `profile` is the current user's profile (from useAuth),
// which supplies the group_id / dealership_id the RLS insert policy checks.
// `lines` is an array of { product_id, quantity, unit_price }.
export async function createOrder(profile, {
  lines, customer_name, customer_first_name, customer_last_name,
  customer_phone, customer_email, pickup_date,
  vin, vehicle_year, vehicle_make, vehicle_model, vehicle_trim, vehicle_size,
  dap_work_order, notes,
  // Admin placing an order ON BEHALF of a store passes the store here.
  onBehalf = null,
}) {
  const group_id = onBehalf?.group_id ?? profile?.group_id
  const dealership_id = onBehalf?.dealership_id ?? profile?.dealership_id
  if (!group_id || !dealership_id) {
    throw new Error('Your account is not yet assigned to a dealership. Ask an admin to finish setup.')
  }
  const total = (lines ?? []).reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0)

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      group_id,
      dealership_id,
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
      unit_price: l.unit_price,                       // charged retail (after any discount)
      list_price: l.list_price ?? l.unit_price,       // pre-discount retail, frozen
      unit_cost: l.unit_cost ?? null,                 // wholesale, frozen (trigger fills if absent)
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


// ---- Notifications (order + network events; chat unread is separate) --------

export async function getNotificationState(limit = 25) {
  const [{ data: items, error: e1 }, { count, error: e2 }] = await Promise.all([
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])
  if (e1) throw e1
  if (e2) throw e2
  return { items: items ?? [], unread: count ?? 0 }
}

export async function markNotificationsRead(ids) {
  if (!ids?.length) return
  const { error } = await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() }).in('id', ids)
  if (error) throw error
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (error) throw error
}

// ---- NEW-order tracking (installer queue badges) ----------------------------

export async function getOrderReads() {
  const { data, error } = await supabase.from('order_reads').select('order_id')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.order_id))
}

export async function markOrderRead(profileId, orderId) {
  const { error } = await supabase.from('order_reads')
    .upsert({ user_id: profileId, order_id: orderId }, { onConflict: 'user_id,order_id' })
  if (error) throw error
}

// ---- Store-scoped catalog (admin editing / ordering on a store's behalf) ----

export async function getCatalogFor(dealershipId) {
  const { data: store, error: dErr } = await supabase
    .from('dealerships').select('id, program_id').eq('id', dealershipId).single()
  if (dErr) throw dErr
  if (!store?.program_id) return []
  const [
    { data: inProgram, error: aErr },
    { data: prices, error: prErr },
    { data: aliasRows, error: nErr },
  ] = await Promise.all([
    supabase.from('program_products').select('wholesale, product:products(*)').eq('program_id', store.program_id),
    supabase.from('dealership_pricing').select('product_id, unit_price, hidden').eq('dealership_id', dealershipId),
    supabase.from('dealership_package_names').select('product_id, display_name').eq('dealership_id', dealershipId),
  ])
  if (aErr) throw aErr
  if (prErr) throw prErr
  if (nErr) throw nErr
  const priceByProduct = new Map((prices ?? []).filter((o) => o.unit_price != null).map((o) => [o.product_id, o.unit_price]))
  const hiddenSet = new Set((prices ?? []).filter((o) => o.hidden).map((o) => o.product_id))
  const aliasByProduct = new Map((aliasRows ?? []).map((o) => [o.product_id, o.display_name]))
  return (inProgram ?? [])
    .map((r) => ({ row: r, p: r.product }))
    .filter(({ p }) => p && p.active)
    .map(({ row, p }) => ({
      ...p,
      canonical_name: p.name,
      alias: aliasByProduct.get(p.id) ?? null,
      name: aliasByProduct.get(p.id) ?? p.name,
      base_price: p.unit_price,
      price_overridden: priceByProduct.has(p.id),
      effective_price: priceByProduct.has(p.id) ? priceByProduct.get(p.id) : p.unit_price,
      priced: (priceByProduct.has(p.id) ? priceByProduct.get(p.id) : p.unit_price) != null,
      effective_wholesale: row.wholesale ?? p.cost,
      hidden: hiddenSet.has(p.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function setPackageHidden(dealership_id, product_id, hidden) {
  const { error } = await supabase.from('dealership_pricing')
    .upsert({ dealership_id, product_id, hidden }, { onConflict: 'dealership_id,product_id' })
  if (error) throw error
}

// ---- Package lifecycle (archive / restore / permanent delete) ---------------

export async function setProductActive(id, active) {
  const { data, error } = await supabase.from('products')
    .update({ active }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('No permission to change this package.')
}

export async function getOrderedProductIds() {
  const { data, error } = await supabase.from('order_items').select('product_id')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.product_id))
}

export async function deleteProductPermanently(id) {
  const { data, error } = await supabase.from('products')
    .delete().eq('id', id).select('id')
  if (error) {
    if (String(error.message || '').includes('foreign key') || error.code === '23503') {
      throw new Error('This package has been ordered before, so it can only be archived — order history depends on it.')
    }
    throw error
  }
  if (!data?.length) throw new Error('No permission to delete this package.')
}


// Admin command center: program -> product links for the whole network.
export async function getProgramLinks() {
  const { data, error } = await supabase.from('program_products').select('program_id, product_id')
  if (error) throw error
  return data ?? []
}


// =============================================================================
// UPDATE 21 — photos, attachments, and the installer's network tools
// =============================================================================

// ---- Storage ('attachments' private bucket) ---------------------------------

export async function uploadAttachment(path, fileOrBlob) {
  const { error } = await supabase.storage.from('attachments')
    .upload(path, fileOrBlob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}

// Batch-resolve private storage paths into short-lived viewable URLs.
export async function signedPhotoUrls(paths) {
  const unique = [...new Set((paths ?? []).filter(Boolean))]
  if (!unique.length) return new Map()
  const { data, error } = await supabase.storage.from('attachments').createSignedUrls(unique, 3600)
  if (error) throw error
  const out = new Map()
  ;(data ?? []).forEach((d, i) => { if (d?.signedUrl) out.set(d.path ?? unique[i], d.signedUrl) })
  return out
}

// ---- Order photos -----------------------------------------------------------

export async function getOrderPhotos(orderId) {
  const { data, error } = await supabase.from('order_photos')
    .select('*').eq('order_id', orderId).order('created_at')
  if (error) throw error
  const rows = data ?? []
  const urls = await signedPhotoUrls(rows.map((r) => r.path))
  return rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null }))
}

// Compress + upload each photo, then record it on the order. onProgress gets
// (current, total) so the UI can narrate long uploads.
export async function addOrderPhotos(orderId, profileId, files, onProgress) {
  const added = []
  let i = 0
  for (const f of files) {
    i += 1
    onProgress?.(i, files.length)
    const blob = await compressImage(f)
    const path = `orders/${orderId}/${crypto.randomUUID()}.jpg`
    await uploadAttachment(path, blob)
    const { data, error } = await supabase.from('order_photos')
      .insert({ order_id: orderId, path, uploaded_by: profileId }).select().single()
    if (error) throw error
    added.push(data)
  }
  return added
}

export async function deleteOrderPhoto(photo) {
  const { data, error } = await supabase.from('order_photos')
    .delete().eq('id', photo.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Only the person who added a photo (or an admin) can remove it.')
  try { await supabase.storage.from('attachments').remove([photo.path]) } catch { /* row is gone; orphan file is harmless */ }
}

// ---- Chat photo attachments -------------------------------------------------

export async function uploadMessagePhotos(dealershipId, files) {
  const paths = []
  for (const f of files) {
    const blob = await compressImage(f)
    const path = `messages/${dealershipId}/${crypto.randomUUID()}.jpg`
    await uploadAttachment(path, blob)
    paths.push(path)
  }
  return paths
}

// ---- Installer network (add stores, own each store's package menu) ----------

export async function installerCreateGroup(name) {
  const { data, error } = await supabase.from('dealership_groups')
    .insert({ name: name.trim() }).select().single()
  if (error) throw error
  return data
}

// Give a store its own (empty) package menu if it somehow lacks one.
export async function ensureStoreMenu(store, dealerId) {
  if (store.program_id) return { id: store.program_id }
  const { data: prog, error: pErr } = await supabase.from('programs')
    .insert({ name: `${store.name} — Package Menu`, authorized_dealer_id: dealerId })
    .select().single()
  if (pErr) throw pErr
  const { error: uErr } = await supabase.from('dealerships')
    .update({ program_id: prog.id }).eq('id', store.id)
  if (uErr) throw uErr
  return prog
}

// Create the rooftop AND its empty package menu in one motion.
export async function installerCreateStore(dealerId, { name, street, city, state, zip, group_id }) {
  const { data: store, error: sErr } = await supabase.from('dealerships')
    .insert({
      name: name.trim(), street: street.trim(), city: city.trim(),
      state: state.trim(), zip: zip.trim(), group_id,
      authorized_dealer_id: dealerId,
    })
    .select().single()
  if (sErr) throw sErr
  const menu = await ensureStoreMenu(store, dealerId)
  return { ...store, program_id: menu.id }
}

// One store's full menu: each package, MY wholesale, and the store's retail
// (visible to the shop read-only — every store prices its own retail).
export async function getStoreMenu(store) {
  if (!store.program_id) return []
  const [{ data: items, error: iErr }, { data: prices, error: prErr }] = await Promise.all([
    supabase.from('program_products')
      .select('id, product_id, wholesale, product:products(*)')
      .eq('program_id', store.program_id),
    supabase.from('dealership_pricing')
      .select('product_id, unit_price')
      .eq('dealership_id', store.id),
  ])
  if (iErr) throw iErr
  if (prErr) throw prErr
  const retail = new Map((prices ?? []).map((p) => [p.product_id, p.unit_price]))
  return (items ?? [])
    .filter((r) => r.product)
    .map((r) => ({
      link_id: r.id,
      product: r.product,
      wholesale: r.wholesale ?? r.product.cost,
      retail: retail.has(r.product_id) ? retail.get(r.product_id) : null,
    }))
    .sort((a, b) => a.product.name.localeCompare(b.product.name))
}

export async function addMenuPackage(program_id, product_id, wholesale) {
  const { error } = await supabase.from('program_products')
    .insert({ program_id, product_id, wholesale })
  if (error) throw error
}

export async function removeMenuPackage(link_id) {
  const { error } = await supabase.from('program_products').delete().eq('id', link_id)
  if (error) throw error
}

export async function setMenuWholesale(link_id, wholesale) {
  const { error } = await supabase.from('program_products')
    .update({ wholesale }).eq('id', link_id)
  if (error) throw error
}
