import { useEffect, useState } from 'react'
import { getGroups, getDealerships } from '../lib/db'
import { getAllProfiles, adminCreateUser, updateProfileAssignment } from '../lib/adminDb'

const X = { yellow: '#FDB521', black: '#000', teal: '#1A9392', slate: '#505A72', red: '#C94543', gray: '#D1D3D5' }
const ROLES = ['dealership', 'installer', 'admin']

export default function UsersAdmin() {
  const [profiles, setProfiles] = useState([])
  const [groups, setGroups] = useState([])
  const [stores, setStores] = useState([])
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // profile id being edited
  const [adding, setAdding] = useState(false)

  const load = () =>
    Promise.all([getAllProfiles(), getGroups(), getDealerships()])
      .then(([p, g, d]) => { setProfiles(p); setGroups(g); setStores(d) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Users</h3>
        <button style={btnPrimary} onClick={() => setAdding(true)}>+ Add User</button>
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      {adding && <AddUserCard groups={groups} stores={stores} onDone={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />}

      <div style={panel}>
        {profiles.map((p) => (
          <div key={p.id} style={{ borderBottom: `1px solid #EEF0F2`, padding: '10px 4px' }}>
            {editing === p.id ? (
              <EditRow profile={p} groups={groups} stores={stores}
                onDone={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.full_name || p.email}</div>
                  <div style={{ fontSize: 12, color: X.slate }}>{p.email}</div>
                </div>
                <RoleTag role={p.role} />
                <div style={{ width: 260, fontSize: 12, color: X.slate }}>
                  {p.role === 'admin' ? 'XPEL network-wide'
                    : p.group ? `${p.group.name}${p.dealership ? ' · ' + p.dealership.name : ' (group-wide)'}`
                    : <span style={{ color: X.red }}>Not assigned — no access</span>}
                </div>
                <button style={btnGhost} onClick={() => setEditing(p.id)}>Edit</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AddUserCard({ groups, stores, onDone, onCancel }) {
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'dealership', group_id: '', dealership_id: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit() {
    setBusy(true); setMsg('')
    try {
      const user = await adminCreateUser({ email: f.email.trim(), password: f.password, full_name: f.full_name.trim() })
      await updateProfileAssignment(user.id, {
        role: f.role,
        group_id: f.role === 'admin' ? null : f.group_id || null,
        dealership_id: f.role === 'dealership' ? f.dealership_id || null : null,
      })
      setMsg(`Created ${f.email}. Share the temporary password with them.`)
      setTimeout(onDone, 1200)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const storesInGroup = stores.filter((s) => s.group_id === f.group_id)
  const ready = f.email.trim() && f.password.length >= 6 &&
    (f.role === 'admin' || (f.group_id && (f.role !== 'dealership' || f.dealership_id)))

  return (
    <div style={{ ...panel, marginBottom: 12, background: '#FFFDF5', border: `1px solid ${X.yellow}` }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>New User</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <input placeholder="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} style={input} />
        <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={input} />
        <input placeholder="Temporary password (6+ chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} style={input} />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, group_id: '', dealership_id: '' })} style={input}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {f.role !== 'admin' && (
          <select value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value, dealership_id: '' })} style={input}>
            <option value="">Select group…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {f.role === 'dealership' && (
          <select value={f.dealership_id} onChange={(e) => setF({ ...f, dealership_id: e.target.value })} style={input} disabled={!f.group_id}>
            <option value="">Select rooftop…</option>
            {storesInGroup.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('Created') ? X.teal : X.red }}>{msg}</div>}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button style={{ ...btnPrimary, opacity: ready && !busy ? 1 : 0.5 }} disabled={!ready || busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create User'}
        </button>
        <button style={btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function EditRow({ profile, groups, stores, onDone, onCancel }) {
  const [f, setF] = useState({
    role: profile.role,
    group_id: profile.group_id || '',
    dealership_id: profile.dealership_id || '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const storesInGroup = stores.filter((s) => s.group_id === f.group_id)

  async function save(deactivate = false) {
    setBusy(true); setMsg('')
    try {
      await updateProfileAssignment(profile.id, deactivate
        ? { role: 'dealership', group_id: null, dealership_id: null }
        : {
            role: f.role,
            group_id: f.role === 'admin' ? null : f.group_id || null,
            dealership_id: f.role === 'dealership' ? f.dealership_id || null : null,
          })
      onDone()
    } catch (e) { setMsg(e.message); setBusy(false) }
  }

  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 8 }}><b>{profile.full_name || profile.email}</b> — {profile.email}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={f.role} onChange={(e) => setF({ role: e.target.value, group_id: '', dealership_id: '' })} style={input}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {f.role !== 'admin' && (
          <select value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value, dealership_id: '' })} style={input}>
            <option value="">Select group…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {f.role === 'dealership' && (
          <select value={f.dealership_id} onChange={(e) => setF({ ...f, dealership_id: e.target.value })} style={input} disabled={!f.group_id}>
            <option value="">Select rooftop…</option>
            {storesInGroup.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button style={btnPrimary} disabled={busy} onClick={() => save(false)}>Save</button>
        <button style={btnGhost} onClick={onCancel}>Cancel</button>
        <button style={{ ...btnGhost, color: X.red, borderColor: X.red }} disabled={busy} onClick={() => save(true)}>
          Deactivate (remove access)
        </button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: X.red }}>{msg}</div>}
    </div>
  )
}

function RoleTag({ role }) {
  const bg = role === 'admin' ? X.black : role === 'installer' ? X.teal : X.yellow
  const fg = role === 'installer' || role === 'admin' ? '#fff' : X.black
  return <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, background: bg, color: fg, borderRadius: 4, padding: '3px 8px', width: 92, textAlign: 'center' }}>{role}</span>
}

const panel = { background: '#fff', border: `1px solid ${X.gray}`, borderRadius: 10, padding: 16 }
const input = { border: `1px solid ${X.gray}`, borderRadius: 6, padding: '9px 10px', fontSize: 14, fontFamily: "'Jost', sans-serif", background: '#fff' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 6, padding: '9px 14px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: "'Jost', sans-serif" }
const btnGhost = { background: '#fff', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 6, padding: '9px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: "'Jost', sans-serif" }
