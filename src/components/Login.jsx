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
  screen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLOR.black, fontFamily: FONT.body, padding: 24 },
  card: { width: '100%', maxWidth: 400, background: '#0B0B0C', border: `1px solid #2A2F3A`, borderRadius: 12, padding: '40px 34px', display: 'flex', flexDirection: 'column' },
  subtitle: { color: COLOR.yellow, fontWeight: FONT.subWeight, fontSize: 13, textTransform: 'uppercase', letterSpacing: FONT.subtitleSpacing, marginTop: 12, marginBottom: 26 },
  label: { color: COLOR.gray, fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontWeight: FONT.subWeight, marginBottom: 6, marginTop: 14 },
  input: { background: '#000', border: `1px solid #2A2F3A`, borderRadius: 8, padding: '12px 13px', color: '#fff', fontSize: 15, fontFamily: FONT.body, outline: 'none' },
  button: { marginTop: 28, background: COLOR.yellow, color: COLOR.black, border: 'none', borderRadius: 8, padding: '14px 16px', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontFamily: FONT.body, cursor: 'pointer' },
  error: { marginTop: 16, color: COLOR.red, fontSize: 13.5 },
  foot: { marginTop: 22, color: COLOR.slate, fontSize: 11.5, textAlign: 'center', letterSpacing: '0.03em' },
}
