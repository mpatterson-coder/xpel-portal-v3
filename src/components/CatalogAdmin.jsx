import { useEffect, useMemo, useState } from 'react'
import { getAllProducts, createProduct, updateProduct } from '../lib/adminDb'
import { getAuthorizedDealers } from '../lib/db'
import { COLOR as X, FONT, CARD, money } from '../lib/theme'
import ProgramsAdmin from './ProgramsAdmin'

// Full-autonomy catalog management. EVERY field of every offering is editable
// in-app: name, category (free text — creates new order-form sections
// automatically), tier, coverage description, list price, cost, and
// active/retired status. Nothing is stock or locked.
export default function CatalogAdmin() {
  const [products, setProducts] = useState([])
  const [installers, setInstallers] = useState([])
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState(null)

  const load = () =>
    Promise.all([getAllProducts(), getAuthorizedDealers()])
      .then(([p, ad]) => { setProducts(p); setInstallers(ad) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: FONT.headingWeight }}>Catalog &amp; Programs</h3>
        <button style={btnPrimary} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Add Offering'}</button>
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}

      {adding && <ProductEditor categories={categories} onSave={async (f) => { await createProduct(f); setAdding(false); load() }} onError={setErr} isNew />}

      <div style={panel}>
        {products.map((p) => (
          <div key={p.id} style={{ borderTop: `1px solid ${X.line}` }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 4px', opacity: p.active ? 1 : 0.45, cursor: 'pointer' }}
                 onClick={() => setOpenId(openId === p.id ? null : p.id)}>
              <div style={{ flex: 2, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: X.slate }}>
                  {p.category}{p.tier ? ` · ${p.tier}` : ''} · {p.sku}
                  {p.authorized_dealer_id
                    ? <span style={{ color: '#8A6100', fontWeight: 700 }}> · by {installers.find((d) => d.id === p.authorized_dealer_id)?.name ?? 'installer'}</span>
                    : ' · XPEL house'}
                </div>
              </div>
              <div style={{ width: 90, textAlign: 'right', fontWeight: 700 }}>
                {p.unit_price != null
                  ? money(p.unit_price)
                  : <span style={{ fontSize: 10, fontWeight: 800, color: '#8A6100', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unpriced</span>}
              </div>
              <div style={{ width: 70, textAlign: 'right', color: X.green, fontSize: 13 }}>
                {p.unit_price != null
                  ? `${Number(p.unit_price) ? Math.round(((p.unit_price - p.cost) / p.unit_price) * 100) : 0}%`
                  : '—'}
              </div>
              <span style={{ ...badge, background: p.active ? X.green : X.gray, color: p.active ? '#fff' : X.slate }}>
                {p.active ? 'Active' : 'Retired'}
              </span>
              <span style={{ color: X.slate, fontSize: 12 }}>{openId === p.id ? '▲' : '▼'}</span>
            </div>
            {openId === p.id && (
              <ProductEditor
                product={p} categories={categories}
                onSave={async (f) => { await updateProduct(p.id, f); setOpenId(null); load() }}
                onToggleActive={async () => { await updateProduct(p.id, { active: !p.active }); load() }}
                onError={setErr}
              />
            )}
          </div>
        ))}
      </div>

      <ProgramsAdmin products={products} />
    </div>
  )
}

function ProductEditor({ product, categories, onSave, onToggleActive, onError, isNew }) {
  const [f, setF] = useState({
    sku: product?.sku || '',
    name: product?.name || '',
    category: product?.category || '',
    tier: product?.tier || '',
    description: product?.description || '',
    unit_price: product?.unit_price != null ? String(product.unit_price) : '',
    cost: product ? String(product.cost) : '',
  })
  const [busy, setBusy] = useState(false)
  // Edits may leave list price BLANK = unpriced (hidden from ordering until a store or XPEL prices it).
  const ready = f.name.trim() && f.category.trim() && (isNew ? f.sku.trim() && f.unit_price !== '' : true)

  async function save() {
    setBusy(true)
    try {
      const patch = {
        name: f.name.trim(), category: f.category.trim(), tier: f.tier.trim() || null,
        description: f.description.trim() || null,
        unit_price: f.unit_price === '' ? null : Number(f.unit_price), cost: Number(f.cost || 0),
      }
      if (isNew) patch.sku = f.sku.trim()
      await onSave(patch)
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="x-fade" style={{ background: '#FFFDF5', border: '1px solid rgba(253,181,33,0.6)', borderRadius: 14, padding: 16, margin: '4px 0 12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <Field label="SKU">
          <input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} style={input} disabled={!isNew} placeholder="Unique code, e.g. PPF-UP-FF" />
        </Field>
        <Field label="Offering name">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={input} placeholder="e.g. ULTIMATE PLUS — Full Front" />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
        <Field label="Category / product type (free text — new types create new sections)">
          <input list="cat-suggestions" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={input} placeholder="e.g. Paint Protection Film" />
          <datalist id="cat-suggestions">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Tier / line (optional)">
          <input value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} style={input} placeholder="e.g. Ultimate Plus" />
        </Field>
        <Field label="List price (blank = unpriced / hidden)">
          <input type="number" value={f.unit_price} onChange={(e) => setF({ ...f, unit_price: e.target.value })} style={input} />
        </Field>
        <Field label="Cost (for margin)">
          <input type="number" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} style={input} />
        </Field>
      </div>
      <div style={{ marginTop: 8 }}>
        <Field label="Coverage / description (shown to dealers on the order screen)">
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} style={{ ...input, resize: 'vertical' }}
            placeholder="e.g. Covers the entire hood & fenders, painted front bumper, and backs of painted mirrors" />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={{ ...btnPrimary, opacity: ready && !busy ? 1 : 0.5 }} disabled={!ready || busy} onClick={save}>
          {isNew ? 'Add Offering' : 'Save Changes'}
        </button>
        {!isNew && (
          <button style={btnGhost} onClick={onToggleActive}>
            {product.active ? 'Retire (hide from dealers)' : 'Reactivate'}
          </button>
        )}
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 10.5, color: X.slate, marginBottom: 4 }}>{label}</div>
    {children}
  </div>
)

const panel = { ...CARD, padding: 18, fontFamily: FONT.body }
const input = { width: '100%', boxSizing: 'border-box', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 11px', fontSize: 14, fontFamily: FONT.body, background: '#FFFFFD' }
const badge = { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: 700, borderRadius: 999, padding: '4px 10px' }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, cursor: 'pointer', fontFamily: FONT.body }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
