import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getOrders } from '../lib/db'
import { onNavigate } from '../lib/bus'
import OrderWizard from './OrderWizard'
import OrdersList from './OrdersList'
import TabNav from './TabNav'
import GettingStarted from './GettingStarted'
import PerformanceDashboard from './PerformanceDashboard'
import StorePricingAdmin from './StorePricingAdmin'
import TeamAdmin from './TeamAdmin'
import MessagesHub from './MessagesHub'
import { usePersistentState } from '../lib/uiState'
import { useUnread } from '../lib/useUnread'
import { COLOR as X, FONT, CARD } from '../lib/theme'

// The F&I ("Dealership") view, rebuilt around guided modules: a prominent
// "Start a new order" that opens the step-by-step order wizard, the store's
// orders full-width beneath it, and bell-driven navigation (a tapped alert
// lands exactly on the right order or conversation).
export default function DealershipDashboard() {
  const { profile, isManager } = useAuth()
  const { unread, refresh: refreshUnread } = useUnread(profile?.id)
  const [view, setView] = usePersistentState('xpel.dealer.view', 'order')
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')
  const [focusOrder, setFocusOrder] = useState(null)
  const [wizardOpen, setWizardOpen] = usePersistentState(`xpel.${profile?.id ?? 'anon'}.wiz.open`, false)

  const load = () => getOrders().then(setOrders).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  // The pinned bell (and the wizard's success screen) navigate through here.
  useEffect(() => onNavigate((d) => {
    if (d.view === 'messages') setView('messages')
    if (d.view === 'order') { if (d.orderId) setFocusOrder({ id: d.orderId }); setView('order') }
  }), [])

  const tabs = {
    order: 'New Order',
    ...(isManager ? { pricing: 'Packages & Pricing', team: 'Team' } : {}),
    messages: 'Messages',
    performance: 'Performance',
  }
  const active = tabs[view] ? view : 'order'

  return (
    <div style={{ maxWidth: 1100 }}>
      <TabNav tabs={tabs} value={active} onChange={setView} badges={{ messages: unread.total }} />
      {active === 'order' && (
        <div>
          <GettingStarted storageKey={`xpel.gs.dealer.${profile?.id}`} title="Getting started at your store" items={[
            { label: 'Place your first order — the module walks you through it', done: orders.length > 0, action: () => setWizardOpen(true), actionLabel: 'Start' },
            ...(isManager ? [{ label: 'Name your packages & set retail under Packages & Pricing', done: false, action: () => setView('pricing'), actionLabel: 'Open' }] : []),
            { label: 'Say hello to your installer in Messages', done: false, action: () => setView('messages'), actionLabel: 'Open' },
          ]} />
          <div style={{ ...CARD, padding: '22px 24px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderLeft: `4px solid ${X.yellow}` }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Start a new order</div>
              <div style={{ fontSize: 13, color: X.slate, marginTop: 3, lineHeight: 1.5 }}>
                Vehicle → customer → packages → review. The module guides every step and your draft saves automatically.
              </div>
            </div>
            <button onClick={() => setWizardOpen(true)} style={startBtn}>+ New Order</button>
          </div>
          {err && <div style={{ color: X.red, marginBottom: 8 }}>{err}</div>}
          <OrdersList orders={orders} title="This Store's Orders" focus={focusOrder} onChanged={load} />
        </div>
      )}
      {active === 'pricing' && <StorePricingAdmin />}
      {active === 'team' && <TeamAdmin />}
      {active === 'messages' && <MessagesHub mode="dealership" unread={unread} onRead={refreshUnread} />}
      {active === 'performance' && (
        <PerformanceDashboard mode="dealership"
          onOpenOrder={(id) => { setFocusOrder({ id }); setView('order') }} />
      )}
      <OrderWizard open={!!wizardOpen}
        onClose={(trackId) => { setWizardOpen(false); if (trackId) setFocusOrder({ id: trackId }) }}
        onCreated={load} />
    </div>
  )
}

const startBtn = { background: X.yellow, color: X.black, border: 'none', borderRadius: 12, padding: '13px 24px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', fontFamily: FONT.body, boxShadow: '0 6px 18px rgba(253,181,33,0.35)' }
