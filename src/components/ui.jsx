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
