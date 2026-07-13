import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { COLOR, FONT } from '../lib/theme'
import logoWhite from '../assets/xpel-white.png'

// =============================================================================
// The front door. Carbon Black field, the brand's forward-leaning shape
// system drifting behind a frosted "PPF glass" card — the interface wearing
// the product. Copy is straight from the 2026 tone-of-voice examples.
// =============================================================================
export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <div style={s.screen}>
      {/* The angled shape field (Graphic Elements, p.34–35) — blurred through the card */}
      <div aria-hidden="true" style={{ ...s.shape, top: '12%', left: '14%', width: 220, height: 220, background: 'rgba(253,181,33,0.10)' }} />
      <div aria-hidden="true" style={{ ...s.shape, top: '30%', left: '30%', width: 130, height: 130, background: 'rgba(231,228,218,0.07)' }} />
      <div aria-hidden="true" style={{ ...s.shape, bottom: '14%', right: '12%', width: 260, height: 260, background: 'rgba(231,228,218,0.06)' }} />
      <div aria-hidden="true" style={{ ...s.shape, bottom: '32%', right: '28%', width: 110, height: 110, background: 'rgba(253,181,33,0.07)' }} />

      <form onSubmit={submit} className="x-fade" style={s.card}>
        <img src={logoWhite} alt="XPEL" style={{ width: 190, alignSelf: 'flex-start' }} />
        <div style={s.subtitle}>Dealership Portal</div>
        <div style={s.motif} aria-hidden="true">
          <div style={{ ...s.chip, background: COLOR.yellow }} />
          <div style={{ ...s.chip, background: COLOR.slate }} />
          <div style={{ ...s.chip, background: COLOR.stone }} />
        </div>
        <div style={s.tagline}>Dealership solutions. Designed around you.</div>

        <label style={s.label}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" style={s.input} required />
        <label style={s.label}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={s.input} required />
        {error && <div style={s.error}>{error}</div>}
        <button type="submit" disabled={busy} style={{ ...s.button, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <div style={s.foot}>XPEL pilot — authorized dealers only</div>
      </form>
    </div>
  )
}

const s = {
  screen: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: COLOR.black, fontFamily: FONT.body, padding: 24,
    position: 'relative', overflow: 'hidden',
  },
  shape: { position: 'absolute', transform: 'skewX(-14deg)', borderRadius: 6 },
  card: {
    position: 'relative', width: '100%', maxWidth: 410,
    background: 'rgba(255,255,253,0.055)',
    WebkitBackdropFilter: 'blur(26px) saturate(150%)',
    backdropFilter: 'blur(26px) saturate(150%)',
    border: '1px solid rgba(255,255,253,0.12)',
    borderRadius: 22, padding: '42px 36px',
    boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
    display: 'flex', flexDirection: 'column',
  },
  subtitle: { color: COLOR.yellow, fontWeight: FONT.subWeight, fontSize: 13, textTransform: 'uppercase', letterSpacing: FONT.subtitleSpacing, marginTop: 12 },
  motif: { display: 'flex', gap: 5, marginTop: 16 },
  chip: { width: 15, height: 15, transform: 'skewX(-14deg)' },
  tagline: { color: 'rgba(255,255,253,0.55)', fontSize: 13, marginTop: 12, marginBottom: 8, lineHeight: 1.5 },
  label: { color: 'rgba(255,255,253,0.75)', fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: FONT.subWeight, marginBottom: 6, marginTop: 16 },
  input: {
    background: 'rgba(20,18,19,0.55)', border: '1px solid rgba(255,255,253,0.16)',
    borderRadius: 12, padding: '13px 14px', color: COLOR.white, fontSize: 15,
    fontFamily: FONT.body,
  },
  button: {
    marginTop: 28, background: COLOR.yellow, color: COLOR.black, border: 'none',
    borderRadius: 999, padding: '15px 16px', fontSize: 13, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontFamily: FONT.body, cursor: 'pointer',
  },
  error: { marginTop: 16, color: '#E4837F', fontSize: 13.5 },
  foot: { marginTop: 22, color: 'rgba(255,255,253,0.35)', fontSize: 11.5, textAlign: 'center', letterSpacing: '0.03em' },
}
