import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getCatalog, getCatalogFor, getGroups, getDealerships, createOrder, addOrderPhotos } from '../lib/db'
import { decodeVinFull, isLikelyVin } from '../lib/vin'
import { usePersistentState } from '../lib/uiState'
import Wizard from './Wizard'
import { useConfirm } from './ConfirmDialog'
import { AlertPill } from './ui'
import { COLOR as X, FONT, money } from '../lib/theme'

// =============================================================================
// The guided New Order module. Four steps (five for an admin ordering on a
// store's behalf), each asking only for what's needed, with the Review step
// acting as the double-verification before anything is submitted:
//
//   [0. Store — admin only]  1. Vehicle  2. Customer  3. Packages  4. Review
//
// The draft persists per-tab (close the module, come back, nothing is lost),
// and every existing pricing rule — aliases, store retail, manager discounts
// floored at wholesale, frozen snapshots — carries over exactly.
// =============================================================================

const SIZES = [
  { v: 'standard', label: 'STANDARD' },
  { v: 'fullsize', label: 'FULL SIZE — full-size SUVs & trucks' },
]
const EMPTY_VEH = { year: '', make: '', model: '', trim: '', size: 'standard' }
const EMPTY_CUST = { first: '', last: '', phone: '', email: '', pickup: '' }

export default function OrderWizard({ open, onClose, onCreated, adminMode = false, initialStore = null }) {
  const { profile, isManager } = useAuth()
  const confirm = useConfirm()
  const uid = profile?.id ?? 'anon'
  const canDiscount = isManager || adminMode

  // ---- draft state (per-tab persistent, so a refresh loses nothing) ---------
  const [step, setStep] = usePersistentState(`xpel.${uid}.wiz.step`, 0)
  const [vin, setVin] = usePersistentState(`xpel.${uid}.order.vin`, '')
  const [veh, setVeh] = usePersistentState(`xpel.${uid}.order.veh`, EMPTY_VEH)
  const [decodeNote, setDecodeNote] = usePersistentState(`xpel.${uid}.order.note`, '')
  const [cust, setCust] = usePersistentState(`xpel.${uid}.order.cust`, EMPTY_CUST)
  const [lines, setLines] = usePersistentState(`xpel.${uid}.order.lines`, [])
  const [store, setStore] = usePersistentState(`xpel.${uid}.wiz.store`, null) // {group_id, dealership_id}
  const [notes, setNotes] = usePersistentState(`xpel.${uid}.order.notes`, '')
  // Photos ride along at submit time. Unlike the rest of the draft, File
  // objects can't persist across a page refresh — the step says so plainly.
  const [photos, setPhotos] = useState([])            // [{ file, url }]
  const [photoWarn, setPhotoWarn] = useState('')
  const [uploadNote, setUploadNote] = useState('')

  const [decoding, setDecoding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [placed, setPlaced] = useState(null)

  // ---- catalog (store-scoped for admin) -------------------------------------
  const [catalog, setCatalog] = useState(null)
  const [groups, setGroups] = useState([])
  const [stores, setStores] = useState([])

  useEffect(() => {
    if (open && adminMode && initialStore?.dealership_id) setStore(initialStore)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStore?.dealership_id])

  useEffect(() => {
    if (!open) return
    setErr('')
    if (adminMode) {
      getGroups().then(setGroups).catch((e) => setErr(e.message))
      getDealerships().then(setStores).catch((e) => setErr(e.message))
    }
  }, [open, adminMode])

  useEffect(() => {
    if (!open) return
    setCatalog(null)
    const fetcher = adminMode
      ? (store?.dealership_id ? () => getCatalogFor(store.dealership_id) : null)
      : getCatalog
    if (fetcher) fetcher().then(setCatalog).catch((e) => setErr(e.message))
  }, [open, adminMode, store?.dealership_id])

  // Orderable = active, priced, and not hidden by the store.
  const orderable = useMemo(() => (catalog ?? []).filter((p) => p.priced !== false && !p.hidden), [catalog])
  const byCategory = useMemo(() => {
    const map = new Map()
    for (const p of orderable) {
      const key = p.category || 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    return Array.from(map.entries())
  }, [orderable])

  // ---- vehicle decode -------------------------------------------------------
  async function handleDecode() {
    setDecoding(true); setDecodeNote('')
    const d = await decodeVinFull(vin)
    setVeh({
      year: d.year ? String(d.year) : '',
      make: d.make || '',
      model: d.model || '',
      trim: d.trim || '',
      size: d.size || 'standard',
    })
    setDecoding(false)
    setDecodeNote(d.source === 'nhtsa'
      ? (d.size === 'fullsize'
          ? 'Vehicle decoded — FULL SIZE pre-selected from the body style. Confirm below.'
          : 'Vehicle decoded — STANDARD pre-selected. Confirm or adjust below.')
      : 'Vehicle lookup unavailable — year decoded locally. Enter make, model, trim and size.')
  }

  // ---- line + money logic (identical rules to the old form) -----------------
  const toggleLine = (product) =>
    setLines((ls) => ls.find((l) => l.product.id === product.id)
      ? ls.filter((l) => l.product.id !== product.id)
      : [...ls, { product, quantity: 1 }])
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.product.id !== id))
  const setDisc = (id, patch) =>
    setLines((ls) => ls.map((l) => l.product.id === id
      ? { ...l, disc: { ...(l.disc ?? { mode: '$', value: '' }), ...patch } }
      : l))
  const clearDisc = (id) =>
    setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, disc: null } : l)))

  function linePricing(l) {
    const list = Number(l.product.effective_price)
    const floor = Number(l.product.effective_wholesale ?? l.product.cost ?? 0)
    let requested = list
    if (canDiscount && l.disc && Number(l.disc.value) > 0) {
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
      revenue += pr.charged; wholesale += pr.floor; list += pr.list
    }
    const margin = revenue - wholesale
    return { revenue, wholesale, margin, list, discount: Math.max(0, list - revenue), marginPct: revenue ? Math.round((margin / revenue) * 100) : 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, canDiscount])

  // ---- submit (Review step IS the double-verification) ----------------------
  async function submit() {
    setBusy(true); setErr('')
    try {
      const first = cust.first.trim()
      const last = cust.last.trim()
      const order = await createOrder(profile, {
        lines: lines.map((l) => {
          const pr = linePricing(l)
          return { product_id: l.product.id, quantity: 1, unit_price: pr.charged, list_price: pr.list, unit_cost: l.product.effective_wholesale ?? null }
        }),
        customer_first_name: first,
        customer_last_name: last,
        customer_name: `${first} ${last}`.trim(),
        customer_phone: cust.phone.trim() || null,
        customer_email: cust.email.trim() || null,
        pickup_date: cust.pickup || null,
        vin: vin.trim() || null,
        vehicle_year: veh.year ? Number(veh.year) : null,
        vehicle_make: veh.make.trim() || null,
        vehicle_model: veh.model.trim() || null,
        vehicle_trim: veh.trim.trim() || null,
        vehicle_size: veh.size,
        notes: notes.trim() || null,
        onBehalf: adminMode ? store : null,
      })
      setPhotoWarn('')
      if (photos.length) {
        try {
          await addOrderPhotos(order.id, profile.id, photos.map((p) => p.file),
            (i, n) => setUploadNote(`Uploading photo ${i} of ${n}…`))
        } catch (pe) {
          setPhotoWarn(`The order itself was placed successfully, but the photo upload failed (${pe.message}). Photos can be added to the order any time afterward.`)
        }
        setUploadNote('')
      }
      setPlaced(order)
      // Clear the draft so nothing lingers.
      photos.forEach((p) => URL.revokeObjectURL(p.url))
      setVin(''); setVeh(EMPTY_VEH); setDecodeNote(''); setCust(EMPTY_CUST); setLines([]); setNotes(''); setPhotos([]); setStep(0)
      if (adminMode) setStore(null)
      onCreated?.(order)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function discardDraft() {
    const ok = await confirm({
      title: 'Discard this draft?',
      message: 'Everything entered so far in this order will be cleared.',
      confirmLabel: 'Discard draft', tone: 'danger',
    })
    if (!ok) return
    setVin(''); setVeh(EMPTY_VEH); setDecodeNote(''); setCust(EMPTY_CUST); setLines([]); setNotes('')
    photos.forEach((p) => URL.revokeObjectURL(p.url)); setPhotos([]); setStep(0)
    if (adminMode) setStore(null)
  }

  if (!open) return null

  // ---- success screen -------------------------------------------------------
  if (placed) {
    return (
      <div style={overlay}>
        <div className="x-fade" style={{ ...successCard }}>
          <div style={{ width: 54, height: 54, borderRadius: 999, background: X.green, color: '#FFFFFD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, margin: '0 auto 14px' }}>✓</div>
          <div style={{ fontSize: 19, fontWeight: 800, textAlign: 'center' }}>Order {placed.order_number} submitted</div>
          <div style={{ fontSize: 13.5, color: X.slate, textAlign: 'center', marginTop: 6, lineHeight: 1.5 }}>
            Your installer has been notified. You can track every status change from the orders list — and you'll get an alert here when it moves.
          </div>
          {photoWarn && <AlertPill tone="alert" style={{ marginTop: 12 }}>{photoWarn}</AlertPill>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
            <button onClick={() => { const id = placed.id; setPlaced(null); onClose(id) }} style={trackBtn}>Track this order</button>
            <button onClick={() => setPlaced(null)} style={anotherBtn}>Start another</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- steps ----------------------------------------------------------------
  const storeStep = {
    key: 'store', label: 'Store',
    valid: !!store?.dealership_id,
    render: () => {
      const inGroup = stores.filter((s) => !store?.group_id || s.group_id === store.group_id)
      return (
        <div>
          <StepIntro title="Which store is this order for?" sub="You're placing this order on the store's behalf — it will appear exactly as if the store placed it, priced with their retail." />
          <Field label="Dealer group">
            <select value={store?.group_id ?? ''} onChange={(e) => setStore({ group_id: e.target.value || null, dealership_id: null })} style={input}>
              <option value="">Select a group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="Rooftop">
            <select value={store?.dealership_id ?? ''} disabled={!store?.group_id}
              onChange={(e) => { const d = stores.find((s) => s.id === e.target.value); setStore({ group_id: d?.group_id ?? store?.group_id, dealership_id: e.target.value || null }) }} style={input}>
              <option value="">Select a rooftop…</option>
              {inGroup.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>)}
            </select>
          </Field>
        </div>
      )
    },
  }

  const vehicleStep = {
    key: 'vehicle', label: 'Vehicle',
    valid: !!veh.size,
    render: () => (
      <div>
        <StepIntro title="Start with the vehicle" sub="Scan or type the VIN and the portal fills in the rest — or enter the details by hand." />
        <Field label="VIN (17 characters)">
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="e.g. 5UXCR6C0XL9B12345"
              style={{ ...input, flex: 1, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.04em' }} />
            <button onClick={handleDecode} disabled={!isLikelyVin(vin) || decoding}
              style={{ ...darkBtn, opacity: isLikelyVin(vin) && !decoding ? 1 : 0.5 }}>{decoding ? 'Decoding…' : 'Decode'}</button>
          </div>
        </Field>
        {decodeNote && <div style={{ fontSize: 12.5, color: X.green, margin: '2px 0 6px' }}>{decodeNote}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 8 }}>
          {[['Year', 'year'], ['Make', 'make'], ['Model', 'model'], ['Trim', 'trim']].map(([lbl, k]) => (
            <Field key={k} label={lbl}>
              <input value={veh[k]} onChange={(e) => setVeh({ ...veh, [k]: e.target.value })} style={input} />
            </Field>
          ))}
        </div>
        <Field label="Coverage size">
          <select value={veh.size} onChange={(e) => setVeh({ ...veh, size: e.target.value })} style={input}>
            {SIZES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </Field>
      </div>
    ),
  }

  const customerStep = {
    key: 'customer', label: 'Customer',
    valid: !!(cust.first.trim() && cust.last.trim()),
    render: () => (
      <div>
        <StepIntro title="Who's the customer?" sub="First and last name are all that's required — the rest helps the installer coordinate." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <Field label="First name *"><input value={cust.first} onChange={(e) => setCust({ ...cust, first: e.target.value })} style={input} /></Field>
          <Field label="Last name *"><input value={cust.last} onChange={(e) => setCust({ ...cust, last: e.target.value })} style={input} /></Field>
          <Field label="Phone"><input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} style={input} /></Field>
          <Field label="Email"><input type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} style={input} /></Field>
        </div>
        <Field label="Date vehicle available for pick-up">
          <input type="date" value={cust.pickup} onChange={(e) => setCust({ ...cust, pickup: e.target.value })} style={input} />
        </Field>
      </div>
    ),
  }

  const packagesStep = {
    key: 'packages', label: 'Packages',
    valid: lines.length > 0,
    render: () => (
      <div>
        <StepIntro title="Pick the protection" sub="Tap a package to add it. Full coverage details are shown on every card." />
        {catalog === null && <div style={{ color: X.slate, fontSize: 13.5 }}>Loading this store's packages…</div>}
        {catalog !== null && orderable.length === 0 && (
          <div style={{ color: X.slate, fontSize: 13.5 }}>No orderable packages yet — pricing or program setup is still pending for this store.</div>
        )}
        {byCategory.map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: X.slate, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 8px' }}>{cat}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {items.map((p) => {
                const inCart = lines.find((l) => l.product.id === p.id)
                return (
                  <button key={p.id} onClick={() => toggleLine(p)}
                    style={{ ...pkgCard, ...(inCart ? pkgCardOn : {}) }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 0 }}>{p.name}</span>
                      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{money(p.effective_price)}</span>
                    </div>
                    {p.alias && <div style={{ fontSize: 11, color: X.slate, marginTop: 2 }}>Official: {p.canonical_name}</div>}
                    {p.tier && <div style={{ fontSize: 10.5, color: X.slate, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.tier}</div>}
                    {p.description && <div style={{ fontSize: 12, color: X.slate, marginTop: 6, lineHeight: 1.45 }}>{p.description}</div>}
                    {inCart && <div style={{ marginTop: 8, fontSize: 10.5, fontWeight: 800, color: X.black, background: X.yellow, borderRadius: 999, padding: '3px 10px', display: 'inline-block' }}>ADDED ✓</div>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {lines.length > 0 && canDiscount && (
          <div style={{ marginTop: 6, borderTop: `1px solid ${X.line}`, paddingTop: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: X.slate, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Manager discounts (optional)</div>
            {lines.map((l) => {
              const pr = linePricing(l)
              return (
                <div key={l.product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13.5 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{l.product.name}</span>
                  {l.disc ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {['$', '%'].map((m) => (
                        <button key={m} onClick={() => setDisc(l.product.id, { mode: m })}
                          style={{ ...miniBtn, ...(l.disc.mode === m ? miniBtnOn : {}) }}>{m}</button>
                      ))}
                      <input type="number" min="0" value={l.disc.value}
                        onChange={(e) => setDisc(l.product.id, { value: e.target.value })}
                        placeholder="0" style={miniInput} />
                      <button onClick={() => clearDisc(l.product.id)} style={xBtnSm} title="Remove discount">×</button>
                    </span>
                  ) : (
                    <button onClick={() => setDisc(l.product.id, { mode: '$', value: '' })} style={discBtn}>Discount</button>
                  )}
                  <span style={{ width: 110, textAlign: 'right', fontWeight: pr.charged < pr.list ? 700 : 500 }}>
                    {pr.charged < pr.list && <s style={{ color: X.slate, fontWeight: 400, fontSize: 12, marginRight: 5 }}>{money(pr.list)}</s>}
                    {money(pr.charged)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    ),
  }

  const photosStep = {
    key: 'photos', label: 'Photos & Notes',
    valid: true,
    render: () => (
      <div>
        <StepIntro title="Anything the installer should see?" sub="Both parts are optional — photos of the vehicle or specific areas, and any notes about this job." />
        <Field label="Photos (up to 6)">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {photos.map((ph, i) => (
              <span key={ph.url} style={{ position: 'relative' }}>
                <img src={ph.url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: `1px solid ${X.gray}`, display: 'block' }} />
                <button onClick={() => setPhotos((ps) => { URL.revokeObjectURL(ph.url); return ps.filter((_, j) => j !== i) })}
                  style={photoX} title="Remove photo">×</button>
              </span>
            ))}
            {photos.length < 6 && (
              <label style={photoAdd}>
                + Add
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []).map((f) => ({ file: f, url: URL.createObjectURL(f) }))
                    setPhotos((ps) => [...ps, ...fs].slice(0, 6))
                    e.target.value = ''
                  }} />
              </label>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: X.slate, marginTop: 6 }}>
            Photos are sent when you submit. (Unlike the rest of your draft, they don’t survive a page refresh.)
          </div>
        </Field>
        <Field label="Notes for the installer">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={2000}
            placeholder="e.g. Customer is sensitive about the hood edge — please double-check alignment."
            style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
        </Field>
      </div>
    ),
  }

  const reviewStep = {
    key: 'review', label: 'Review & Confirm',
    valid: true,
    render: () => (
      <div>
        <StepIntro title="One last look" sub="Confirm everything below — submitting freezes these prices onto the order permanently." />
        {adminMode && store?.dealership_id && (
          <ReviewBlock label="Ordering on behalf of">
            {stores.find((s) => s.id === store.dealership_id)?.name ?? 'Store'}
          </ReviewBlock>
        )}
        <ReviewBlock label="Vehicle">
          {[veh.year, veh.make, veh.model, veh.trim].filter(Boolean).join(' ') || '—'}
          <span style={{ color: X.slate }}> · {SIZES.find((s) => s.v === veh.size)?.label?.split(' — ')[0] ?? veh.size}</span>
          {vin.trim() && <div style={{ fontSize: 12, color: X.slate, marginTop: 2, fontFamily: 'ui-monospace, Menlo, monospace' }}>{vin.trim()}</div>}
        </ReviewBlock>
        <ReviewBlock label="Customer">
          {`${cust.first} ${cust.last}`.trim() || '—'}
          {(cust.phone || cust.email) && <div style={{ fontSize: 12, color: X.slate, marginTop: 2 }}>{[cust.phone, cust.email].filter(Boolean).join(' · ')}</div>}
          {cust.pickup && <div style={{ fontSize: 12, color: X.slate, marginTop: 2 }}>Available for pick-up {cust.pickup}</div>}
        </ReviewBlock>
        <ReviewBlock label={`Packages (${lines.length})`}>
          {lines.map((l) => {
            const pr = linePricing(l)
            const discounted = pr.charged < pr.list
            return (
              <div key={l.product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px dashed ${X.line}`, fontSize: 13.5 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{l.product.name}</span>
                {discounted && <s style={{ color: X.slate, fontSize: 12 }}>{money(pr.list)}</s>}
                <span style={{ fontWeight: 700, width: 92, textAlign: 'right' }}>{money(pr.charged)}</span>
                <button onClick={() => removeLine(l.product.id)} style={xBtnSm} title="Remove">×</button>
              </div>
            )
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: 15, fontWeight: 800 }}>
            <span>Total</span><span>{money(totals.revenue)}</span>
          </div>
          {totals.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: X.slate, marginTop: 2 }}>
              <span>Discounts off list</span><span>−{money(totals.discount)}</span>
            </div>
          )}
          {canDiscount && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: X.green, marginTop: 2, fontWeight: 700 }}>
              <span>Store margin</span><span>{money(totals.margin)} · {totals.marginPct}%</span>
            </div>
          )}
        </ReviewBlock>
        {(photos.length > 0 || notes.trim()) && (
          <ReviewBlock label="For the installer">
            {photos.length > 0 && <div style={{ fontSize: 13 }}>{photos.length} photo{photos.length === 1 ? '' : 's'} attached</div>}
            {notes.trim() && <div style={{ fontSize: 13, color: X.slate, marginTop: 2, whiteSpace: 'pre-wrap' }}>{notes.trim()}</div>}
          </ReviewBlock>
        )}
        {err && <div style={{ color: X.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
      </div>
    ),
  }

  const steps = adminMode
    ? [storeStep, vehicleStep, customerStep, packagesStep, photosStep, reviewStep]
    : [vehicleStep, customerStep, packagesStep, photosStep, reviewStep]
  const boundedStep = Math.min(step, steps.length - 1)

  return (
    <Wizard
      title={adminMode ? 'New Order — on a store’s behalf' : 'New Order'}
      subtitle="Your draft saves automatically at every step."
      steps={steps} step={boundedStep} onStep={setStep}
      onClose={() => onClose()}
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={discardDraft} style={discardBtn}>Discard draft</button>
          <button onClick={submit} disabled={busy || lines.length === 0}
            style={{ ...submitBtn, opacity: busy || lines.length === 0 ? 0.5 : 1 }}>
            {busy ? (uploadNote || 'Submitting…') : `Submit order · ${money(totals.revenue)}`}
          </button>
        </div>
      }
    />
  )
}

const StepIntro = ({ title, sub }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
    <div style={{ fontSize: 12.5, color: X.slate, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
  </div>
)
const Field = ({ label, children }) => (
  <label style={{ display: 'block', marginTop: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: X.slate, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
    {children}
  </label>
)
const ReviewBlock = ({ label, children }) => (
  <div style={{ border: `1px solid ${X.line}`, borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 800, color: X.slate, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 14 }}>{children}</div>
  </div>
)

const overlay = { position: 'fixed', inset: 0, background: 'rgba(20,18,19,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const successCard = { background: '#FFFFFD', borderRadius: 18, padding: '30px 30px 26px', width: 'min(440px, 100%)', boxShadow: '0 18px 50px rgba(20,18,19,0.3)', fontFamily: FONT.body }
const input = { width: '100%', boxSizing: 'border-box', border: `1.5px solid ${X.gray}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: FONT.body, outline: 'none', background: '#FFFFFD' }
const darkBtn = { background: X.black, color: X.white, border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: FONT.body }
const pkgCard = { textAlign: 'left', background: '#FFFFFD', border: `1.5px solid ${X.gray}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontFamily: FONT.body, transition: 'border-color .15s ease, background .15s ease' }
const pkgCardOn = { borderColor: X.yellow, background: '#FFF7E0' }
const discBtn = { background: 'transparent', color: X.slate, border: `1px dashed ${X.gray}`, borderRadius: 8, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT.body }
const miniBtn = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 7, padding: '3px 8px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: FONT.body }
const miniBtnOn = { background: X.black, color: X.white, borderColor: X.black }
const miniInput = { width: 64, border: `1px solid ${X.gray}`, borderRadius: 7, padding: '4px 8px', fontSize: 12.5, fontFamily: FONT.body, outline: 'none' }
const xBtnSm = { background: 'transparent', border: 'none', color: X.slate, fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }
const photoX = { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: 'none', background: X.black, color: X.white, fontSize: 12, cursor: 'pointer', lineHeight: 1 }
const photoAdd = { width: 72, height: 72, borderRadius: 10, border: `1.5px dashed ${X.gray}`, background: '#FBFAF7', color: X.slate, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT.body, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }
const discardBtn = { background: 'transparent', color: X.red, border: `1px solid ${X.red}`, borderRadius: 10, padding: '11px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
const submitBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '11px 22px', fontWeight: 800, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: FONT.body }
const trackBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '11px 20px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', fontFamily: FONT.body }
const anotherBtn = { background: 'transparent', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '11px 18px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: FONT.body }
