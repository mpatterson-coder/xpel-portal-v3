import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from './ConfirmDialog'
import { getOrderDetail , updateOrderStatus } from '../lib/db'
import { COLOR as X, FONT, CARD, STATUS_TONE, money, dateUS } from '../lib/theme'
import StatusTimeline from './StatusTimeline'

// Orders with a tap-to-expand detail: the full step-by-step status tracker,
// every package on the order (shown under the STORE's display names, with any
// discount visible), and the complete status history. Collapsed rows keep the
// compact progress bar for at-a-glance scanning. RLS already guarantees the
// user only receives orders they're allowed to see.
export default function OrdersList({ orders, title = 'Orders', focus = null, onChanged = null }) {
  return (
    <div style={{ ...CARD, padding: 24 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: FONT.headingWeight }}>{title}</h2>
      {(!orders || orders.length === 0) && <div style={{ color: X.slate, fontSize: 14 }}>No orders yet.</div>}
      {orders?.map((o) => <OrderRow key={o.id} order={o} focus={focus} onChanged={onChanged} />)}
    </div>
  )
}

function OrderRow({ order: o, focus, onChanged }) {
  const { role } = useAuth()
  const confirm = useConfirm()
  const [cancelBusy, setCancelBusy] = useState(false)
  const cancellable = (role === 'dealership' && ['submitted', 'in_review'].includes(o.status))
    || (role === 'admin' && !['completed', 'cancelled'].includes(o.status))

  async function cancelOrder() {
    const ok = await confirm({
      title: `Cancel order ${o.order_number}?`,
      message: role === 'admin'
        ? 'You are cancelling this order on the store\u2019s behalf. The store and installer will see it as cancelled.'
        : 'Your installer will see this order as cancelled. This can\u2019t be undone from here.',
      summary: [
        ['Order', o.order_number],
        ['Customer', o.customer_name || '\u2014'],
        ['Status now', (o.status || '').replace('_', ' ')],
        ['After', 'cancelled'],
      ],
      confirmLabel: 'Cancel order', tone: 'danger',
    })
    if (!ok) return
    setCancelBusy(true)
    try { await updateOrderStatus(o.id, 'cancelled'); onChanged?.() }
    catch (e) { alert(e.message) }
    finally { setCancelBusy(false) }
  }
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const rowRef = useRef(null)

  // Opening (by click or by a Performance drill-down jump) loads the detail.
  useEffect(() => {
    if (open && !detail) {
      getOrderDetail(o.id)
        .then(setDetail)
        .catch((e) => setDetail({ error: e.message }))
    }
  }, [open, detail, o.id])

  // A drill-down "View order" jump lands here: expand and scroll into view.
  useEffect(() => {
    if (focus?.id === o.id) {
      setOpen(true)
      setTimeout(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    }
  }, [focus, o.id])

  const toggle = () => setOpen((v) => !v)

  const items = detail && !detail.error ? detail.items : []
  const discountTotal = items.reduce(
    (s, it) => s + Math.max(0, Number(it.list_price ?? it.unit_price) - Number(it.unit_price)) * it.quantity, 0)

  return (
    <div ref={rowRef} style={{ padding: '10px 0', borderTop: `1px solid ${X.line}` }}>
      <div onClick={toggle} title={open ? 'Hide details' : 'Show full status & details'}
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <div style={{ fontFamily: FONT.body, fontSize: 12, color: X.slate, width: 96 }}>{o.order_number}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{o.customer_name || '—'}</div>
          <div style={{ fontSize: 12, color: X.slate }}>
            {[o.vehicle_year, o.vehicle_make, o.vehicle_model, o.vehicle_trim].filter(Boolean).join(' ') || 'Vehicle not entered'}
            {o.vehicle_size ? ` · ${o.vehicle_size}` : ''}
            {o.pickup_date ? ` · Avail ${dateUS(o.pickup_date)}` : ''}
          </div>
        </div>
        <div style={{ width: 90, textAlign: 'right', fontWeight: 700 }}>{money(o.total_amount)}</div>
        <Badge status={o.status} />
        <span aria-hidden="true" style={{ color: X.slate, fontSize: 12, width: 12, textAlign: 'center' }}>{open ? '▾' : '▸'}</span>
      </div>

      {!open && <StatusTimeline status={o.status} compact style={{ marginTop: 8 }} />}

      {open && (
        <div className="x-fade" style={{ marginTop: 10, padding: '16px 16px 14px', background: '#F7F5EF', borderRadius: 12 }}>
          <StatusTimeline status={o.status} style={{ margin: '2px 0 16px' }} />

          {!detail && <div style={{ color: X.slate, fontSize: 13 }}>Loading details…</div>}
          {detail?.error && <div style={{ color: X.red, fontSize: 13 }}>{detail.error}</div>}

          {detail && !detail.error && (
            <>
              <div style={secLbl}>Coverage</div>
              {items.map((it) => {
                const name = detail.aliases?.[it.product_id] ?? it.product?.name ?? 'Package'
                const list = Number(it.list_price ?? it.unit_price)
                const charged = Number(it.unit_price)
                const discounted = list > charged
                return (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, padding: '3px 0' }}>
                    <span style={{ minWidth: 0 }}>{it.quantity} × {name}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {discounted && <s style={{ color: X.slate, fontSize: 12, marginRight: 6, fontWeight: 400 }}>{money(list * it.quantity)}</s>}
                      <span style={{ fontWeight: discounted ? 700 : 400 }}>{money(charged * it.quantity)}</span>
                    </span>
                  </div>
                )
              })}
              {discountTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: X.slate, marginTop: 4 }}>
                  <span>Discounts applied</span><span>−{money(discountTotal)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14.5, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${X.line}` }}>
                <span>Total</span><span>{money(o.total_amount)}</span>
              </div>

              {detail.history?.length > 0 && (
                <>
                  <div style={{ ...secLbl, marginTop: 14 }}>History</div>
                  {detail.history.map((h) => (
                    <div key={h.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: X.slate, padding: '2px 0' }}>
                      <span style={{ width: 148, flexShrink: 0 }}>
                        {dateUS(h.created_at)} · {new Date(h.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span style={{ color: X.black, fontWeight: 600, textTransform: 'capitalize' }}>{(h.status || '').replace('_', ' ')}</span>
                    </div>
                  ))}
                </>
              )}
              {cancellable && (
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px dashed ${X.line}`, textAlign: 'right' }}>
                  <button onClick={cancelOrder} disabled={cancelBusy}
                    style={{ background: 'transparent', color: X.red, border: `1px solid ${X.red}`, borderRadius: 9, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body, opacity: cancelBusy ? 0.5 : 1 }}>
                    {cancelBusy ? 'Cancelling…' : 'Cancel this order'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Badge({ status }) {
  const t = STATUS_TONE[status] || STATUS_TONE.submitted
  return (
    <span style={{
      fontFamily: FONT.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
      color: t.fg, background: t.bg,
      borderRadius: 999, padding: '4px 11px', width: 96, textAlign: 'center', fontWeight: 700,
    }}>{(status || '').replace('_', ' ')}</span>
  )
}

const secLbl = { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1, color: X.slate, fontWeight: 700, marginBottom: 5 }
