import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getOrders } from '../lib/db'
import OrderForm from './OrderForm'
import OrdersList from './OrdersList'
import TabNav from './TabNav'
import PerformanceDashboard from './PerformanceDashboard'
import StorePricingAdmin from './StorePricingAdmin'
import TeamAdmin from './TeamAdmin'
import MessagesHub from './MessagesHub'
import { usePersistentState } from '../lib/uiState'
import { COLOR } from '../lib/theme'

// The F&I ("Dealership") view: place orders, track this location's orders,
// and see live performance. STORE MANAGERS (any title containing "Manager")
// additionally get Packages & Pricing (rename packages, set retail) and Team
// (add users, set titles). RLS scopes everything to the user's own store.
export default function DealershipDashboard() {
  const { isManager } = useAuth()
  const [view, setView] = usePersistentState('xpel.dealer.view', 'order')
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')

  const load = () => getOrders().then(setOrders).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const tabs = {
    order: 'New Order',
    ...(isManager ? { pricing: 'Packages & Pricing', team: 'Team' } : {}),
    messages: 'Messages',
    performance: 'Performance',
  }
  // If a saved view is no longer available to this user (say a title change),
  // fall back to ordering rather than rendering nothing.
  const active = tabs[view] ? view : 'order'

  return (
    <div style={{ maxWidth: 1100 }}>
      <TabNav tabs={tabs} value={active} onChange={setView} />
      {active === 'order' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
          <OrderForm onCreated={load} />
          <div>
            {err && <div style={{ color: COLOR.red, marginBottom: 8 }}>{err}</div>}
            <OrdersList orders={orders} title="This Store's Orders" />
          </div>
        </div>
      )}
      {active === 'pricing' && <StorePricingAdmin />}
      {active === 'team' && <TeamAdmin />}
      {active === 'messages' && <MessagesHub mode="dealership" />}
      {active === 'performance' && <PerformanceDashboard mode="dealership" />}
    </div>
  )
}
