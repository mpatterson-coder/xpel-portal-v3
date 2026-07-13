import { useAuth } from './context/AuthContext'
import Login from './components/Login'
import DealershipDashboard from './components/DealershipDashboard'
import InstallerDashboard from './components/InstallerDashboard'
import AdminDashboard from './components/AdminDashboard'
import { COLOR, FONT, CARD } from './lib/theme'
import logoWhite from './assets/xpel-white.png'

const ROLE_LABEL = { dealership: 'Dealership', installer: 'Installer', admin: 'XPEL Admin' }

export default function App() {
  const { user, profile, role, loading, signOut } = useAuth()

  if (loading) {
    return (
      <Centered>
        <div style={{ textAlign: 'center' }}>
          <span className="x-spinner" />
        </div>
      </Centered>
    )
  }
  if (!user) return <Login />

  if (!role || (!profile?.group_id && role !== 'admin')) {
    return (
      <Centered>
        <div className="x-fade" style={{ ...CARD, textAlign: 'center', maxWidth: 460, padding: '40px 36px' }}>
          <img src={logoWhite} alt="XPEL" style={{ width: 150, filter: 'invert(1)' }} />
          <p style={{ color: COLOR.slate, marginTop: 16, fontSize: 14.5, lineHeight: 1.55 }}>
            You're signed in, but your account hasn't been assigned to a dealership yet.
            An XPEL admin needs to finish setting up your access.
          </p>
          <button onClick={signOut} style={btn}>Sign out</button>
        </div>
      </Centered>
    )
  }

  return (
    <div>
      {/* Frosted, sticky command bar — Carbon Black glass over the content. */}
      <div style={bar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logoWhite} alt="XPEL" style={{ width: 104, display: 'block' }} />
          <span aria-hidden="true" style={{ width: 8, height: 15, background: COLOR.yellow, transform: 'skewX(-14deg)' }} />
          <span style={{ color: COLOR.white, opacity: 0.92, fontWeight: FONT.subWeight, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.subtitleSpacing }}>
            Dealership Portal
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: 'rgba(255,255,253,0.85)', fontSize: 13 }}>
            {profile?.full_name || profile?.email}
            <span style={{
              marginLeft: 10, color: COLOR.yellow, fontSize: 10.5, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.07em',
              border: '1px solid rgba(253,181,33,0.45)', borderRadius: 999, padding: '3px 10px',
            }}>{ROLE_LABEL[role] ?? role}</span>
          </span>
          <button onClick={signOut} style={ghost}>Sign out</button>
        </div>
      </div>

      <div className="x-fade" style={{ padding: '28px 28px 56px', maxWidth: 1240, margin: '0 auto' }}>
        {role === 'dealership' && <DealershipDashboard />}
        {role === 'installer' && <InstallerDashboard />}
        {role === 'admin' && <AdminDashboard />}
      </div>
    </div>
  )
}

const bar = {
  position: 'sticky', top: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '13px 24px',
  background: 'rgba(20, 18, 19, 0.86)',
  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
  backdropFilter: 'saturate(180%) blur(20px)',
  borderBottom: '1px solid rgba(255,255,253,0.07)',
}
const ghost = {
  background: 'transparent', color: 'rgba(255,255,253,0.85)',
  border: '1px solid rgba(255,255,253,0.22)', borderRadius: 999,
  padding: '8px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT.body,
}
const btn = {
  marginTop: 20, background: COLOR.yellow, color: COLOR.black, border: 'none',
  borderRadius: 999, padding: '12px 22px', fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '0.08em', cursor: 'pointer', fontFamily: FONT.body, fontSize: 12,
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT.body }}>{children}</div>
}
