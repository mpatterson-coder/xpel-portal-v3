import { useEffect, useState } from 'react'
import { getGroups, getDealerships, getAuthorizedDealers } from '../lib/db'
import { createGroup, renameGroup, createDealership, updateDealership, deleteDealership, getAllProducts, getAllDealershipProducts, assignPackage, unassignPackage } from '../lib/adminDb'

import { COLOR as X, FONT, CARD, money } from '../lib/theme'

export default function NetworkAdmin() {
  const [groups, setGroups] = useState([])
  const [stores, setStores] = useState([])
  const [dealers, setDealers] = useState([])
  const [products, setProducts] = useState([])
  const [assignments, setAssignments] = useState([])
  const [err, setErr] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [indie, setIndie] = useState(null) // {name, city, state} when adding an independent rooftop

  const load = () =>
    Promise.all([getGroups(), getDealerships(), getAuthorizedDealers(), getAllProducts(), getAllDealershipProducts()])
      .then(([g, d, ad, pr, asn]) => { setGroups(g); setStores(d); setDealers(ad); setProducts(pr); setAssignments(asn) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function addGroup() {
    if (!newGroup.trim()) return
    try { await createGroup(newGroup.trim()); setNewGroup(''); load() } catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: FONT.headingWeight }}>Dealer Network</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="New dealer group name" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} style={input} />
          <button style={btnPrimary} onClick={addGroup}>+ Add Group</button>
          <button style={btnGhostTop} onClick={() => setIndie(indie ? null : { name: '', city: '', state: '' })}>
            {indie ? 'Cancel' : '+ Add Independent Dealership'}
          </button>
        </div>
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      {indie && (
        <div style={{ ...panel, marginBottom: 12, background: '#FFFDF5', border: '1px solid rgba(253,181,33,0.6)', borderRadius: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Independent Dealership</div>
          <div style={{ fontSize: 12.5, color: X.slate, marginBottom: 10 }}>
            For rooftops not tied to a larger group. It gets its own private space with the same
            data walls as any group — nobody else can see its orders or pricing.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Dealership name" value={indie.name} onChange={(e) => setIndie({ ...indie, name: e.target.value })} style={{ ...input, flex: 2 }} />
            <input placeholder="City" value={indie.city} onChange={(e) => setIndie({ ...indie, city: e.target.value })} style={{ ...input, flex: 1 }} />
            <input placeholder="State" value={indie.state} onChange={(e) => setIndie({ ...indie, state: e.target.value })} style={{ ...input, width: 70 }} />
            <button style={{ ...btnPrimary, opacity: indie.name.trim() ? 1 : 0.5 }} disabled={!indie.name.trim()}
              onClick={async () => {
                try {
                  const g = await createGroup(indie.name.trim())
                  await createDealership({ group_id: g.id, name: indie.name.trim(), city: indie.city.trim(), state: indie.state.trim() })
                  setIndie(null); load()
                } catch (e) { setErr(e.message) }
              }}>Add</button>
          </div>
        </div>
      )}
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} stores={stores.filter((s) => s.group_id === g.id)} dealers={dealers} products={products} assignments={assignments} onChanged={load} onError={setErr} />
      ))}
    </div>
  )
}

function GroupCard({ group, stores, dealers, products, assignments, onChanged, onError }) {
  const [name, setName] = useState(group.name)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', city: '', state: '' })

  async function saveName() {
    if (name.trim() && name !== group.name) {
      try { await renameGroup(group.id, name.trim()); onChanged() } catch (e) { onError(e.message) }
    }
  }
  async function addStore() {
    try {
      await createDealership({ group_id: group.id, name: f.name.trim(), city: f.city.trim(), state: f.state.trim() })
      setF({ name: '', city: '', state: '' }); setAdding(false); onChanged()
    } catch (e) { onError(e.message) }
  }

  return (
    <div style={{ ...panel, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} style={{ ...input, fontWeight: 700, flex: 1 }} />
        <span style={{ fontSize: 12, color: X.slate }}>{stores.length} rooftop{stores.length === 1 ? '' : 's'}</span>
        <button style={btnGhost} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Add Rooftop'}</button>
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input placeholder="Rooftop name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...input, flex: 2 }} />
          <input placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} style={{ ...input, flex: 1 }} />
          <input placeholder="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} style={{ ...input, width: 70 }} />
          <button style={{ ...btnPrimary, opacity: f.name.trim() ? 1 : 0.5 }} disabled={!f.name.trim()} onClick={addStore}>Add</button>
        </div>
      )}
      {stores.map((s) => <StoreRow key={s.id} store={s} dealerName={dealers.find((d) => d.id === s.authorized_dealer_id)?.name} products={products} assignments={assignments} onChanged={onChanged} onError={onError} />)}
    </div>
  )
}

function StoreRow({ store, dealerName, products, assignments, onChanged, onError }) {
  const [f, setF] = useState({ name: store.name, city: store.city || '', state: store.state || '' })
  const [showPkgs, setShowPkgs] = useState(false)
  const dirty = f.name !== store.name || f.city !== (store.city || '') || f.state !== (store.state || '')
  const activeProducts = products.filter((p) => p.active)
  const assignedIds = new Set(assignments.filter((a) => a.dealership_id === store.id).map((a) => a.product_id))
  const assignedActiveCount = activeProducts.filter((p) => assignedIds.has(p.id)).length

  async function save() {
    try { await updateDealership(store.id, { name: f.name.trim(), city: f.city.trim() || null, state: f.state.trim() || null }); onChanged() }
    catch (e) { onError(e.message) }
  }
  async function remove() {
    if (!window.confirm(`Delete "${store.name}"? Only possible if it has no orders.`)) return
    try { await deleteDealership(store.id); onChanged() } catch (e) { onError(e.message) }
  }

  return (
    <div style={{ borderTop: `1px solid ${X.line}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', flexWrap: 'wrap' }}>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...input, flex: 2, minWidth: 160 }} />
        <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} style={{ ...input, flex: 1, minWidth: 100 }} placeholder="City" />
        <input value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} style={{ ...input, width: 70 }} placeholder="ST" />
        {dealerName
          ? <span style={svcChip} title="Serviced by this XPEL Authorized Dealer (assigned in the Authorized Dealers tab)">{dealerName}</span>
          : <span style={{ ...svcChip, color: X.red, borderColor: 'rgba(125,20,25,0.35)' }} title="No authorized dealer services this rooftop yet — assign one in the Authorized Dealers tab">No dealer</span>}
        <button
          style={{ ...btnGhost, ...(assignedActiveCount === 0 ? { color: X.red, borderColor: 'rgba(125,20,25,0.35)' } : {}) }}
          title="Which packages this store can order"
          onClick={() => setShowPkgs(!showPkgs)}>
          Packages {assignedActiveCount}/{activeProducts.length}
        </button>
        {dirty && <button style={btnPrimary} onClick={save}>Save</button>}
        <button style={{ ...btnGhost, color: X.red, borderColor: X.red }} onClick={remove}>Delete</button>
      </div>
      {showPkgs && (
        <PackagesPanel store={store} products={activeProducts} assignedIds={assignedIds} onChanged={onChanged} onError={onError} />
      )}
    </div>
  )
}

// The store's menu: exactly which active packages this rooftop can order.
// Checking assigns instantly; unchecking hides the package from the store's
// order form — past orders and performance reports are unaffected.
function PackagesPanel({ store, products, assignedIds, onChanged, onError }) {
  const [busy, setBusy] = useState(false)

  const byCategory = []
  for (const p of products) {
    const cat = p.category || 'Other'
    let bucket = byCategory.find(([c]) => c === cat)
    if (!bucket) { bucket = [cat, []]; byCategory.push(bucket) }
    bucket[1].push(p)
  }

  async function toggle(p) {
    setBusy(true)
    try {
      if (assignedIds.has(p.id)) await unassignPackage(store.id, p.id)
      else await assignPackage(store.id, p.id)
      await onChanged()
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  async function setAll(on) {
    setBusy(true)
    try {
      for (const p of products) {
        const has = assignedIds.has(p.id)
        if (on && !has) await assignPackage(store.id, p.id)
        if (!on && has) await unassignPackage(store.id, p.id)
      }
      await onChanged()
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="x-fade" style={{ margin: '2px 0 10px', padding: 16, background: X.bg, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, color: X.slate, fontWeight: 700 }}>
          Packages {store.name} can order
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
          <button disabled={busy} onClick={() => setAll(true)} style={linkBtn}>Assign all</button>
          <button disabled={busy} onClick={() => setAll(false)} style={linkBtn}>Clear all</button>
        </div>
      </div>
      {byCategory.map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: X.slate, margin: '6px 0 4px' }}>{cat}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 4 }}>
            {items.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '5px 6px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', background: assignedIds.has(p.id) ? '#FFF7E0' : 'transparent' }}>
                <input type="checkbox" checked={assignedIds.has(p.id)} disabled={busy} onChange={() => toggle(p)} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ color: X.slate, fontSize: 12 }}>{money(p.unit_price, 0)}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: X.slate, marginTop: 6 }}>
        Unchecking hides a package from this store's order form. Past orders and reports are unaffected.
      </div>
    </div>
  )
}

const panel = { ...CARD, padding: 18 }
const input = { border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, fontFamily: FONT.body, background: '#FFFFFD' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body }
const btnGhostTop = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', fontFamily: FONT.body }
const svcChip = { fontFamily: FONT.body, fontSize: 11, fontWeight: 700, color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }
const linkBtn = { border: 'none', background: 'transparent', color: X.strata, fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: FONT.body, padding: 0 }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
