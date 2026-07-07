import { useAuth } from './context/AuthContext'
import Login from './components/Login'
import DealershipDashboard from './components/DealershipDashboard'
import InstallerDashboard from './components/InstallerDashboard'
import AdminDashboard from './components/AdminDashboard'
import { COLOR, FONT } from './lib/theme'
import logoWhite from './assets/xpel-white.png'

export default function App() {
  const { user, profile, role, loading, signOut } = useAuth()

  if (loading) return <Centered>Loading…</Centered>
  if (!user) return <Login />

  if (!role || (!profile?.group_id && role !== 'admin')) {
    return (
      <Centered>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <img src={logoWhite} alt="XPEL" style={{ width: 160, filter: 'invert(1)' }} />
          <p style={{ color: COLOR.slate, marginTop: 16 }}>
            You’re signed in, but your account hasn’t been assigned to a dealership yet.
            An XPEL admin needs to finish setting up your access.
          </p>
          <button onClick={signOut} style={btn}>Sign out</button>
        </div>
      </Centered>
    )
  }

  return (
    <div>
      <div style={bar}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <img src={logoWhite} alt="XPEL" style={{ width: 108, alignSelf: 'center' }} />
          <span style={{ color: COLOR.yellow, fontWeight: FONT.subWeight, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.subtitleSpacing }}>
            Dealership Portal
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: COLOR.gray, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {profile?.full_name || profile?.email} · {role}
          </span>
          <button onClick={signOut} style={{ ...btn, marginTop: 0, padding: '8px 14px' }}>Sign out</button>
        </div>
      </div>
      <div style={{ padding: 24 }}>
        {role === 'dealership' && <DealershipDashboard />}
        {role === 'installer' && <InstallerDashboard />}
        {role === 'admin' && <AdminDashboard />}
      </div>
    </div>
  )
}

const bar = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: COLOR.black, padding: '14px 24px' }
const btn = { marginTop: 20, background: COLOR.yellow, color: COLOR.black, border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', fontFamily: FONT.body, fontSize: 12 }

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT.body }}>{children}</div>
}
