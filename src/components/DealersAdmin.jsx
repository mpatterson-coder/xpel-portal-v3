import { useEffect, useState } from 'react'
import { getDealerships, getAuthorizedDealers } from '../lib/db'
import { getAllProfiles, createAuthorizedDealer, updateAuthorizedDealer, deleteAuthorizedDealer, setRooftopDealer } from '../lib/adminDb'
import { COLOR as X, FONT, CARD } from '../lib/theme'
import { Eyebrow } from './ui'

// =============================================================================
// XPEL Authorized Dealers — the installer businesses in the network.
//
// The operating model:
//   * a dealer SERVICES one or more rooftops (across groups if needed)
//   * installer USERS belong to a dealer (assigned in the Users tab)
//   * an installer therefore sees exactly the orders of the rooftops their
//     dealer services — enforced by the database, not the UI
// =============================================================================
export default function DealersAdmin() {
  const [dealers, setDealers] = useState([])
  const [stores, setStores] = useState([])
  const [profiles, setProfiles] = useState([])
  const [err, setErr] = useState('')
  const [f, setF] = useState({ name: '', city: '', state: '' })

  const load = () =>
    Promise.all([getAuthorizedDealers(), getDealerships(), getAllProfiles()])
      .then(([d, s, p]) => { setDealers(d); setStores(s); setProfiles(p) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function add() {
    if (!f.name.trim()) return
    try {
      await createAuthorizedDealer({ name: f.name.trim(), city: f.city.trim(), state: f.state.trim() })
      setF({ name: '', city: '', state: '' })
      load()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: FONT.headingWeight }}>XPEL Authorized Dealers</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Dealer name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...input, width: 220 }} />
          <input placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} style={{ ...input, width: 130 }} />
          <input placeholder="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} style={{ ...input, width: 70 }} />
          <button style={{ ...btnPrimary, opacity: f.name.trim() ? 1 : 0.5 }} disabled={!f.name.trim()} onClick={add}>+ Add Dealer</button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: X.slate, marginBottom: 14, maxWidth: 720 }}>
        The installer businesses in the network. Assign each dealer the rooftops it services here;
        assign installer <b>users</b> to their dealer in the Users tab. An installer sees exactly the
        orders of the rooftops their dealer services — even across dealer groups.
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      {dealers.length === 0 && (
        <div style={{ ...panel, color: X.slate, fontSize: 14 }}>
          No authorized dealers yet. Add the first one above — then assign its rooftops and its installer users.
        </div>
      )}

      {dealers.map((d) => (
        <DealerCard key={d.id} dealer={d} dealers={dealers} stores={stores} profiles={profiles} onChanged={load} onError={setErr} />
      ))}
    </div>
  )
}

function DealerCard({ dealer, dealers, stores, profiles, onChanged, onError }) {
  const [name, setName] = useState(dealer.name)
  const [assignId, setAssignId] = useState('')
  const [busy, setBusy] = useState(false)

  const serviced = stores.filter((s) => s.authorized_dealer_id === dealer.id)
  const team = profiles.filter((p) => p.role === 'installer' && p.authorized_dealer_id === dealer.id)
  const assignable = stores.filter((s) => s.authorized_dealer_id !== dealer.id)
  const dealerName = (id) => dealers.find((x) => x.id === id)?.name

  async function saveName() {
    if (name.trim() && name !== dealer.name) {
      try { await updateAuthorizedDealer(dealer.id, { name: name.trim() }); onChanged() } catch (e) { onError(e.message) }
    }
  }
  async function assign() {
    if (!assignId) return
    setBusy(true)
    try { await setRooftopDealer(assignId, dealer.id); setAssignId(''); await onChanged() } catch (e) { onError(e.message) } finally { setBusy(false) }
  }
  async function unassign(storeId) {
    setBusy(true)
    try { await setRooftopDealer(storeId, null); await onChanged() } catch (e) { onError(e.message) } finally { setBusy(false) }
  }
  async function remove() {
    const msg = `Delete "${dealer.name}"?\n\nIts ${serviced.length} rooftop(s) will have no servicing dealer and its ${team.length} installer user(s) will lose access until reassigned.`
    if (!window.confirm(msg)) return
    try { await deleteAuthorizedDealer(dealer.id); onChanged() } catch (e) { onError(e.message) }
  }

  return (
    <div style={{ ...panel, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} style={{ ...input, fontWeight: 700, flex: 1, minWidth: 200 }} />
        <span style={{ fontSize: 12, color: X.slate }}>
          {[dealer.city, dealer.state].filter(Boolean).join(', ')}
          {(dealer.city || dealer.state) ? ' · ' : ''}
          {serviced.length} rooftop{serviced.length === 1 ? '' : 's'} · {team.length} installer user{team.length === 1 ? '' : 's'}
        </span>
        <button style={{ ...btnGhost, color: X.red, borderColor: 'rgba(125,20,25,0.4)' }} onClick={remove}>Delete</button>
      </div>

      <Eyebrow style={{ marginTop: 14 }}>Serviced rooftops</Eyebrow>
      {serviced.length === 0 && <div style={{ fontSize: 13, color: X.slate, marginBottom: 8 }}>None yet — assign the rooftops this dealer services below.</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {serviced.map((s) => (
          <span key={s.id} style={roofChip}>
            {s.name}{s.city ? ` — ${s.city}` : ''}
            <button title="Un-service this rooftop" disabled={busy} onClick={() => unassign(s.id)} style={chipX}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={assignId} onChange={(e) => setAssignId(e.target.value)} style={{ ...input, minWidth: 300 }}>
          <option value="">Assign a rooftop…</option>
          {assignable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.city ? ` — ${s.city}` : ''}{s.authorized_dealer_id ? ` (currently: ${dealerName(s.authorized_dealer_id) ?? 'another dealer'})` : ''}
            </option>
          ))}
        </select>
        <button style={{ ...btnPrimary, opacity: assignId && !busy ? 1 : 0.5 }} disabled={!assignId || busy} onClick={assign}>Assign</button>
      </div>

      <Eyebrow style={{ marginTop: 16 }}>Installer users</Eyebrow>
      {team.length === 0
        ? <div style={{ fontSize: 13, color: X.slate }}>None yet — assign installer users to this dealer in the <b>Users</b> tab.</div>
        : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {team.map((p) => <span key={p.id} style={userChip}>{p.full_name || p.email}</span>)}
          </div>
        )}
    </div>
  )
}

const panel = { ...CARD, padding: 18, fontFamily: FONT.body }
const input = { border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, fontFamily: FONT.body, background: '#FFFFFD' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
const roofChip = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, background: X.bg, border: '1px solid rgba(20,18,19,0.08)', borderRadius: 999, padding: '5px 6px 5px 12px' }
const chipX = { border: 'none', background: 'transparent', color: X.red, fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }
const userChip = { fontSize: 12.5, fontWeight: 600, color: X.black, background: '#FFF3D6', border: '1px solid rgba(253,181,33,0.6)', borderRadius: 999, padding: '5px 12px' }
