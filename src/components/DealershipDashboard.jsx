import { useEffect, useState } from 'react'
import { getOrders } from '../lib/db'
import OrderForm from './OrderForm'
import OrdersList from './OrdersList'
import TabNav from './TabNav'
import PerformanceDashboard from './PerformanceDashboard'
import { usePersistentState } from '../lib/uiState'
import { COLOR } from '../lib/theme'

// The F&I ("Dealership") view: place orders and see this location's orders,
// plus a live performance dashboard (revenue, margin, package performance).
// RLS scopes everything to the user's own dealership automatically.
export default function DealershipDashboard() {
  const [view, setView] = usePersistentState('xpel.dealer.view', 'order')
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')

  const load = () => getOrders().then(setOrders).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  return (
    <div style={{ maxWidth: 1100 }}>
      <TabNav tabs={{ order: 'New Order', performance: 'Performance' }} value={view} onChange={setView} />
      {view === 'order' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
          <OrderForm onCreated={load} />
          <div>
            {err && <div style={{ color: COLOR.red, marginBottom: 8 }}>{err}</div>}
            <OrdersList orders={orders} title="This Store's Orders" />
          </div>
        </div>
      )}
      {view === 'performance' && <PerformanceDashboard mode="dealership" />}
    </div>
  )
}
