import { useEffect, useState } from 'react'
import { getDealerships, getAuthorizedDealers } from '../lib/db'
import { getAllPrograms, getAllProgramProducts, createProgram, renameProgram, deleteProgram, duplicateProgram, addProgramProduct, removeProgramProduct, setProgramWholesale } from '../lib/adminDb'
import { COLOR as X, FONT, CARD, money } from '../lib/theme'
import { Eyebrow } from './ui'

// =============================================================================
// Protection Programs — named package sets ("Standard", "Premium", ...).
// Programs are LINKED: check or uncheck a package here and every rooftop on
// the program updates instantly. Prices are NOT set here — each rooftop's
// pricing lives on the store itself (Network -> Program & Pricing).
// =============================================================================
export default function ProgramsAdmin({ products, mode = 'admin', dealerId = null }) {
  const [programs, setPrograms] = useState([])
  const [links, setLinks] = useState([])
  const [stores, setStores] = useState([])
  const [dealers, setDealers] = useState([])
  const [err, setErr] = useState('')
  const [newName, setNewName] = useState('')

  const load = () =>
    Promise.all([getAllPrograms(), getAllProgramProducts(), getDealerships(), getAuthorizedDealers()])
      .then(([p, l, d, ad]) => { setPrograms(p); setLinks(l); setStores(d); setDealers(ad) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function add() {
    if (!newName.trim()) return
    try {
      // Programs created by an installer belong to their shop.
      await createProgram(newName.trim(), mode === 'installer' ? dealerId : null)
      setNewName(''); load()
    } catch (e) { setErr(e.message) }
  }

  const activeProducts = products.filter((p) => p.active)

  return (
    <div style={{ ...panel, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Protection Programs</div>
          <div style={{ fontSize: 12.5, color: X.slate, marginTop: 2, maxWidth: 640 }}>
            {mode === 'installer'
              ? <>Your shop's package sets, with <b>your wholesale rate</b> on each package. Programs are <b>linked</b> —
                 edit one and every store on it updates instantly. Assign programs to stores under My Stores;
                 each store controls its own retail.</>
              : <>Named package sets with the owning shop's <b>wholesale</b> per package. Programs are <b>linked</b> —
                 editing one updates every store on it instantly. Store retail lives on the rooftop
                 (Dealerships → Program &amp; Pricing).</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="New program name" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ ...input, width: 220 }} />
          <button style={{ ...btnPrimary, opacity: newName.trim() ? 1 : 0.5 }} disabled={!newName.trim()} onClick={add}>+ Create</button>
        </div>
      </div>
      {err && <div style={{ color: X.red, marginTop: 8 }}>{err}</div>}
      {programs.length === 0 && (
        <div style={{ fontSize: 13.5, color: X.slate, marginTop: 12 }}>No programs yet — create the first one above.</div>
      )}
      {programs.map((prog) => (
        <ProgramCard key={prog.id} program={prog} products={activeProducts}
          links={links.filter((l) => l.program_id === prog.id)}
          storeCount={stores.filter((s) => s.program_id === prog.id).length}
          ownerName={dealers.find((d) => d.id === prog.authorized_dealer_id)?.name ?? null}
          canEdit={mode === 'admin' || prog.authorized_dealer_id === dealerId}
          onChanged={load} onError={setErr} />
      ))}
    </div>
  )
}

function ProgramCard({ program, products, links, storeCount, ownerName, canEdit, onChanged, onError }) {
  const [name, setName] = useState(program.name)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const linkedIds = new Set(links.map((l) => l.product_id))
  const wholesaleByProduct = new Map(links.map((l) => [l.product_id, l.wholesale]))

  const byCategory = []
  for (const p of products) {
    const cat = p.category || 'Other'
    let bucket = byCategory.find(([c]) => c === cat)
    if (!bucket) { bucket = [cat, []]; byCategory.push(bucket) }
    bucket[1].push(p)
  }

  async function saveName() {
    if (name.trim() && name !== program.name) {
      try { await renameProgram(program.id, name.trim()); onChanged() } catch (e) { onError(e.message) }
    }
  }
  async function toggle(p) {
    setBusy(true)
    try {
      if (linkedIds.has(p.id)) await removeProgramProduct(program.id, p.id)
      else await addProgramProduct(program.id, p.id)
      await onChanged()
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }
  async function copy() {
    const newName = window.prompt('Name for the copy:', `${program.name} (copy)`)
    if (!newName?.trim()) return
    try { await duplicateProgram(program.id, newName.trim()); onChanged() } catch (e) { onError(e.message) }
  }
  async function remove() {
    const warn = storeCount > 0
      ? `Delete "${program.name}"?\n\n${storeCount} rooftop(s) are on this program — their order menus will be EMPTY until you assign them another program.`
      : `Delete "${program.name}"?`
    if (!window.confirm(warn)) return
    try { await deleteProgram(program.id); onChanged() } catch (e) { onError(e.message) }
  }

  return (
    <div style={{ borderTop: `1px solid ${X.line}`, marginTop: 12, paddingTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} disabled={!canEdit} style={{ ...input, fontWeight: 700, flex: 1, minWidth: 200 }} />
        <span style={ownerChip} title="Which shop owns (and can edit) this program">{ownerName ?? 'XPEL house'}</span>
        <span style={{ fontSize: 12, color: X.slate }}>
          {linkedIds.size} package{linkedIds.size === 1 ? '' : 's'} · {storeCount} rooftop{storeCount === 1 ? '' : 's'}
        </span>
        <button style={btnGhost} onClick={() => setOpen(!open)}>{open ? 'Close' : (canEdit ? 'Edit packages' : 'View packages')}</button>
        {canEdit && <button style={btnGhost} onClick={copy}>Duplicate</button>}
        {canEdit && <button style={{ ...btnGhost, color: X.red, borderColor: 'rgba(125,20,25,0.4)' }} onClick={remove}>Delete</button>}
      </div>
      {open && (
        <div className="x-fade" style={{ margin: '10px 0 4px', padding: 16, background: X.bg, borderRadius: 12 }}>
          <Eyebrow>Packages in this program</Eyebrow>
          {byCategory.map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: X.slate, margin: '6px 0 4px' }}>{cat}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 4 }}>
                {items.map((p) => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '5px 6px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', background: linkedIds.has(p.id) ? '#FFF7E0' : 'transparent' }}>
                    <input type="checkbox" checked={linkedIds.has(p.id)} disabled={busy || !canEdit} onChange={() => toggle(p)} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {linkedIds.has(p.id) && (
                      <WholesaleInput program={program} product={p} disabled={!canEdit}
                        value={wholesaleByProduct.get(p.id) ?? null} onChanged={onChanged} onError={onError} />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: X.slate, marginTop: 6 }}>
            Linked program: package and wholesale changes here apply to all {storeCount} rooftop{storeCount === 1 ? '' : 's'} on it,
            immediately — for <b>future</b> orders. Every past order keeps the wholesale and retail it was placed at.
          </div>
        </div>
      )}
    </div>
  )
}

// The installer's wholesale rate on one package in this program.
// Blank = the catalog default cost. Commits on blur.
function WholesaleInput({ program, product, value, disabled, onChanged, onError }) {
  const [v, setV] = useState(value != null ? String(value) : '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setV(value != null ? String(value) : '') }, [value])

  async function commit() {
    const t = v.trim()
    const cur = value != null ? Number(value) : null
    try {
      if (t === '') {
        if (cur != null) { setBusy(true); await setProgramWholesale(program.id, product.id, null); await onChanged() }
        return
      }
      const n = Number(t)
      if (!isFinite(n) || n < 0) { setV(cur != null ? String(cur) : ''); return }
      if (cur == null || n !== cur) { setBusy(true); await setProgramWholesale(program.id, product.id, n); await onChanged() }
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  return (
    <input
      type="number" min="0" step="0.01"
      value={v} disabled={busy || disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      placeholder={`WS ${money(product.cost, 0)}`}
      title="Your wholesale for this package (blank = catalog default)"
      style={{ ...input, width: 110, padding: '6px 8px', fontSize: 12.5, fontWeight: value != null ? 700 : 400, background: value != null ? '#FFFFFD' : '#FBFAF6' }}
    />
  )
}

const ownerChip = { fontFamily: FONT.body, fontSize: 11, fontWeight: 700, color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }
const panel = { ...CARD, padding: 18, fontFamily: FONT.body }
const input = { boxSizing: 'border-box', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, fontFamily: FONT.body, background: '#FFFFFD' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
