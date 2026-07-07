import { useEffect, useState } from 'react'
import { getOrders } from '../lib/db'
import OrderForm from './OrderForm'
import OrdersList from './OrdersList'

// The F&I ("Dealership") view: place a new PPF order, and see this location's
// orders. Both read/write live Supabase data. RLS scopes the order list to the
// user's own dealership automatically.
export default function DealershipDashboard() {
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')

  const load = () => getOrders().then(setOrders).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
      <OrderForm onCreated={load} />
      <div>
        {err && <div style={{ color: '#C94543', marginBottom: 8 }}>{err}</div>}
        <OrdersList orders={orders} title="This Store's Orders" />
      </div>
    </div>
  )
}
