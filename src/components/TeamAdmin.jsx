import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getStoreTeam, setUserTitle, claimStoreUser } from '../lib/db'
import { adminCreateUser } from '../lib/adminDb'
import { TITLES, isManagerTitle } from '../lib/titles'
import { COLOR as X, FONT, CARD } from '../lib/theme'

// =============================================================================
// Team — store managers run their own roster:
//   • Add users to their store (no XPEL admin needed) with a preset title.
//   • Change titles anytime. Titles power Performance → Top sellers and
//     By department, and titles containing "Manager" unlock pricing,
//     discounts, and this tab.
// The database enforces the same rules: a manager can only claim brand-new
// unassigned accounts into their OWN store, and only managers can do it.
// =============================================================================
export default function TeamAdmin() {
  const { profile, isManager } = useAuth()
  const [team, setTeam] = useState(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)

  const load = () => getStoreTeam(profile.dealership_id).then(setTeam).catch((e) => setErr(e.message))
  useEffect(() => { if (profile?.dealership_id) load() }, [profile?.dealership_id])

  if (!isManager) {
    return <div style={{ ...CARD, padding: 20, color: X.slate, fontSize: 14 }}>Team management is available to store managers.</div>
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: FONT.headingWeight }}>Team</h2>
        <button style={btnPrimary} onClick={() => setAdding(true)}>+ Add Team Member</button>
      </div>
      <div style={{ fontSize: 13, color: X.slate, marginBottom: 12, maxWidth: 660, lineHeight: 1.5 }}>
        Everyone at your store. Titles drive the Top sellers and By department reports;
        titles containing “Manager” also unlock pricing, discounts, and this tab.
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8, fontSize: 13 }}>{err}</div>}

      {adding && <AddCard profile={profile} onDone={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />}

      <div style={{ ...CARD, padding: 18 }}>
        {team === null && <div style={{ color: X.slate, fontSize: 14 }}>Loading…</div>}
        {team !== null && team.length === 0 && <div style={{ color: X.slate, fontSize: 14 }}>Nobody here yet.</div>}
        {team?.map((m) => <MemberRow key={m.id} m={m} me={profile.id} onChanged={load} onError={setErr} />)}
      </div>
    </div>
  )
}

function MemberRow({ m, me, onChanged, onError }) {
  const [busy, setBusy] = useState(false)

  async function change(title) {
    if (m.id === me && isManagerTitle(m.title) && !isManagerTitle(title)) {
      if (!window.confirm('This removes YOUR manager access (pricing, discounts, team management). Continue?')) return
    }
    setBusy(true)
    try { await setUserTitle(m.id, title || null); await onChanged() }
    catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: `1px solid ${X.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {m.full_name || m.email}
          {m.id === me && <span style={{ color: X.slate, fontWeight: 400 }}> (you)</span>}
        </div>
        <div style={{ fontSize: 12, color: X.slate }}>{m.email}</div>
      </div>
      {isManagerTitle(m.title) && <span style={mgrPill}>Manager</span>}
      <select value={m.title || ''} disabled={busy} onChange={(e) => change(e.target.value)} style={sel}>
        <option value="">No title</option>
        {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  )
}

function AddCard({ profile, onDone, onCancel }) {
  const [f, setF] = useState({ full_name: '', email: '', password: '', title: 'Sales Advisor' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const missing = []
  if (!f.full_name.trim()) missing.push('a name')
  if (!f.email.trim()) missing.push('an email')
  if (f.password.length < 6) missing.push('a password of at least 6 characters')
  const ready = missing.length === 0

  async function submit() {
    setBusy(true); setMsg('')
    try {
      const user = await adminCreateUser({ email: f.email.trim(), password: f.password, full_name: f.full_name.trim() })
      // Pull the brand-new account into THIS store (database-verified claim).
      await claimStoreUser(user.id, {
        full_name: f.full_name.trim(),
        title: f.title || null,
        group_id: profile.group_id,
        dealership_id: profile.dealership_id,
      })
      setMsg(`✓ ${f.email.trim()} added to your store. Share the temporary password with them.`)
      setTimeout(onDone, 1400)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="x-fade" style={{ ...CARD, padding: 18, marginBottom: 12, background: '#FFFDF5', border: '1px solid rgba(253,181,33,0.6)' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>New Team Member</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <input placeholder="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} style={inp} />
        <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inp} />
        <input placeholder="Temporary password (6+ chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} style={inp} />
        <select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp}
          title='Titles containing "Manager" unlock pricing, discounts, and team management'>
          {TITLES.map((t) => <option key={t} value={t}>{t}{isManagerTitle(t) ? ' — manager' : ''}</option>)}
          <option value="">No title</option>
        </select>
      </div>
      {!ready && <div style={{ marginTop: 10, fontSize: 12.5, color: X.slate }}>Still needed: {missing.join(', ')}.</div>}
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('✓') ? X.green : X.red }}>{msg}</div>}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button style={{ ...btnPrimary, opacity: ready && !busy ? 1 : 0.5 }} disabled={!ready || busy} onClick={submit}>
          {busy ? 'Creating…' : 'Add to Store'}
        </button>
        <button style={btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
const sel = { border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 10px', fontSize: 13, fontFamily: FONT.body, background: '#FFFFFD', minWidth: 210 }
const inp = { width: '100%', boxSizing: 'border-box', background: '#FFFFFD', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 11px', fontSize: 14, fontFamily: FONT.body }
const mgrPill = { fontFamily: FONT.body, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: X.black, background: X.yellow, borderRadius: 999, padding: '4px 10px', flexShrink: 0 }
