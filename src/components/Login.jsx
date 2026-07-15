import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { listAccounts, forgetAccount } from '../lib/accounts'
import { COLOR, FONT } from '../lib/theme'
import logoWhite from '../assets/xpel-white.png'

const ROLE_LABEL = { dealership: 'Dealership', installer: 'Installer', admin: 'XPEL Admin' }

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
  const [accounts, setAccounts] = useState(() => listAccounts())

  // One-click resume for anyone who has signed in from this browser before.
  // If the saved tokens have gone stale, fall back to the password form.
  async function continueAs(acct) {
    setError(''); setBusy(true)
    const { error } = await supabase.auth.setSession({
      access_token: acct.access_token,
      refresh_token: acct.refresh_token,
    })
    setBusy(false)
    if (error) {
      forgetAccount(acct.id)
      setAccounts(listAccounts())
      setError('That saved session has expired — please sign in with your password.')
    }
  }

  function removeAccount(e, acct) {
    e.stopPropagation()
    forgetAccount(acct.id)
    setAccounts(listAccounts())
  }

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

        {accounts.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={s.label}>Continue as</div>
            {accounts.map((a) => (
              <button key={a.id} type="button" disabled={busy} onClick={() => continueAs(a)} style={s.acct}>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.full_name || a.email}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,253,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.email}
                  </span>
                </span>
                {a.role && <span style={s.acctRole}>{ROLE_LABEL[a.role] ?? a.role}</span>}
                <span role="button" title="Remove from this list" onClick={(e) => removeAccount(e, a)} style={s.acctX}>×</span>
              </button>
            ))}
            <div style={s.divider}><span style={s.dividerLine} />or sign in<span style={s.dividerLine} /></div>
          </div>
        )}

        <label style={s.label}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" style={s.input} required />
        <label style={s.label}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={s.input} required />
        {error && <div style={s.error}>{error}</div>}
        <button type="submit" disabled={busy} style={{ ...s.button, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <div style={s.foot}>© XPEL 2026 · Authorized dealers only</div>
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
    borderRadius: 8, padding: '15px 16px', fontSize: 13, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, fontFamily: FONT.body, cursor: 'pointer',
  },
  error: { marginTop: 16, color: '#E4837F', fontSize: 13.5 },
  foot: { marginTop: 22, color: 'rgba(255,255,253,0.35)', fontSize: 11.5, textAlign: 'center', letterSpacing: '0.03em' },
  acct: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginBottom: 6,
    background: 'rgba(255,255,253,0.06)', border: '1px solid rgba(255,255,253,0.14)',
    borderRadius: 12, padding: '10px 12px', color: COLOR.white, cursor: 'pointer', fontFamily: FONT.body,
  },
  acctRole: {
    color: COLOR.yellow, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
    border: '1px solid rgba(253,181,33,0.45)', borderRadius: 999, padding: '3px 9px', flexShrink: 0,
  },
  acctX: { color: 'rgba(255,255,253,0.45)', fontSize: 17, lineHeight: 1, padding: '0 2px', flexShrink: 0 },
  divider: {
    display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 2px',
    color: 'rgba(255,255,253,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
  },
  dividerLine: { flex: 1, height: 1, background: 'rgba(255,255,253,0.12)' },
}
