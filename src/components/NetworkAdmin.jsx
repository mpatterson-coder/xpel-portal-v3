import { useEffect, useState } from 'react'
import { getGroups, getDealerships } from '../lib/db'
import { createGroup, renameGroup, createDealership, updateDealership, deleteDealership } from '../lib/adminDb'

import { COLOR as X, FONT, CARD } from '../lib/theme'

export default function NetworkAdmin() {
  const [groups, setGroups] = useState([])
  const [stores, setStores] = useState([])
  const [err, setErr] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [indie, setIndie] = useState(null) // {name, city, state} when adding an independent rooftop

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
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${X.line}` }}>
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...input, flex: 2 }} />
      <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} style={{ ...input, flex: 1 }} placeholder="City" />
      <input value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} style={{ ...input, width: 70 }} placeholder="ST" />
      {dirty && <button style={btnPrimary} onClick={save}>Save</button>}
      <button style={{ ...btnGhost, color: X.red, borderColor: X.red }} onClick={remove}>Delete</button>
    </div>
  )
}

const panel = { ...CARD, padding: 18 }
const input = { border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, fontFamily: FONT.body, background: '#FFFFFD' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body }
const btnGhostTop = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', fontFamily: FONT.body }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
