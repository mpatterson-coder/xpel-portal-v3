import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getCatalog, createOrder } from '../lib/db'
import { decodeVinFull, isLikelyVin } from '../lib/vin'
import { usePersistentState } from '../lib/uiState'
import { COLOR as X, FONT, CARD, money } from '../lib/theme'

const SIZES = ['standard', 'midsize', 'fullsize']
const EMPTY_VEH = { year: '', make: '', model: '', trim: '', size: '' }
const EMPTY_CUST = { first: '', last: '', phone: '', email: '', pickup: '' }

// Today's date as YYYY-MM-DD in the user's LOCAL timezone (used to stop the
// calendar from offering past dates; toISOString() would use UTC and can be
// a day off in US timezones).
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// V3 ordering flow. IMPORTANT DESIGN PRINCIPLE: nothing here is hardcoded to
// any product, package, category, or tier. The screen groups whatever is in
// the live catalog by its category field, so anything an admin creates in
// Catalog & Pricing — new categories included — appears here automatically.
//
// The in-progress order (VIN, decoded vehicle, customer details, cart) is a
// PERSISTENT DRAFT: it survives switching browser tabs and even a full page
// reload, and is cleared only when the order is submitted. Keys are scoped to
// the signed-in user so one person's draft never appears for another.
export default function OrderForm({ onCreated }) {
  const { profile, isManager } = useAuth()
  const [catalog, setCatalog] = useState(null) // null = still loading
  const [loadErr, setLoadErr] = useState('')

  const uid = profile?.id || 'anon'
  const [vin, setVin] = usePersistentState(`xpel.${uid}.order.vin`, '')
  const [vehRaw, setVeh] = usePersistentState(`xpel.${uid}.order.veh`, EMPTY_VEH)
  const [decoded, setDecoded] = usePersistentState(`xpel.${uid}.order.decoded`, false)
  const [decodeNote, setDecodeNote] = usePersistentState(`xpel.${uid}.order.note`, '')
  const [custRaw, setCust] = usePersistentState(`xpel.${uid}.order.cust`, EMPTY_CUST)
  const [linesRaw, setLines] = usePersistentState(`xpel.${uid}.order.lines`, [])
  // Merge over the defaults so a draft saved by an older version of the app
  // can never be missing a field.
  const veh = { ...EMPTY_VEH, ...vehRaw }
  const cust = { ...EMPTY_CUST, ...custRaw }
  // Business rule: a vehicle gets AT MOST ONE of each package — nobody orders
  // two full-body PPF coverages for the same car. Quantity is pinned to 1
  // (also normalizes any older saved draft that predates this rule).
  const lines = (linesRaw ?? []).map((l) => ({ ...l, quantity: 1, disc: l.disc ?? null }))

  const [showMargin, setShowMargin] = useState(false) // deliberately NOT persisted: always reopens hidden (safe for customer presentation)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { getCatalog().then(setCatalog).catch((e) => setLoadErr(e.message)) }, [])

  // Dynamic category grouping — the admin's catalog drives the layout.
  const byCategory = useMemo(() => {
    const map = new Map()
    // Unpriced packages (no retail set anywhere yet) never reach the order
    // screen — a store admin prices them under Packages & Pricing first.
    for (const p of (catalog ?? []).filter((x) => x.priced !== false)) {
      const key = p.category || 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    return Array.from(map.entries())
  }, [catalog])

  const [decoding, setDecoding] = useState(false)

  async function handleDecode() {
    setDecoding(true); setDecodeNote('')
    const d = await decodeVinFull(vin)
    setVeh({
      year: d.year ? String(d.year) : '',
      make: d.make || '',
      model: d.model || '',
      trim: d.trim || '',
      size: d.size || '',
    })
    setDecoded(true)
    setDecoding(false)
    setDecodeNote(d.source === 'nhtsa'
      ? (d.size
          ? 'Vehicle decoded. Size pre-selected from body style — confirm or adjust below.'
          : 'Vehicle decoded. Confirm details and choose a size below.')
      : 'Vehicle lookup unavailable — year decoded locally. Enter make, model, trim and size.')
  }

  // Catalog items toggle: click to add, click again to remove (max 1 each).
  function toggleLine(product) {
    setLines((ls) => ls.find((l) => l.product.id === product.id)
      ? ls.filter((l) => l.product.id !== product.id)
      : [...ls, { product, quantity: 1 }])
  }
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.product.id !== id))

  // ---- Manager discounts: per line, $ or %, floored at wholesale ------------
  const setDisc = (id, patch) =>
    setLines((ls) => ls.map((l) => l.product.id === id
      ? { ...l, disc: { ...(l.disc ?? { mode: '$', value: '' }), ...patch } }
      : l))
  const clearDisc = (id) =>
    setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, disc: null } : l)))

  // One line's money math: list retail, the wholesale floor, and what's
  // actually charged after any discount — never below wholesale, never above
  // list. The database enforces the exact same rules on submit.
  function linePricing(l) {
    const list = Number(l.product.effective_price)
    const floor = Number(l.product.effective_wholesale ?? l.product.cost ?? 0)
    let requested = list
    if (isManager && l.disc && Number(l.disc.value) > 0) {
      const off = l.disc.mode === '%' ? (list * Number(l.disc.value)) / 100 : Number(l.disc.value)
      requested = Math.round((list - off) * 100) / 100
    }
    const charged = Math.min(list, Math.max(floor, requested))
    return { list, floor, charged, floored: requested < floor }
  }

  const totals = useMemo(() => {
    let revenue = 0, wholesale = 0, list = 0
    for (const l of lines) {
      const pr = linePricing(l)
      revenue += pr.charged
      wholesale += pr.floor
      list += pr.list
    }
    const margin = revenue - wholesale
    return {
      revenue, wholesale, margin, list,
      discount: Math.max(0, list - revenue),
      marginPct: revenue ? Math.round((margin / revenue) * 100) : 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, isManager])

  const canSubmit = lines.length > 0 && cust.first.trim() && cust.last.trim() && veh.size && !busy

  async function submit() {
    setBusy(true); setMsg('')
    try {
      const first = cust.first.trim()
      const last = cust.last.trim()
      const order = await createOrder(profile, {
        lines: lines.map((l) => {
          const pr = linePricing(l)
          return {
            product_id: l.product.id,
            quantity: 1,
            unit_price: pr.charged,                            // what the customer pays
            list_price: pr.list,                               // pre-discount retail, frozen
            unit_cost: l.product.effective_wholesale ?? null,  // wholesale, frozen
          }
        }),
        customer_first_name: first,
        customer_last_name: last,
        customer_name: `${first} ${last}`.trim(), // combined copy, so every existing screen keeps displaying names
        customer_phone: cust.phone.trim() || null,
        customer_email: cust.email.trim() || null,
        pickup_date: cust.pickup || null,
        vin: vin.trim() || null,
        vehicle_year: veh.year ? Number(veh.year) : null,
        vehicle_make: veh.make.trim() || null,
        vehicle_model: veh.model.trim() || null,
        vehicle_trim: veh.trim.trim() || null,
        vehicle_size: veh.size,
      })
      setMsg(`✓ Order ${order.order_number} submitted.`)
      // Clear the draft (persistence saves the cleared values, so nothing lingers).
      setVin(''); setVeh(EMPTY_VEH); setDecoded(false); setDecodeNote('')
      setCust(EMPTY_CUST); setLines([])
      onCreated?.()
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: FONT.headingWeight }}>New Protection Order</h2>

      <Label>Vehicle</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="VIN (17 characters)" style={{ ...input, flex: 1 }} />
        <button onClick={handleDecode} disabled={!isLikelyVin(vin) || decoding} style={{ ...btnDark, opacity: isLikelyVin(vin) && !decoding ? 1 : 0.5 }}>{decoding ? 'Decoding…' : 'Decode'}</button>
      </div>
      {decoded && (
        <>
          <div style={{ fontSize: 12.5, color: X.strata, margin: '8px 0 4px' }}>{decodeNote}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {['year', 'make', 'model', 'trim'].map((k) => (
              <div key={k}>
                <div style={{ ...fieldLbl, textTransform: 'capitalize' }}>{k}</div>
                <input value={veh[k]} onChange={(e) => setVeh({ ...veh, [k]: e.target.value })} style={input} />
              </div>
            ))}
          </div>
          <Label>Vehicle Size</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {SIZES.map((s) => (
              <button key={s} onClick={() => setVeh({ ...veh, size: s })} style={{ ...pill, ...(veh.size === s ? pillOn : {}) }}>{s}</button>
            ))}
          </div>
        </>
      )}

      <Label>Customer</Label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['First Name', 'first', 'text'],
          ['Last Name', 'last', 'text'],
          ['Phone', 'phone', 'tel'],
          ['Email', 'email', 'email']].map(([lbl, key, type]) => (
          <div key={key}>
            <div style={fieldLbl}>{lbl}</div>
            <input type={type} value={cust[key]} onChange={(e) => setCust({ ...cust, [key]: e.target.value })} style={input} />
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={fieldLbl}>Date Vehicle Available for Pick-Up</div>
          <input
            type="date"
            min={todayStr()}
            value={cust.pickup}
            onChange={(e) => setCust({ ...cust, pickup: e.target.value })}
            style={{ ...input, maxWidth: 240 }}
          />
        </div>
      </div>

      {loadErr && <div style={{ color: X.red, fontSize: 13, marginTop: 12 }}>{loadErr}</div>}
      {catalog !== null && !loadErr && catalog.length === 0 && (
        <div style={{ marginTop: 18, fontSize: 13.5, color: X.slate, lineHeight: 1.55 }}>
          No program is assigned to this store yet. Your XPEL administrator sets each
          store's program and pricing — packages appear here the moment it's assigned.
        </div>
      )}
      {catalog !== null && !loadErr && catalog.length > 0 && catalog.every((x) => x.priced === false) && (
        <div style={{ marginTop: 18, fontSize: 13.5, color: X.slate, lineHeight: 1.55 }}>
          Your program's packages haven't been priced yet. A store admin sets retail under
          Packages &amp; Pricing — they'll appear here the moment prices are set.
        </div>
      )}

      {/* Catalog — one section per category, entirely driven by admin data */}
      {byCategory.map(([category, products]) => (
        <div key={category}>
          <Label>{category}</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {products.map((p) => {
              const inCart = lines.find((l) => l.product.id === p.id)
              return (
                <button key={p.id} onClick={() => toggleLine(p)} className="x-lift"
                  style={{ ...catItem, ...(inCart ? catItemOn : {}) }} title={inCart ? 'Click to remove from this order' : (p.description || '')}>
                  <div style={{ minWidth: 0 }}>
                    {p.tier && <span style={tierTag}>{p.tier}</span>}
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
                    {p.description && <div style={desc}>{p.description}</div>}
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 8 }}>
                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(p.effective_price)}</div>
                    {inCart && <div style={inCartTag}>✓ In order</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {lines.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${X.line}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label noTop>Order Summary</Label>
            <label style={{ fontSize: 12, color: X.slate, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={showMargin} onChange={(e) => setShowMargin(e.target.checked)} /> Show margin
            </label>
          </div>
          {lines.map((l) => {
            const pr = linePricing(l)
            const discounted = pr.charged < pr.list
            return (
              <div key={l.product.id} style={{ padding: '6px 0', borderBottom: `1px dashed ${X.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{l.product.name}</div>
                  {isManager && (l.disc ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {['$', '%'].map((m) => (
                        <button key={m} onClick={() => setDisc(l.product.id, { mode: m })}
                          style={{ ...miniBtn, ...(l.disc.mode === m ? miniBtnOn : {}) }}>{m}</button>
                      ))}
                      <input type="number" min="0" value={l.disc.value} autoFocus
                        onChange={(e) => setDisc(l.product.id, { value: e.target.value })}
                        placeholder="0" style={miniInput} />
                      <button onClick={() => clearDisc(l.product.id)} style={xBtnSm} title="Remove discount">×</button>
                    </span>
                  ) : (
                    <button onClick={() => setDisc(l.product.id, { mode: '$', value: '' })} style={discBtn}>Discount</button>
                  ))}
                  <div style={{ width: 116, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {discounted && <s style={{ color: X.slate, fontSize: 12, marginRight: 6, fontWeight: 400 }}>{money(pr.list)}</s>}
                    <span style={{ fontWeight: discounted ? 700 : 400 }}>{money(pr.charged)}</span>
                  </div>
                  {showMargin && <div style={{ width: 84, textAlign: 'right', color: X.green, fontSize: 13 }}>+{money(pr.charged - pr.floor)}</div>}
                  <button onClick={() => removeLine(l.product.id)} style={xBtn}>×</button>
                </div>
                {pr.floored && (
                  <div style={{ fontSize: 11.5, color: X.red, textAlign: 'right', marginTop: 2 }}>
                    Floored at wholesale {money(pr.floor)} — discounts can't go below it.
                  </div>
                )}
              </div>
            )
          })}
          {totals.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: X.slate, fontSize: 13, marginTop: 6 }}>
              <span>Discounts (off {money(totals.list)} list)</span><span>−{money(totals.discount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 800, fontSize: 16 }}>
            <span>Total</span><span>{money(totals.revenue)}</span>
          </div>
          {showMargin && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: X.green, fontSize: 13 }}>
              <span>Margin ({totals.marginPct}% of revenue)</span><span>{money(totals.margin)}</span>
            </div>
          )}
          {isManager && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: X.slate }}>
              Discounts are a manager action, apply per line, and can never go below your store's wholesale.
            </div>
          )}
        </div>
      )}

      {msg && <div style={{ marginTop: 12, color: msg.includes('submitted') ? X.green : X.red, fontSize: 14 }}>{msg}</div>}
      <button onClick={submit} disabled={!canSubmit} style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.5, marginTop: 16 }}>
        {busy ? 'Submitting…' : 'Submit Order'}
      </button>
    </div>
  )
}

const Label = ({ children, noTop }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, color: X.slate, fontWeight: FONT.subWeight, margin: noTop ? '0 0 6px' : '20px 0 8px' }}>
    <span aria-hidden="true" style={{ width: 7, height: 7, background: X.yellow, transform: 'skewX(-14deg)', flexShrink: 0 }} />
    {children}
  </div>
)

const card = { ...CARD, padding: 28, maxWidth: 780, fontFamily: FONT.body }
const input = { width: '100%', boxSizing: 'border-box', background: '#FFFFFD', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '11px 12px', fontSize: 14, fontFamily: FONT.body }
const fieldLbl = { fontSize: 10.5, color: X.slate, marginBottom: 4 }
const pill = { flex: 1, textTransform: 'capitalize', border: `1px solid ${X.gray}`, background: '#FFFFFD', borderRadius: 10, padding: '11px 10px', cursor: 'pointer', fontFamily: FONT.body, fontWeight: 600 }
const pillOn = { background: X.black, color: '#fff', borderColor: X.black }
const catItemOn = { borderColor: '#FDB521', background: '#FFFBEF', boxShadow: '0 0 0 3px rgba(253,181,33,0.28)' }
const inCartTag = { marginTop: 3, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#000', background: '#FDB521', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }
const catItem = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', border: '1px solid rgba(20,18,19,0.08)', borderRadius: 12, padding: '11px 13px', background: '#FFFFFD', cursor: 'pointer', fontFamily: FONT.body }
const tierTag = { display: 'inline-block', fontSize: 10, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: 700, color: X.black, background: X.yellow, borderRadius: 4, padding: '1px 7px', marginBottom: 4 }
const desc = { fontSize: 11.5, color: X.slate, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 8, padding: '14px 26px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, cursor: 'pointer', fontFamily: FONT.body, fontSize: 13 }
const btnDark = { background: X.black, color: '#fff', border: 'none', borderRadius: 10, padding: '0 20px', fontWeight: 700, cursor: 'pointer', fontFamily: FONT.body }
const xBtn = { border: 'none', background: 'transparent', color: X.red, fontSize: 20, cursor: 'pointer', lineHeight: 1 }
const xBtnSm = { border: 'none', background: 'transparent', color: X.slate, fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }
const discBtn = { border: `1px dashed ${X.gray}`, background: 'transparent', color: X.slate, borderRadius: 8, padding: '4px 9px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: FONT.body }
const miniBtn = { border: `1px solid ${X.gray}`, background: '#FFFFFD', color: X.slate, borderRadius: 7, width: 26, height: 26, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT.body, lineHeight: 1 }
const miniBtnOn = { background: X.black, color: '#fff', borderColor: X.black }
const miniInput = { width: 64, boxSizing: 'border-box', background: '#FFFFFD', border: `1px solid ${X.gray}`, borderRadius: 7, padding: '5px 7px', fontSize: 12.5, fontFamily: FONT.body }
