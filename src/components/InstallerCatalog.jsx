import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAllProducts, createProduct, updateProduct, deleteProduct } from '../lib/adminDb'
import { COLOR as X, FONT, CARD, money } from '../lib/theme'

// =============================================================================
// My Packages — the shop's own product line. Installers create packages with
// THEIR wholesale; packages are private to this shop (XPEL admin sees and can
// edit everything), usable in the shop's programs immediately, and appear on a
// store's order screen only once that store (or XPEL) sets a retail price.
// =============================================================================
export default function InstallerCatalog() {
  const { dealerId } = useAuth()
  const [products, setProducts] = useState(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState(null)

  const load = () => getAllProducts().then(setProducts).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const mine = useMemo(() => (products ?? []).filter((p) => p.authorized_dealer_id === dealerId), [products, dealerId])
  const categories = useMemo(() => [...new Set((products ?? []).map((p) => p.category).filter(Boolean))], [products])

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: FONT.headingWeight }}>My Packages</h2>
        <button style={btnPrimary} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ New Package'}</button>
      </div>
      <div style={{ fontSize: 13, color: X.slate, marginBottom: 12, maxWidth: 700, lineHeight: 1.5 }}>
        Your shop's own product line, with <b>your wholesale</b> on each package. Packages are private
        to your shop, ready to add to your programs right away (Programs tab), and show up on a store's
        order screen once that store (or XPEL) sets a retail price. XPEL house packages stay available
        in the Programs picker alongside these.
      </div>
      {err && <div style={{ color: X.red, marginBottom: 8, fontSize: 13 }}>{err}</div>}

      {adding && (
        <PackageEditor categories={categories} isNew dealerId={dealerId}
          onSave={async (f) => { await createProduct(f); setAdding(false); load() }} onError={setErr} />
      )}

      <div style={{ ...CARD, padding: 18 }}>
        {products === null && <div style={{ color: X.slate, fontSize: 14 }}>Loading…</div>}
        {products !== null && mine.length === 0 && (
          <div style={{ color: X.slate, fontSize: 14 }}>No packages yet — create your first one above.</div>
        )}
        {mine.map((p) => (
          <div key={p.id} style={{ borderTop: `1px solid ${X.line}` }}>
            <div onClick={() => setOpenId(openId === p.id ? null : p.id)}
              style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 4px', opacity: p.active ? 1 : 0.45, cursor: 'pointer' }}>
              <div style={{ flex: 2, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: X.slate }}>{p.category}{p.tier ? ` · ${p.tier}` : ''} · {p.sku}</div>
              </div>
              <div style={{ width: 110, textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{money(Number(p.cost || 0))}</div>
                <div style={{ fontSize: 10.5, color: X.slate }}>your wholesale</div>
              </div>
              <span style={{ ...pill, background: p.active ? X.green : X.gray, color: p.active ? '#fff' : X.slate }}>
                {p.active ? 'Active' : 'Retired'}
              </span>
              <span style={{ color: X.slate, fontSize: 12 }}>{openId === p.id ? '▲' : '▼'}</span>
            </div>
            {openId === p.id && (
              <PackageEditor product={p} categories={categories} dealerId={dealerId}
                onSave={async (f) => { await updateProduct(p.id, f); setOpenId(null); load() }}
                onToggleActive={async () => { await updateProduct(p.id, { active: !p.active }); load() }}
                onDelete={async () => {
                  if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return
                  try { await deleteProduct(p.id); setOpenId(null); load() }
                  catch {
                    setErr(`"${p.name}" has been used on orders, so it can't be deleted — retire it instead (history stays intact).`)
                  }
                }}
                onError={setErr} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function PackageEditor({ product, categories, isNew, dealerId, onSave, onToggleActive, onDelete, onError }) {
  const suggestedSku = useMemo(() => `SHOP-${Date.now().toString(36).toUpperCase()}`, [])
  const [f, setF] = useState({
    sku: product?.sku || suggestedSku,
    name: product?.name || '',
    category: product?.category || '',
    tier: product?.tier || '',
    description: product?.description || '',
    cost: product?.cost != null ? String(product.cost) : '',
  })
  const [busy, setBusy] = useState(false)
  const ready = f.name.trim() && f.category.trim() && f.cost !== '' && f.sku.trim()

  async function save() {
    setBusy(true)
    try {
      const patch = {
        name: f.name.trim(),
        category: f.category.trim(),
        tier: f.tier.trim() || null,
        description: f.description.trim() || null,
        cost: Number(f.cost || 0),
      }
      if (isNew) {
        patch.sku = f.sku.trim()
        patch.unit_price = null               // unpriced until a store (or XPEL) sets retail
        patch.authorized_dealer_id = dealerId // owned by this shop
      }
      await onSave(patch)
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="x-fade" style={{ background: '#FFFDF5', border: '1px solid rgba(253,181,33,0.6)', borderRadius: 14, padding: 16, margin: '4px 0 12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <Field label="Part # / SKU (unique)">
          <input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} style={input} disabled={!isNew} />
        </Field>
        <Field label="Package name">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={input} placeholder="e.g. STEALTH — Full Body (satin)" />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
        <Field label="Category (free text — new sections appear automatically)">
          <input list="inst-cat-suggestions" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={input} placeholder="e.g. Paint Protection Film" />
          <datalist id="inst-cat-suggestions">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Tier / line (optional)">
          <input value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} style={input} placeholder="e.g. Stealth" />
        </Field>
        <Field label="Your wholesale (billed to the store)">
          <input type="number" min="0" step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} style={input} />
        </Field>
      </div>
      <div style={{ marginTop: 8 }}>
        <Field label="Coverage / description (shown on the store's order screen)">
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} style={{ ...input, resize: 'vertical' }}
            placeholder="e.g. Full-body satin PPF: every painted panel, mirrors, and door edges" />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button style={{ ...btnPrimary, opacity: ready && !busy ? 1 : 0.5 }} disabled={!ready || busy} onClick={save}>
          {isNew ? 'Create Package' : 'Save Changes'}
        </button>
        {!isNew && (
          <button style={btnGhost} onClick={onToggleActive}>
            {product.active ? 'Retire (hide from stores)' : 'Reactivate'}
          </button>
        )}
        {!isNew && (
          <button style={{ ...btnGhost, color: X.red, borderColor: 'rgba(125,20,25,0.4)' }} onClick={onDelete}>Delete</button>
        )}
      </div>
      {isNew && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: X.slate }}>
          No retail field here on purpose — each store sets its own retail (Packages &amp; Pricing),
          and the package stays hidden from their order screen until they do.
        </div>
      )}
    </div>
  )
}

const Field = ({ label, children }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 10.5, color: X.slate, marginBottom: 4, fontFamily: FONT.body }}>{label}</div>
    {children}
  </label>
)

const input = { width: '100%', boxSizing: 'border-box', background: '#FFFFFD', border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 11px', fontSize: 13.5, fontFamily: FONT.body }
const btnPrimary = { background: X.yellow, color: X.black, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body }
const btnGhost = { background: '#FFFFFD', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body }
const pill = { fontFamily: FONT.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderRadius: 999, padding: '4px 11px', fontWeight: 700 }
