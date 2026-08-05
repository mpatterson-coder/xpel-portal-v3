import { useEffect, useRef, useState } from 'react'
import { COLOR as X, FONT } from '../lib/theme'

// =============================================================================
// Shared design atoms for the 2026 system.
//
// Eyebrow — a section label led by the brand's forward-leaning parallelogram
//           tick (the angled-cut motif from Graphic Elements, p.34).
// Sheen   — the "PPF effect" (p.30): a translucent FFF7E4 band of light lying
//           across a dark surface, skewed to the logo's lean. Parent needs
//           position:relative + overflow:hidden.
// Spinner — quiet loading state.
// =============================================================================

export const Eyebrow = ({ children, style }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 11, textTransform: 'uppercase', letterSpacing: FONT.badgeSpacing,
    color: X.slate, fontWeight: FONT.subWeight, marginBottom: 12, ...style,
  }}>
    <span aria-hidden="true" style={{ width: 8, height: 8, background: X.yellow, transform: 'skewX(-14deg)', flexShrink: 0 }} />
    {children}
  </div>
)

export const Sheen = () => (
  <div aria-hidden="true" style={{
    position: 'absolute', top: '-30%', right: -12, width: 72, height: '160%',
    transform: 'skewX(-18deg)', pointerEvents: 'none',
    background: 'linear-gradient(105deg, rgba(255,247,228,0) 0%, rgba(255,247,228,0.13) 50%, rgba(255,247,228,0) 100%)',
  }} />
)

export const Spinner = ({ label = 'Loading…' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: X.slate, fontSize: 13.5, fontFamily: FONT.body }}>
    <span className="x-spinner" style={{ width: 18, height: 18 }} />{label}
  </div>
)

// Animate a number toward its target (finished-product KPI feel). Snaps
// instantly for non-numbers and for users who prefer reduced motion.
const prefersReduced = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(typeof target === 'number' ? 0 : target)
  const prevRef = useRef(0)
  useEffect(() => {
    if (typeof target !== 'number' || !isFinite(target) || prefersReduced) {
      setVal(target); prevRef.current = typeof target === 'number' ? target : 0
      return undefined
    }
    const from = prevRef.current
    let raf
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(from + (target - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); prevRef.current = target }
  }, [target, duration])
  return val
}


// Modal — the shared overlay module for the whole portal. Always fits the
// viewport: capped at 90vh with its own internal scroll, black brand header,
// optional sticky footer for actions. Click the backdrop or × to close.
export function Modal({ title, subtitle, onClose, children, footer, width = 720 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,19,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3vh 16px' }}>
      <div className="x-fade" onClick={(e) => e.stopPropagation()}
        style={{ background: X.white, borderRadius: 16, width: `min(${width}px, 100%)`, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 70px rgba(20,18,19,0.35)', fontFamily: FONT.body }}>
        <div style={{ background: X.black, color: X.white, padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'relative', overflow: 'hidden' }}>
          <Sheen />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: 'rgba(255,255,253,0.65)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,253,0.8)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>{children}</div>
        {footer && <div style={{ padding: '12px 20px', borderTop: `1px solid ${X.line}`, background: '#FBFAF7', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  )
}

// AlertPill — the brand deck's footnote system (IMPORTANT / ALERT / SUCCESS),
// with a quiet NOTE default. The slanted label chip carries the brand lean.
export function AlertPill({ tone = 'note', children, style }) {
  const map = {
    important: { bg: '#F7E9EA', bd: 'rgba(125,20,25,0.45)', fg: X.red, label: 'IMPORTANT' },
    alert:     { bg: '#FFF3D6', bd: 'rgba(253,181,33,0.8)', fg: '#8A6200', label: 'ALERT' },
    success:   { bg: '#E9EFEA', bd: 'rgba(63,90,71,0.45)',  fg: X.green, label: 'SUCCESS' },
    note:      { bg: '#F3F0E8', bd: X.gray,                 fg: X.slate, label: 'NOTE' },
  }
  const t = map[tone] ?? map.note
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 12, padding: '10px 14px', fontSize: 13, lineHeight: 1.5, color: X.black, fontFamily: FONT.body, ...style }}>
      <span aria-hidden="true" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', color: t.fg, border: `1.5px solid ${t.fg}`, borderRadius: 6, padding: '2px 8px', transform: 'skewX(-10deg)', flexShrink: 0, marginTop: 1 }}>{t.label}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

// CheckerBand — the checkered-flag parallelogram strip from the brand deck's
// dark section slides. A quiet motion accent for dark headers and heroes.
export function CheckerBand({ fill = X.yellow, size = 8, opacity = 1, style }) {
  const cols = 60
  const squares = []
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if ((r + c) % 2 === 0) squares.push(<rect key={`${r}-${c}`} x={c * size} y={r * size} width={size} height={size} fill={fill} />)
    }
  }
  return (
    <svg aria-hidden="true" width={cols * size} height={2 * size} style={{ display: 'block', transform: 'skewX(-14deg)', opacity, ...style }}>
      {squares}
    </svg>
  )
}
