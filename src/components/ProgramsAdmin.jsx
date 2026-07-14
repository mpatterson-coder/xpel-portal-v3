import { useEffect, useState } from 'react'
import { getDealerships } from '../lib/db'
import { getAllPrograms, getAllProgramProducts, createProgram, renameProgram, deleteProgram, duplicateProgram, addProgramProduct, removeProgramProduct } from '../lib/adminDb'
import { COLOR as X, FONT, CARD, money } from '../lib/theme'
import { Eyebrow } from './ui'

// =============================================================================
// Protection Programs — named package sets ("Standard", "Premium", ...).
// Programs are LINKED: check or uncheck a package here and every rooftop on
// the program updates instantly. Prices are NOT set here — each rooftop's
// pricing lives on the store itself (Network -> Program & Pricing).
// =============================================================================
export default function ProgramsAdmin({ products }) {
  const [programs, setPrograms] = useState([])
  const [links, setLinks] = useState([])
  const [stores, setStores] = useState([])
  const [err, setErr] = useState('')
  const [newName, setNewName] = useState('')

  const load = () =>
    Promise.all([getAllPrograms(), getAllProgramProducts(), getDealerships()])
      .then(([p, l, d]) => { setPrograms(p); setLinks(l); setStores(d) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function add() {
    if (!newName.trim()) return
    try { await createProgram(newName.trim()); setNewName(''); load() } catch (e) { setErr(e.message) }
  }

  const activeProducts = products.filter((p) => p.active)

  return (
    <div style={{ ...panel, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Protection Programs</div>
          <div style={{ fontSize: 12.5, color: X.slate, marginTop: 2, maxWidth: 640 }}>
            Named package sets. Assign a program to each rooftop under Network — programs are <b>linked</b>,
            so editing one here updates every store on it instantly. Store-specific prices are set on the
            rooftop itself (Network → Program &amp; Pricing).
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
          linkedIds={new Set(links.filter((l) => l.program_id === prog.id).map((l) => l.product_id))}
          storeCount={stores.filter((s) => s.program_id === prog.id).length}
          onChanged={load} onError={setErr} />
      ))}
    </div>
  )
}

function ProgramCard({ program, products, linkedIds, storeCount, onChanged, onError }) {
  const [name, setName] = useState(program.name)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

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
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} style={{ ...input, fontWeight: 700, flex: 1, minWidth: 200 }} />
        <span style={{ fontSize: 12, color: X.slate }}>
          {linkedIds.size} package{linkedIds.size === 1 ? '' : 's'} · {storeCount} rooftop{storeCount === 1 ? '' : 's'}
        </span>
        <button style={btnGhost} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit packages'}</button>
        <button style={btnGhost} onClick={copy}>Duplicate</button>
        <button style={{ ...btnGhost, color: X.red, borderColor: 'rgba(125,20,25,0.4)' }} onClick={remove}>Delete</button>
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
                    <input type="checkbox" checked={linkedIds.has(p.id)} disabled={busy} onChange={() => toggle(p)} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ color: X.slate, fontSize: 12 }}>{money(p.unit_price, 0)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: X.slate, marginTop: 6 }}>
            Linked program: changes here apply to all {storeCount} rooftop{storeCount === 1 ? '' : 's'} on it, immediately.
            Past orders and reports are unaffected.
          </div>
        </div>
      )}
    </div>
  )
}

const panel = { ...CARD, padding: 18, fontFamily: FONT.body }
const input = { boxSizing: 'border-box', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, fontFamily: FONT.body, background: '#FFFFFD' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
