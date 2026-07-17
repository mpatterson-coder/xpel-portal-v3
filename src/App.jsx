import { useAuth } from './context/AuthContext'
import Login from './components/Login'
import PageHero from './components/PageHero'
import ErrorBoundary from './components/ErrorBoundary'
import DealershipDashboard from './components/DealershipDashboard'
import InstallerDashboard from './components/InstallerDashboard'
import AdminDashboard from './components/AdminDashboard'
import { COLOR, FONT, CARD } from './lib/theme'
import logoWhite from './assets/xpel-white.png'

const ROLE_LABEL = { dealership: 'Dealership', installer: 'Installer', admin: 'XPEL Admin' }

export default function App() {
  const { user, profile, role, loading, signOut } = useAuth()

  // Branded boot screen — the product turning on, not a page loading.
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: COLOR.black, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <img className="x-fade" src={logoWhite} alt="XPEL" style={{ width: 150 }} />
        <span className="x-spinner" style={{ borderColor: 'rgba(255,255,253,0.15)', borderTopColor: COLOR.yellow }} />
      </div>
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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

      <div className="x-fade" style={{ flex: 1, width: '100%', padding: '28px 28px 56px', maxWidth: 1240, margin: '0 auto' }}>
        <ErrorBoundary>
          <PageHero />
          {role === 'dealership' && <DealershipDashboard />}
          {role === 'installer' && <InstallerDashboard />}
          {role === 'admin' && <AdminDashboard />}
        </ErrorBoundary>
      </div>

      {/* Product footer — xpel.com format. */}
      <div style={foot}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <img src={logoWhite} alt="XPEL" style={{ width: 72, display: 'block', opacity: 0.95 }} />
          <span style={{ color: 'rgba(255,255,253,0.5)', fontSize: 12 }}>© XPEL 2026 · Dealership Portal — Pilot V3</span>
        </div>
        <div style={{ color: 'rgba(255,255,253,0.5)', fontSize: 12 }}>
          Built on the 2026 XPEL brand system ·{' '}
          <a href="https://www.xpel.com" target="_blank" rel="noreferrer" style={{ color: COLOR.yellow, textDecoration: 'none', fontWeight: 700 }}>xpel.com</a>
        </div>
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
  borderRadius: 8, padding: '12px 22px', fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '0.08em', cursor: 'pointer', fontFamily: FONT.body, fontSize: 12,
}
const foot = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
  background: COLOR.black, borderTop: `3px solid ${COLOR.yellow}`, padding: '18px 28px',
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT.body }}>{children}</div>
}
