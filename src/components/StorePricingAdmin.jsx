import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getCatalog, getCatalogFor, setPackageAlias, setPackageHidden } from '../lib/db'
import { useConfirm } from './ConfirmDialog'
import { setDealershipPrice, clearDealershipPrice } from '../lib/adminDb'
import { COLOR as X, FONT, CARD, money } from '../lib/theme'

// =============================================================================
// Packages & Pricing — the STORE's own controls (manager-only):
//   • Display name: how a package appears on THIS store's order screen and
//     reports. The official name stays visible to the installer, so the right
//     thing always gets installed.
//   • Retail: this store's selling price. Floor = the store's wholesale — the
//     database enforces the same rule, this screen just says it nicely first.
// Changes apply to FUTURE orders only; every placed order keeps its prices.
// =============================================================================
export default function StorePricingAdmin({ dealershipId: dIdProp = null, adminMode = false }) {
  const { profile, isManager } = useAuth()
  const dealershipId = dIdProp ?? profile?.dealership_id
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')

  const load = () => (adminMode ? getCatalogFor(dealershipId) : getCatalog())
    .then(setItems).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [dealershipId])

  const byCategory = useMemo(() => {
    const map = new Map()
    for (const p of (items ?? [])) {
      const key = p.category || 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    return Array.from(map.entries())
  }, [items])

  if (!isManager && !adminMode) {
    return <div style={{ ...CARD, padding: 20, color: X.slate, fontSize: 14 }}>Packages &amp; Pricing is available to store managers.</div>
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: FONT.headingWeight }}>Packages &amp; Pricing</h2>
      <div style={{ fontSize: 13, color: X.slate, marginBottom: 14, maxWidth: 700, lineHeight: 1.5 }}>
        Rename how packages appear on <b>your</b> order screen and set <b>your</b> retail price
        (never below wholesale). Your installer always sees the official package name, and
        changes apply to new orders only — placed orders keep their prices. New packages from
        your installer arrive <b>unpriced</b> and stay hidden from ordering until you set a retail here.
        {adminMode && <span style={{ color: '#8A6100', fontWeight: 700 }}> You're editing this store's setup as XPEL admin — the store sees your changes immediately.</span>}
      </div>
      {err && <div style={{ color: X.red, marginBottom: 10, fontSize: 13 }}>{err}</div>}
      {items === null && !err && <div style={{ color: X.slate, fontSize: 14 }}>Loading…</div>}
      {items !== null && items.length === 0 && (
        <div style={{ ...CARD, padding: 18, color: X.slate, fontSize: 14 }}>
          No program is assigned to this store yet, so there's nothing to price. Your servicing
          installer (or XPEL) assigns the program.
        </div>
      )}
      {byCategory.map(([cat, list]) => (
        <div key={cat} style={{ ...CARD, padding: 18, marginBottom: 14 }}>
          <div style={catLbl}>{cat}</div>
          <div style={{ ...grid, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, fontWeight: 700, paddingBottom: 6 }}>
            <div>Package</div>
            <div>Display name (yours)</div>
            <div style={{ textAlign: 'right' }}>Wholesale</div>
            <div style={{ textAlign: 'right' }}>Your retail</div>
            <div style={{ textAlign: 'right' }}>Margin</div>
            <div style={{ textAlign: 'center' }}>Active</div>
          </div>
          {list.map((p) => (
            <Row key={p.id} p={p} dealershipId={dealershipId} onChanged={load} onError={setErr} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Row({ p, dealershipId, onChanged, onError }) {
  const confirm = useConfirm()
  const [alias, setAlias] = useState(p.alias ?? '')
  const [price, setPrice] = useState(p.price_overridden ? String(p.effective_price) : '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setAlias(p.alias ?? '')
    setPrice(p.price_overridden ? String(p.effective_price) : '')
  }, [p.alias, p.price_overridden, p.effective_price])

  const wholesale = Number(p.effective_wholesale ?? 0)

  async function commitAlias() {
    const next = alias.trim()
    if (next === (p.alias ?? '')) return
    setBusy(true)
    try { await setPackageAlias(dealershipId, p.id, next || null); await onChanged() }
    catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  async function commitPrice() {
    const t = price.trim()
    setBusy(true)
    try {
      if (t === '') {
        if (p.price_overridden) { await clearDealershipPrice(dealershipId, p.id); await onChanged() }
        return
      }
      const n = Number(t)
      if (!isFinite(n) || n < 0) { setPrice(p.price_overridden ? String(p.effective_price) : ''); return }
      if (n < wholesale) {
        onError(`"${p.canonical_name}": retail ${money(n)} is below your wholesale ${money(wholesale)} — not saved.`)
        setPrice(p.price_overridden ? String(p.effective_price) : '')
        return
      }
      if (!p.price_overridden || n !== Number(p.effective_price)) {
        const newMargin = n - wholesale
        const newPct = n ? Math.round((newMargin / n) * 100) : 0
        const ok = await confirm({
          title: 'Update this retail price?',
          message: 'Applies to future orders only — every placed order keeps its price.',
          summary: [
            ['Package', p.canonical_name],
            ['Wholesale', money(wholesale)],
            ['Retail', `${p.priced ? money(Number(p.effective_price)) : '\u2014'} \u2192 ${money(n)}`],
            ['New margin', `${money(newMargin)} \u00b7 ${newPct}%`],
          ],
          confirmLabel: 'Update price',
        })
        if (!ok) { setPrice(p.price_overridden ? String(p.effective_price) : ''); return }
        await setDealershipPrice(dealershipId, p.id, n)
        await onChanged()
      }
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  async function toggleHidden() {
    if (!p.hidden) {
      const ok = await confirm({
        title: 'Hide this package from the order screen?',
        message: 'Your team won\u2019t be able to order it until you show it again. Pricing and history are untouched.',
        summary: [['Package', p.canonical_name]],
        confirmLabel: 'Hide package',
      })
      if (!ok) return
    }
    setBusy(true)
    try { await setPackageHidden(dealershipId, p.id, !p.hidden); await onChanged() }
    catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  const margin = Number(p.effective_price) - wholesale
  const marginPct = p.priced && Number(p.effective_price) > 0 ? Math.round((margin / Number(p.effective_price)) * 100) : 0
  return (
    <div style={{ ...grid, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${X.line}`, fontSize: 13.5 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.canonical_name}</div>
        {p.tier && <div style={{ fontSize: 11, color: X.slate }}>{p.tier}</div>}
        {p.description && <div style={{ fontSize: 12, color: X.slate, marginTop: 3, lineHeight: 1.45, whiteSpace: 'normal' }}>{p.description}</div>}
        {p.hidden && (
          <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: X.red, marginTop: 2 }}>
            Hidden from order screen
          </div>
        )}
        {!p.priced && (
          <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A6100', marginTop: 2 }}>
            Not priced — hidden from ordering
          </div>
        )}
      </div>
      <input value={alias} disabled={busy} onChange={(e) => setAlias(e.target.value)} onBlur={commitAlias}
        placeholder={p.canonical_name}
        title="How this package appears on YOUR order screen (blank = official name)" style={inp} />
      <div style={{ textAlign: 'right', color: X.slate }}>{money(wholesale)}</div>
      <input type="number" min="0" step="0.01" value={price} disabled={busy}
        onChange={(e) => setPrice(e.target.value)} onBlur={commitPrice}
        placeholder={p.priced && p.base_price != null ? `Base ${money(Number(p.base_price), 0)}` : 'Set retail'}
        title="Your retail (blank = base price). Can't go below wholesale."
        style={{ ...inp, textAlign: 'right', fontWeight: p.price_overridden ? 700 : 400 }} />
      <div style={{ textAlign: 'right', color: X.green, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {p.priced ? <>+{money(margin)} <span style={{ fontSize: 11.5, color: X.slate, fontWeight: 600 }}>({marginPct}%)</span></> : <span style={{ color: X.slate, fontWeight: 400 }}>—</span>}
      </div>
      <div style={{ textAlign: 'center' }}>
        <button onClick={toggleHidden} disabled={busy}
          title={p.hidden ? 'Show this package on your order screen' : 'Hide this package from your order screen'}
          style={{ background: p.hidden ? X.stone : '#EAF0EB', color: p.hidden ? X.slate : X.green, border: `1px solid ${p.hidden ? X.gray : X.green}`, borderRadius: 999, padding: '5px 12px', fontWeight: 800, fontSize: 10.5, cursor: 'pointer', fontFamily: FONT.body, letterSpacing: '0.04em' }}>
          {p.hidden ? 'HIDDEN' : 'ACTIVE'}
        </button>
      </div>
    </div>
  )
}

const grid = { display: 'grid', gridTemplateColumns: 'minmax(170px, 1.4fr) minmax(140px, 1fr) 84px 128px 110px 96px', gap: 10 }
const catLbl = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, fontWeight: 700, marginBottom: 8 }
const inp = { width: '100%', boxSizing: 'border-box', background: '#FFFFFD', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '9px 10px', fontSize: 13.5, fontFamily: FONT.body }
