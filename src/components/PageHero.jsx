import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDealerships, getAuthorizedDealers } from '../lib/db'
import { COLOR as X, FONT } from '../lib/theme'
import { Sheen } from './ui'

// =============================================================================
// The role hero — the xpel.com opening pattern (CAPS eyebrow, short confident
// headline, one supporting line) rendered as the brand's foundational shape:
// a Carbon Black card with the forward-leaning cut on its trailing edge
// (Visual System — Construction, p.28). The drop-shadow follows the cut.
// Headlines are XPEL voice; the dealership line is the mission verbatim (p.7).
// =============================================================================

const EYEBROW = {
  dealership: 'Dealership · F&I',
  installer: 'Installer Network',
  admin: 'XPEL Administration',
}
const HEADLINE = {
  dealership: 'Protect what matters most.',
  installer: 'Every install, on track.',
  admin: 'The whole network, in focus.',
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function PageHero() {
  const { profile, role, dealershipId, dealerId } = useAuth()
  const [place, setPlace] = useState('')

  useEffect(() => {
    let on = true
    if (role === 'admin') { setPlace('XPEL, Inc. — Network Administration'); return undefined }
    if (role === 'installer') {
      getAuthorizedDealers().then((ds) => {
        const d = ds.find((x) => x.id === dealerId) || ds[0]
        if (on && d) setPlace(`${d.name} — XPEL Authorized Installer`)
      }).catch(() => {})
    }
    if (role === 'dealership') {
      getDealerships().then((ds) => {
        const d = ds.find((x) => x.id === dealershipId)
        if (on && d) setPlace(`${d.name}${d.city ? ` — ${d.city}${d.state ? `, ${d.state}` : ''}` : ''}`)
      }).catch(() => {})
    }
    return () => { on = false }
  }, [role, dealershipId, dealerId])

  const first = (profile?.full_name ?? '').trim().split(' ')[0]
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div style={{ filter: 'drop-shadow(0 16px 28px rgba(20,18,19,0.22))', marginBottom: 24 }}>
      <div style={hero}>
        <Sheen />
        <div aria-hidden="true" style={{ position: 'absolute', right: 120, bottom: -34, width: 130, height: 130, transform: 'skewX(-14deg)', background: 'rgba(231,228,218,0.05)', borderRadius: 6 }} />
        <div aria-hidden="true" style={{ position: 'absolute', right: 44, top: 26, display: 'flex', gap: 5 }}>
          <span style={{ ...chip, background: X.yellow }} />
          <span style={{ ...chip, background: 'rgba(255,255,253,0.35)' }} />
          <span style={{ ...chip, background: 'rgba(231,228,218,0.55)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing, color: 'rgba(255,255,253,0.65)', fontWeight: 700 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, background: X.yellow, transform: 'skewX(-14deg)' }} />
          {EYEBROW[role] ?? 'Dealership Portal'}
        </div>
        <h1 style={{ margin: '10px 0 7px', color: X.white, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.12 }}>
          {HEADLINE[role] ?? 'Dealership Portal'}
        </h1>
        <div style={{ color: 'rgba(255,255,253,0.62)', fontSize: 13.5 }}>
          {greeting()}{first ? `, ${first}` : ''}{place ? ` · ${place}` : ''} · {date}
        </div>
      </div>
    </div>
  )
}

const hero = {
  position: 'relative', overflow: 'hidden', background: X.black,
  borderRadius: 20, padding: '26px 30px 28px',
  clipPath: 'polygon(0 0, 100% 0, calc(100% - 28px) 100%, 0 100%)',
}
const chip = { width: 13, height: 13, transform: 'skewX(-14deg)', display: 'inline-block' }
