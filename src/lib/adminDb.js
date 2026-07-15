import { createClient } from '@supabase/supabase-js'
import { supabase, supabaseUrl, supabaseAnonKey } from './supabaseClient'

// =============================================================================
// Admin management data layer. Every write here is permitted ONLY for admins
// by the database's row-level security — a non-admin calling these gets a
// permission error from Postgres itself, not just a hidden button.
// =============================================================================

// ---- Users ------------------------------------------------------------------

// All profiles with their group/store names (admin sees everyone via RLS).
export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, group_id, dealership_id, authorized_dealer_id, created_at, group:dealership_groups(name), dealership:dealerships(name), dealer:authorized_dealers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Create a login account from inside the app WITHOUT logging the admin out.
// Uses a second, session-less connection: the new account is created, the
// signup trigger gives it a zero-access profile, and the admin then assigns
// role/group/store via updateProfileAssignment below.
// NOTE (for production): real user administration would live in a server-side
// function using the service-role key. This client-side signup flow is the
// pilot-grade approach and relies on new accounts having no access by default.
export async function adminCreateUser({ email, password, full_name }) {
  const temp = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await temp.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  })
  if (error) throw error
  if (!data.user) throw new Error('Account not created — check that email confirmation is disabled in Supabase Auth settings.')
  return data.user
}

// Assign or transfer a user: change role, group, and/or store.
// Passing nulls for group/dealership (with role 'dealership') deactivates
// them back to the zero-access holding screen.
export async function updateProfileAssignment(profileId, { role, group_id, dealership_id, authorized_dealer_id, full_name }) {
  const patch = {
    role,
    group_id: group_id ?? null,
    dealership_id: dealership_id ?? null,
    authorized_dealer_id: authorized_dealer_id ?? null,
  }
  if (full_name !== undefined) patch.full_name = full_name
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', profileId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ---- XPEL Authorized Dealers ---------------------------------------------------

export async function createAuthorizedDealer({ name, city, state }) {
  const { data, error } = await supabase
    .from('authorized_dealers')
    .insert({ name, city: city || null, state: state || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAuthorizedDealer(id, patch) {
  const { error } = await supabase.from('authorized_dealers').update(patch).eq('id', id)
  if (error) throw error
}

// Deleting a dealer un-services its rooftops and unlinks its installer users
// (database sets those links to null) — they lose access until reassigned.
export async function deleteAuthorizedDealer(id) {
  const { error } = await supabase.from('authorized_dealers').delete().eq('id', id)
  if (error) throw error
}

// Point a rooftop at the dealer that services it (or null to un-service it).
export async function setRooftopDealer(dealershipId, authorized_dealer_id) {
  const { error } = await supabase
    .from('dealerships')
    .update({ authorized_dealer_id })
    .eq('id', dealershipId)
  if (error) throw error
}

// ---- Network: groups & dealerships -------------------------------------------

export async function createGroup(name) {
  const { data, error } = await supabase.from('dealership_groups').insert({ name }).select().single()
  if (error) throw error
  return data
}

export async function renameGroup(id, name) {
  const { error } = await supabase.from('dealership_groups').update({ name }).eq('id', id)
  if (error) throw error
}

export async function createDealership({ group_id, name, city, state }) {
  const { data, error } = await supabase
    .from('dealerships')
    .insert({ group_id, name, city: city || null, state: state || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateDealership(id, { name, city, state }) {
  const { error } = await supabase.from('dealerships').update({ name, city, state }).eq('id', id)
  if (error) throw error
}

// Deleting a rooftop only succeeds if it has no orders (the database protects
// order history). We surface that as a friendly message.
export async function deleteDealership(id) {
  const { error } = await supabase.from('dealerships').delete().eq('id', id)
  if (error) {
    if (String(error.message).toLowerCase().includes('violates foreign key')) {
      throw new Error('This rooftop has orders on record, so it can’t be deleted. (Order history is protected.)')
    }
    throw error
  }
}

// ---- Protection Programs (linked package sets) -----------------------------------

export async function getAllPrograms() {
  const { data, error } = await supabase.from('programs').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function createProgram(name, authorized_dealer_id = null) {
  const { data, error } = await supabase
    .from('programs')
    .insert({ name, authorized_dealer_id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameProgram(id, name) {
  const { error } = await supabase.from('programs').update({ name }).eq('id', id)
  if (error) throw error
}

// Deleting a program leaves its rooftops with NO program (empty menus) until
// they're pointed at another one — the UI warns before allowing it.
export async function deleteProgram(id) {
  const { error } = await supabase.from('programs').delete().eq('id', id)
  if (error) throw error
}

// Copy a program (name + full package set) as a starting point for a variant.
export async function duplicateProgram(id, newName) {
  const { data: src, error: sErr } = await supabase
    .from('programs').select('authorized_dealer_id').eq('id', id).single()
  if (sErr) throw sErr
  const prog = await createProgram(newName, src?.authorized_dealer_id ?? null)
  const { data: items, error } = await supabase
    .from('program_products').select('product_id, wholesale').eq('program_id', id)
  if (error) throw error
  if (items?.length) {
    const { error: insErr } = await supabase
      .from('program_products')
      .insert(items.map((i) => ({ program_id: prog.id, product_id: i.product_id, wholesale: i.wholesale })))
    if (insErr) throw insErr
  }
  return prog
}

export async function getAllProgramProducts() {
  const { data, error } = await supabase
    .from('program_products').select('id, program_id, product_id, wholesale')
  if (error) throw error
  return data ?? []
}

export async function addProgramProduct(program_id, product_id) {
  const { error } = await supabase
    .from('program_products')
    .upsert({ program_id, product_id }, { onConflict: 'program_id,product_id' })
  if (error) throw error
}

export async function removeProgramProduct(program_id, product_id) {
  const { error } = await supabase
    .from('program_products')
    .delete().eq('program_id', program_id).eq('product_id', product_id)
  if (error) throw error
}

// The installer's wholesale for one package in one of their programs.
// Null clears it back to the catalog default cost.
export async function setProgramWholesale(program_id, product_id, wholesale) {
  const { error } = await supabase
    .from('program_products')
    .update({ wholesale })
    .eq('program_id', program_id)
    .eq('product_id', product_id)
  if (error) throw error
}

export async function setDealershipProgram(dealership_id, program_id) {
  const { error } = await supabase
    .from('dealerships').update({ program_id }).eq('id', dealership_id)
  if (error) throw error
}

// ---- Per-rooftop pricing ----------------------------------------------------------

export async function getAllDealershipPricing() {
  const { data, error } = await supabase
    .from('dealership_pricing').select('id, dealership_id, product_id, unit_price')
  if (error) throw error
  return data ?? []
}

export async function setDealershipPrice(dealership_id, product_id, unit_price) {
  const { error } = await supabase
    .from('dealership_pricing')
    .upsert({ dealership_id, product_id, unit_price }, { onConflict: 'dealership_id,product_id' })
  if (error) throw error
}

export async function clearDealershipPrice(dealership_id, product_id) {
  const { error } = await supabase
    .from('dealership_pricing')
    .delete().eq('dealership_id', dealership_id).eq('product_id', product_id)
  if (error) throw error
}

// ---- Catalog & pricing --------------------------------------------------------

export async function getAllProducts() {
  const { data, error } = await supabase.from('products').select('*').order('category').order('name')
  if (error) throw error
  return data ?? []
}

export async function createProduct({ sku, name, category, tier, description, unit_price, cost }) {
  const { data, error } = await supabase
    .from('products')
    .insert({ sku, name, category, tier: tier || null, description: description || null, unit_price, cost })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProduct(id, patch) {
  const { error } = await supabase.from('products').update(patch).eq('id', id)
  if (error) throw error
}


