import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { COLOR, FONT } from '../lib/theme'
import logoWhite from '../assets/xpel-white.png'

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
      <form onSubmit={submit} style={s.card}>
        <img src={logoWhite} alt="XPEL" style={{ width: 190, alignSelf: 'flex-start' }} />
        <div style={s.subtitle}>Dealership Portal</div>
        {/* Signature element from the 2026 visual system: the forward-leaning
            shape cluster (Brand Guidelines V1 2026 — Graphic Elements &
            stationery, pp.34/47). Angle echoes the logo's lean. */}
        <div style={s.motif} aria-hidden="true">
          <div style={{ ...s.chip, background: COLOR.yellow }} />
          <div style={{ ...s.chip, background: COLOR.slate }} />
          <div style={{ ...s.chip, background: COLOR.stone }} />
        </div>
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

// Dark neutrals are derived from Carbon Black (#141213) — lifted a step for
// the card and another for borders — so the whole screen sits in the 2026
// primary palette with XPEL Yellow as the only accent.
const s = {
  screen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLOR.black, fontFamily: FONT.body, padding: 24 },
  card: { width: '100%', maxWidth: 400, background: '#1C1B1A', border: `1px solid #35332F`, borderRadius: 12, padding: '40px 34px', display: 'flex', flexDirection: 'column' },
  subtitle: { color: COLOR.yellow, fontWeight: FONT.subWeight, fontSize: 13, textTransform: 'uppercase', letterSpacing: FONT.subtitleSpacing, marginTop: 12 },
  motif: { display: 'flex', gap: 5, marginTop: 16, marginBottom: 10 },
  chip: { width: 15, height: 15, transform: 'skewX(-14deg)' },
  label: { color: COLOR.gray, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: FONT.subWeight, marginBottom: 6, marginTop: 14 },
  input: { background: COLOR.black, border: `1px solid #35332F`, borderRadius: 8, padding: '12px 13px', color: COLOR.white, fontSize: 15, fontFamily: FONT.body, outline: 'none' },
  button: { marginTop: 28, background: COLOR.yellow, color: COLOR.black, border: 'none', borderRadius: 8, padding: '14px 16px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontFamily: FONT.body, cursor: 'pointer' },
  error: { marginTop: 16, color: '#E4837F', fontSize: 13.5 },
  foot: { marginTop: 22, color: '#8C8983', fontSize: 11.5, textAlign: 'center', letterSpacing: '0.03em' },
}
