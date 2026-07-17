import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDealerships, getAuthorizedDealers, getOrders, getMessages, sendMessage, markChannelRead, getUnreadState } from '../lib/db'
import { COLOR as X, FONT, CARD } from '../lib/theme'
import { Spinner } from './ui'

// =============================================================================
// Messages — private store <-> installer chat, both kinds of channels:
//   • General: one ongoing conversation per store/shop relationship
//   • Order threads: a conversation attached to a specific order
// A light poll (20s in the open panel, 30s for badges) keeps things fresh
// without websockets; opening a channel marks it read. XPEL admin is locked
// out at the database layer — these conversations belong to the two parties.
// =============================================================================
export default function MessagesHub({ mode, unread: unreadProp, onRead }) {
  const { profile, dealerId } = useAuth()
  const [stores, setStores] = useState(null)
  const [dealers, setDealers] = useState([])
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)
  const [unreadLocal, setUnreadLocal] = useState({ counts: new Map(), total: 0 })
  // The dashboard usually shares its global unread state (for the tab badge);
  // reads here ping it so the badge updates instantly. Standalone use still
  // works via the local fallback.
  const unread = unreadProp ?? unreadLocal
  const refreshUnread = () => {
    if (onRead) onRead()
    else getUnreadState(profile.id).then(setUnreadLocal).catch(() => {})
  }

  useEffect(() => {
    Promise.all([getDealerships(), getAuthorizedDealers(), getOrders()])
      .then(([s, d, o]) => { setStores(s); setDealers(d); setOrders(o) })
      .catch((e) => setErr(e.message))
    if (!unreadProp) {
      refreshUnread()
      const t = setInterval(refreshUnread, 30000)
      return () => clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const channels = useMemo(() => {
    // Messaging is per-store: a dealership user chats for THEIR rooftop only.
    const relevant = mode === 'dealership'
      ? (stores ?? []).filter((s) => s.id === profile?.dealership_id)
      : (stores ?? [])
    const out = []
    for (const store of relevant) {
      const dealer_id = mode === 'installer' ? dealerId : store.authorized_dealer_id
      if (!dealer_id) continue // no servicing shop assigned -> no channel yet
      const dealerName = dealers.find((d) => d.id === dealer_id)?.name
      out.push({
        key: `${store.id}|general`,
        dealership_id: store.id,
        authorized_dealer_id: dealer_id,
        order_id: null,
        storeName: store.name,
        title: mode === 'installer' ? store.name : 'General',
        subtitle: mode === 'installer' ? 'General channel' : (dealerName ? `with ${dealerName}` : 'with your installer'),
      })
      for (const o of (orders ?? []).filter((x) => x.dealership_id === store.id).slice(0, 12)) {
        const vehicle = [o.vehicle_year, o.vehicle_make, o.vehicle_model].filter(Boolean).join(' ')
        out.push({
          key: `${store.id}|${o.id}`,
          dealership_id: store.id,
          authorized_dealer_id: dealer_id,
          order_id: o.id,
          storeName: store.name,
          title: o.order_number,
          subtitle: [mode === 'installer' ? store.name : null, o.customer_name, vehicle].filter(Boolean).join(' · ') || 'Order thread',
        })
      }
    }
    return out
  }, [stores, dealers, orders, mode, dealerId, profile?.dealership_id])

  useEffect(() => { if (!sel && channels.length) setSel(channels[0]) }, [channels, sel])

  if (err) return <div style={{ color: X.red }}>{err}</div>
  if (stores === null) return <Spinner />
  if (channels.length === 0) {
    return (
      <div style={{ ...CARD, padding: 20, color: X.slate, fontSize: 14, maxWidth: 640, lineHeight: 1.55 }}>
        {mode === 'installer'
          ? 'No serviced rooftops yet — channels appear as soon as XPEL assigns stores to your shop.'
          : profile?.dealership_id
            ? 'No servicing installer is assigned to this store yet — your channel appears here the moment XPEL sets that up.'
            : 'Messaging is per-store, and this account is group-wide (no single rooftop). Ask XPEL to assign you to a store to use Messages.'}
      </div>
    )
  }

  const chKey = (ch) => `${ch.dealership_id}|${ch.order_id ?? 'general'}`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 250px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ ...CARD, padding: 8, maxHeight: 560, overflowY: 'auto' }}>
        {channels.map((ch) => {
          const n = unread.counts.get(chKey(ch)) ?? 0
          const on = sel?.key === ch.key
          return (
            <button key={ch.key} onClick={() => setSel(ch)} style={{ ...railBtn, ...(on ? railBtnOn : {}) }}>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ch.order_id ? ch.title : ch.title}
                </span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ch.subtitle}
                </span>
              </span>
              {n > 0 && <span style={dot}>{n > 9 ? '9+' : n}</span>}
            </button>
          )
        })}
      </div>
      {sel && <ChatPanel channel={sel} profile={profile} onRead={refreshUnread} />}
    </div>
  )
}

function ChatPanel({ channel, profile, onRead }) {
  const [msgs, setMsgs] = useState(null)
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const boxRef = useRef(null)

  async function load(mark) {
    try {
      const m = await getMessages(channel.dealership_id, channel.order_id)
      setMsgs(m)
      if (mark) {
        await markChannelRead(profile.id, channel.dealership_id, channel.order_id)
        onRead?.()
      }
    } catch (e) { setErr(e.message) }
  }

  useEffect(() => {
    setMsgs(null); setErr(''); setBody('')
    load(true)
    const t = setInterval(() => load(true), 20000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.key])

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [msgs?.length])

  async function send() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true); setErr('')
    try {
      await sendMessage(profile, {
        dealership_id: channel.dealership_id,
        authorized_dealer_id: channel.authorized_dealer_id,
        order_id: channel.order_id,
        body: text,
      })
      setBody('')
      await load(true)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ ...CARD, padding: 0, display: 'flex', flexDirection: 'column', height: 560, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${X.line}` }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>
          {channel.order_id ? `Order ${channel.title}` : `${channel.storeName} — General`}
        </div>
        <div style={{ fontSize: 12, color: X.slate }}>{channel.subtitle} · private to the store and its installer</div>
      </div>
      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#F7F5EF' }}>
        {msgs === null && <div style={{ color: X.slate, fontSize: 13 }}>Loading…</div>}
        {msgs !== null && msgs.length === 0 && (
          <div style={{ color: X.slate, fontSize: 13.5 }}>No messages yet — start the conversation.</div>
        )}
        {msgs?.map((m) => <Bubble key={m.id} m={m} mine={m.sender_id === profile.id} />)}
      </div>
      {err && <div style={{ color: X.red, fontSize: 12.5, padding: '6px 16px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${X.line}` }}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder="Write a message…"
          maxLength={4000}
          style={composer}
        />
        <button onClick={send} disabled={busy || !body.trim()} style={{ ...sendBtn, opacity: busy || !body.trim() ? 0.5 : 1 }}>
          Send
        </button>
      </div>
    </div>
  )
}

function Bubble({ m, mine }) {
  const roleLabel = m.sender_role === 'installer' ? 'Installer' : 'Store'
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div style={{ maxWidth: '78%' }}>
        <div style={{ fontSize: 10.5, color: X.slate, margin: mine ? '0 4px 3px 0' : '0 0 3px 4px', textAlign: mine ? 'right' : 'left' }}>
          {(m.sender_name || roleLabel)} · {roleLabel} · {fmtTime(m.created_at)}
        </div>
        <div style={{
          background: mine ? X.black : '#FFFFFD',
          color: mine ? X.white : X.black,
          border: mine ? 'none' : `1px solid ${X.gray}`,
          borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          padding: '9px 13px', fontSize: 13.5, lineHeight: 1.45,
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        }}>{m.body}</div>
      </div>
    </div>
  )
}

function fmtTime(ts) {
  const d = new Date(ts)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const today = new Date().toDateString() === d.toDateString()
  return today ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

const railBtn = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 4,
  background: 'transparent', border: '1px solid transparent', borderRadius: 10,
  padding: '9px 10px', cursor: 'pointer', fontFamily: FONT.body, color: X.black,
}
const railBtnOn = { background: '#F3F0E8', border: `1px solid ${X.gray}` }
const dot = {
  background: X.yellow, color: X.black, borderRadius: 999, fontSize: 10.5, fontWeight: 800,
  minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '0 5px', flexShrink: 0, fontFamily: FONT.body,
}
const composer = {
  flex: 1, boxSizing: 'border-box', background: '#FFFFFD', border: `1px solid ${X.gray}`,
  borderRadius: 12, padding: '11px 13px', fontSize: 14, fontFamily: FONT.body,
}
const sendBtn = {
  background: X.yellow, color: X.black, border: 'none', borderRadius: 12, padding: '11px 20px',
  fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', fontFamily: FONT.body,
}
