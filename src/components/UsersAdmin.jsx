import { useEffect, useState } from 'react'
import { getGroups, getDealerships, getAuthorizedDealers } from '../lib/db'
import { getAllProfiles, adminCreateUser, updateProfileAssignment } from '../lib/adminDb'
import { COLOR as X, FONT, CARD } from '../lib/theme'
import { TITLES } from '../lib/titles'

const ROLES = ['dealership', 'installer', 'admin']

// Users and their assignments. The rule set:
//   dealership user -> belongs to a GROUP + ROOFTOP (sees that rooftop's orders)
//   installer user  -> belongs to an XPEL AUTHORIZED DEALER (sees the orders of
//                      every rooftop that dealer services)
//   admin           -> XPEL network-wide
export default function UsersAdmin() {
  const [profiles, setProfiles] = useState([])
  const [groups, setGroups] = useState([])
  const [stores, setStores] = useState([])
  const [dealers, setDealers] = useState([])
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // profile id being edited
  const [adding, setAdding] = useState(false)

  const load = () =>
    Promise.all([getAllProfiles(), getGroups(), getDealerships(), getAuthorizedDealers()])
      .then(([p, g, d, ad]) => { setProfiles(p); setGroups(g); setStores(d); setDealers(ad) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: FONT.headingWeight }}>Users</h3>
        <button style={btnPrimary} onClick={() => setAdding(true)}>+ Add User</button>
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      {adding && <AddUserCard groups={groups} stores={stores} dealers={dealers} onDone={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />}

      <div style={panel}>
        {profiles.map((p) => (
          <div key={p.id} style={{ borderBottom: `1px solid ${X.line}`, padding: '10px 4px' }}>
            {editing === p.id ? (
              <EditRow profile={p} groups={groups} stores={stores} dealers={dealers}
                onDone={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.full_name || p.email}</div>
                  <div style={{ fontSize: 12, color: X.slate }}>{p.email}</div>
                </div>
                <RoleTag role={p.role} />
                <div style={{ width: 280, fontSize: 12, color: X.slate }}>
                  {p.role === 'admin'
                    ? 'XPEL network-wide'
                    : p.role === 'installer'
                      ? (p.dealer
                          ? <>{p.dealer.name} <span style={{ color: '#A9A59C' }}>· Authorized Installer</span></>
                          : <span style={{ color: X.red }}>No authorized installer — no access</span>)
                      : p.group
                        ? `${p.group.name}${p.dealership ? ' · ' + p.dealership.name : ' (group-wide)'}${p.title ? ' · ' + p.title : ''}${p.is_store_admin ? ' · Store admin' : ''}`
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

function AddUserCard({ groups, stores, dealers, onDone, onCancel }) {
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'dealership', group_id: '', dealership_id: '', authorized_dealer_id: '', title: '', is_store_admin: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit() {
    setBusy(true); setMsg('')
    try {
      const user = await adminCreateUser({ email: f.email.trim(), password: f.password, full_name: f.full_name.trim() })
      await updateProfileAssignment(user.id, {
        role: f.role,
        group_id: f.role === 'dealership' ? f.group_id || null : null,
        dealership_id: f.role === 'dealership' ? f.dealership_id || null : null,
        authorized_dealer_id: f.role === 'installer' ? f.authorized_dealer_id || null : null,
        title: f.role === 'dealership' ? f.title || null : null,
        is_store_admin: f.role === 'dealership' ? f.is_store_admin : false,
      })
      setMsg(`Created ${f.email}. Share the temporary password with them.`)
      setTimeout(onDone, 1200)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const storesInGroup = stores.filter((s) => s.group_id === f.group_id)
  const groupHasNoRooftops = f.role === 'dealership' && f.group_id && storesInGroup.length === 0
  const noDealersYet = f.role === 'installer' && dealers.length === 0

  // Everything the Create button is waiting on, spelled out for the admin —
  // a silently disabled button is a dead end.
  const missing = []
  if (!f.email.trim()) missing.push('an email address')
  if (f.password.length < 6) missing.push('a password of at least 6 characters')
  if (f.role === 'dealership' && !f.group_id) missing.push('a group')
  if (f.role === 'dealership' && f.group_id && !f.dealership_id) missing.push('a rooftop')
  if (f.role === 'installer' && !f.authorized_dealer_id) missing.push('an authorized dealer')
  const ready = missing.length === 0

  return (
    <div className="x-fade" style={{ ...panel, marginBottom: 12, background: '#FFFDF5', border: '1px solid rgba(253,181,33,0.6)' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>New User</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <input placeholder="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} style={input} />
        <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={input} />
        <input placeholder="Temporary password (6+ chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} style={input} />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, group_id: '', dealership_id: '', authorized_dealer_id: '', title: '', is_store_admin: false })} style={input}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {f.role === 'dealership' && (
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
        {f.role === 'installer' && (
          <select value={f.authorized_dealer_id} onChange={(e) => setF({ ...f, authorized_dealer_id: e.target.value })} style={input}>
            <option value="">Select authorized installer…</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {f.role === 'dealership' && (
          <select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={input} title="Reporting label — permissions come from the Store admin checkbox">
            <option value="">Title (optional)…</option>
            {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {f.role === 'dealership' && (
          <label style={checkWrap} title="Store admins can edit their store's pricing, apply discounts, and manage its team — this is how you hand a new dealership its keys">
            <input type="checkbox" checked={f.is_store_admin} onChange={(e) => setF({ ...f, is_store_admin: e.target.checked })} />
            Store admin
          </label>
        )}
      </div>
      {groupHasNoRooftops && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: X.red }}>
          This group has no rooftops yet, so a dealership user can't be placed in it.
          Add the rooftop under Network first, or pick a different group.
        </div>
      )}
      {noDealersYet && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: X.red }}>
          No authorized installers exist yet — create one under the Authorized Installers tab first.
        </div>
      )}
      {!ready && !groupHasNoRooftops && !noDealersYet && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: X.slate }}>
          Still needed: {missing.join(', ')}.
        </div>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('Created') ? X.green : X.red }}>{msg}</div>}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button style={{ ...btnPrimary, opacity: ready && !busy ? 1 : 0.5 }} disabled={!ready || busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create User'}
        </button>
        <button style={btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function EditRow({ profile, groups, stores, dealers, onDone, onCancel }) {
  const [f, setF] = useState({
    role: profile.role,
    group_id: profile.group_id || '',
    dealership_id: profile.dealership_id || '',
    authorized_dealer_id: profile.authorized_dealer_id || '',
    title: profile.title || '',
    is_store_admin: !!profile.is_store_admin,
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const storesInGroup = stores.filter((s) => s.group_id === f.group_id)

  async function save(deactivate = false) {
    setBusy(true); setMsg('')
    try {
      await updateProfileAssignment(profile.id, deactivate
        ? { role: 'dealership', group_id: null, dealership_id: null, authorized_dealer_id: null }
        : {
            role: f.role,
            group_id: f.role === 'dealership' ? f.group_id || null : null,
            dealership_id: f.role === 'dealership' ? f.dealership_id || null : null,
            authorized_dealer_id: f.role === 'installer' ? f.authorized_dealer_id || null : null,
            title: f.role === 'dealership' ? f.title || null : null,
            is_store_admin: f.role === 'dealership' ? f.is_store_admin : false,
          })
      onDone()
    } catch (e) { setMsg(e.message); setBusy(false) }
  }

  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 8 }}><b>{profile.full_name || profile.email}</b> — {profile.email}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={f.role} onChange={(e) => setF({ role: e.target.value, group_id: '', dealership_id: '', authorized_dealer_id: '', title: '', is_store_admin: false })} style={input}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {f.role === 'dealership' && (
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
        {f.role === 'installer' && (
          <select value={f.authorized_dealer_id} onChange={(e) => setF({ ...f, authorized_dealer_id: e.target.value })} style={input}>
            <option value="">Select authorized installer…</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {f.role === 'dealership' && (
          <select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={input} title="Reporting label — permissions come from the Store admin checkbox">
            <option value="">Title (optional)…</option>
            {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {f.role === 'dealership' && (
          <label style={checkWrap} title="Store admins can edit their store's pricing, apply discounts, and manage its team">
            <input type="checkbox" checked={f.is_store_admin} onChange={(e) => setF({ ...f, is_store_admin: e.target.checked })} />
            Store admin
          </label>
        )}
        <button style={btnPrimary} disabled={busy} onClick={() => save(false)}>Save</button>
        <button style={btnGhost} onClick={onCancel}>Cancel</button>
        <button style={{ ...btnGhost, color: X.red, borderColor: 'rgba(125,20,25,0.4)' }} disabled={busy} onClick={() => save(true)}>
          Deactivate (remove access)
        </button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: X.red }}>{msg}</div>}
    </div>
  )
}

function RoleTag({ role }) {
  const bg = role === 'admin' ? X.black : role === 'installer' ? X.strata : X.yellow
  const fg = role === 'installer' || role === 'admin' ? '#fff' : X.black
  return <span style={{ fontFamily: FONT.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, background: bg, color: fg, borderRadius: 999, padding: '4px 11px', width: 96, textAlign: 'center', fontWeight: 700 }}>{role}</span>
}

const panel = { ...CARD, padding: 18 }
const checkWrap = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 11px', background: '#FFFFFD', fontFamily: FONT.body }
const input = { border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 11px', fontSize: 14, fontFamily: FONT.body, background: '#FFFFFD' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
