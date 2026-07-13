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
