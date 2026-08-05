import { useEffect, useMemo, useRef, useState } from 'react'
import { getUnreadState, getDealerships, getOrders, getNotificationState, markNotificationsRead, markAllNotificationsRead } from '../lib/db'
import { navigate } from '../lib/bus'
import { COLOR as X, FONT, CARD } from '../lib/theme'

// =============================================================================
// The always-pinned bell in the command bar — every role, every screen.
// Shows the combined unread count even when it's zero, and opens a two-section
// inbox that keeps MESSAGE alerts visually distinct from ORDER/NETWORK
// notifications:
//   • Messages   — yellow accent, from the chat system (dealership/installer)
//   • Updates    — order status (dealership), new orders (installer),
//                  network activity (admin)
// Clicking a line marks it read and jumps straight to the right screen.
// =============================================================================
export default function NotificationBell({ profile, role }) {
  const [open, setOpen] = useState(false)
  const [unreadMsgs, setUnreadMsgs] = useState({ counts: new Map(), total: 0 })
  const [notifs, setNotifs] = useState({ items: [], unread: 0 })
  const [stores, setStores] = useState([])
  const [orders, setOrders] = useState([])
  const wrapRef = useRef(null)

  const chatEnabled = role !== 'admin' // XPEL admin is excluded from chat by design

  const refresh = () => {
    if (!profile?.id) return
    if (chatEnabled) getUnreadState(profile.id).then(setUnreadMsgs).catch(() => {})
    getNotificationState().then(setNotifs).catch(() => {})
  }
  useEffect(() => {
    refresh()
    getDealerships().then(setStores).catch(() => {})
    getOrders().then(setOrders).catch(() => {})
    const t = setInterval(refresh, 25000)
    const onFocus = () => { if (!document.hidden) refresh() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const storeName = (id) => stores.find((s) => s.id === id)?.name ?? 'Store'
  const orderNum = (id) => orders.find((o) => o.id === id)?.order_number ?? null

  // Message lines from the chat unread map: key = `${dealership_id}|${order_id ?? 'general'}`
  const messageLines = useMemo(() => {
    if (!chatEnabled) return []
    return [...unreadMsgs.counts.entries()]
      .filter(([, n]) => n > 0)
      .map(([key, n]) => {
        const [dealershipId, orderPart] = key.split('|')
        const orderId = orderPart === 'general' ? null : orderPart
        return {
          key, dealershipId, orderId, n,
          title: role === 'installer'
            ? `${storeName(dealershipId)} — ${orderId ? (orderNum(orderId) ?? 'an order') : 'General'}`
            : `Your installer — ${orderId ? (orderNum(orderId) ?? 'an order') : 'General'}`,
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadMsgs, stores, orders, chatEnabled, role])

  const total = (chatEnabled ? unreadMsgs.total : 0) + notifs.unread

  const openMessage = (line) => {
    setOpen(false)
    navigate({ view: 'messages', channel: { dealership_id: line.dealershipId, order_id: line.orderId } })
  }
  const openNotif = async (n) => {
    setOpen(false)
    if (!n.read_at) {
      markNotificationsRead([n.id]).catch(() => {})
      setNotifs((s) => ({ unread: Math.max(0, s.unread - 1), items: s.items.map((i) => i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i) }))
    }
    if (n.order_id) navigate({ view: 'order', orderId: n.order_id })
  }
  const allRead = () => {
    markAllNotificationsRead().catch(() => {})
    setNotifs((s) => ({ unread: 0, items: s.items.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })) }))
  }

  const kindTone = (k) => k === 'order_new' ? { bar: X.yellow, tag: 'NEW ORDER' }
    : k === 'order_status' ? { bar: X.green, tag: 'STATUS' }
    : { bar: X.slate, tag: 'NETWORK' }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} title="Notifications & messages" style={bellBtn}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3c-3.3 0-6 2.7-6 6v3.6l-1.6 3A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.4L18 12.6V9c0-3.3-2.7-6-6-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9.7 19.5a2.4 2.4 0 0 0 4.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span style={{ ...countPill, background: total > 0 ? X.yellow : 'rgba(255,255,253,0.14)', color: total > 0 ? X.black : 'rgba(255,255,253,0.75)' }}>
          {total > 99 ? '99+' : total}
        </span>
      </button>

      {open && (
        <div className="x-fade" style={{ ...CARD, position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 'min(400px, 92vw)', maxHeight: '70vh', overflowY: 'auto', padding: 0, zIndex: 110, boxShadow: '0 18px 50px rgba(20,18,19,0.28)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${X.line}` }}>
            <span style={{ fontWeight: 800, fontSize: 14 }}>Inbox</span>
            {notifs.unread > 0 && <button onClick={allRead} style={linkBtn}>Mark all read</button>}
          </div>

          {chatEnabled && (
            <>
              <SectionLabel color={X.yellow}>Messages{unreadMsgs.total > 0 ? ` · ${unreadMsgs.total} unread` : ''}</SectionLabel>
              {messageLines.length === 0 && <Empty>No unread messages.</Empty>}
              {messageLines.map((l) => (
                <Row key={l.key} bar={X.yellow} onClick={() => openMessage(l)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color={X.yellow} dark>MESSAGE</Tag>
                    <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                    <span style={msgCount}>{l.n}</span>
                  </div>
                  <div style={rowSub}>Tap to open the conversation</div>
                </Row>
              ))}
            </>
          )}

          <SectionLabel color={X.slate}>{role === 'admin' ? 'Network activity' : 'Order updates'}{notifs.unread > 0 ? ` · ${notifs.unread} unread` : ''}</SectionLabel>
          {notifs.items.length === 0 && <Empty>Nothing yet — you're all caught up.</Empty>}
          {notifs.items.map((n) => {
            const t = kindTone(n.kind)
            return (
              <Row key={n.id} bar={t.bar} dim={!!n.read_at} onClick={() => openNotif(n)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color={t.bar}>{t.tag}</Tag>
                  <span style={{ fontWeight: n.read_at ? 500 : 700, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                </div>
                <div style={rowSub}>{n.body || new Date(n.created_at).toLocaleString()}</div>
              </Row>
            )
          })}
        </div>
      )}
    </div>
  )
}

const SectionLabel = ({ children, color }) => (
  <div style={{ padding: '10px 16px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>{children}</div>
)
const Row = ({ children, bar, dim, onClick }) => (
  <div onClick={onClick}
    onMouseEnter={(e) => { e.currentTarget.style.background = X.bg }}
    onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
    style={{ padding: '9px 16px 9px 13px', borderLeft: `3px solid ${bar}`, cursor: 'pointer', opacity: dim ? 0.55 : 1, borderBottom: `1px solid ${X.line}` }}>
    {children}
  </div>
)
const Tag = ({ children, color, dark }) => (
  <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.07em', background: color, color: dark ? X.black : X.white, borderRadius: 4, padding: '2.5px 6px', flexShrink: 0 }}>{children}</span>
)
const Empty = ({ children }) => <div style={{ padding: '8px 16px 12px', fontSize: 12.5, color: X.slate }}>{children}</div>

const bellBtn = { position: 'relative', display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', color: 'rgba(255,255,253,0.85)', border: '1px solid rgba(255,255,253,0.22)', borderRadius: 999, padding: '7px 12px', cursor: 'pointer', fontFamily: FONT.body }
const countPill = { minWidth: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, padding: '0 6px' }
const msgCount = { background: X.yellow, color: X.black, borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, padding: '0 5px', flexShrink: 0 }
const linkBtn = { background: 'transparent', border: 'none', color: X.slate, fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontFamily: FONT.body }
const rowSub = { fontSize: 11.5, color: X.slate, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
