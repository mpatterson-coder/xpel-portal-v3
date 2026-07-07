import { useEffect, useState } from 'react'
import { getGroups, getDealerships } from '../lib/db'
import { createGroup, renameGroup, createDealership, updateDealership, deleteDealership } from '../lib/adminDb'

const X = { yellow: '#FDB521', black: '#000', teal: '#1A9392', slate: '#505A72', red: '#C94543', gray: '#D1D3D5' }

export default function NetworkAdmin() {
  const [groups, setGroups] = useState([])
  const [stores, setStores] = useState([])
  const [err, setErr] = useState('')
  const [newGroup, setNewGroup] = useState('')

  const load = () =>
    Promise.all([getGroups(), getDealerships()])
      .then(([g, d]) => { setGroups(g); setStores(d) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function addGroup() {
    if (!newGroup.trim()) return
    try { await createGroup(newGroup.trim()); setNewGroup(''); load() } catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Dealer Network</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="New dealer group name" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} style={input} />
          <button style={btnPrimary} onClick={addGroup}>+ Add Group</button>
        </div>
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} stores={stores.filter((s) => s.group_id === g.id)} onChanged={load} onError={setErr} />
      ))}
    </div>
  )
}

function GroupCard({ group, stores, onChanged, onError }) {
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
      {stores.map((s) => <StoreRow key={s.id} store={s} onChanged={onChanged} onError={onError} />)}
    </div>
  )
}

function StoreRow({ store, onChanged, onError }) {
  const [f, setF] = useState({ name: store.name, city: store.city || '', state: store.state || '' })
  const dirty = f.name !== store.name || f.city !== (store.city || '') || f.state !== (store.state || '')

  async function save() {
    try { await updateDealership(store.id, { name: f.name.trim(), city: f.city.trim() || null, state: f.state.trim() || null }); onChanged() }
    catch (e) { onError(e.message) }
  }
  async function remove() {
    if (!window.confirm(`Delete "${store.name}"? Only possible if it has no orders.`)) return
    try { await deleteDealership(store.id); onChanged() } catch (e) { onError(e.message) }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid #EEF0F2' }}>
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...input, flex: 2 }} />
      <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} style={{ ...input, flex: 1 }} placeholder="City" />
      <input value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} style={{ ...input, width: 70 }} placeholder="ST" />
      {dirty && <button style={btnPrimary} onClick={save}>Save</button>}
      <button style={{ ...btnGhost, color: X.red, borderColor: X.red }} onClick={remove}>Delete</button>
    </div>
  )
}

const panel = { background: '#fff', border: `1px solid ${X.gray}`, borderRadius: 10, padding: 16 }
const input = { border: `1px solid ${X.gray}`, borderRadius: 6, padding: '8px 10px', fontSize: 14, fontFamily: "'Jost', sans-serif", background: '#fff' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: "'Jost', sans-serif" }
const btnGhost = { background: '#fff', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 6, padding: '8px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: "'Jost', sans-serif" }
