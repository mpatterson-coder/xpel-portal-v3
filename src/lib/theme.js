// =============================================================================
// XPEL brand system — sourced from the official Brand Guidelines V1 2026.
//
// The portal uses the AUTOMOTIVE segment palette (p.20 — explicitly listed for
// "dealer materials"), plus two master-palette secondaries (Mist and Strata
// Blue, p.17) reserved for order-status coding. Single source of truth for
// every screen in the portal.
// =============================================================================

export const COLOR = {
  // Primary — must be present in every execution (p.20)
  yellow: '#FDB521',   // XPEL Yellow — Pantone 1235 C. Accent ONLY, never a dominant background (p.19)
  black:  '#141213',   // Carbon Black — Pantone Black 6 C
  white:  '#FFFFFD',   // Off-White — Pantone 11-0601 TCX Bright White
  // Secondary — Automotive palette
  stone:  '#E7E4DA',   // Stone — Pantone 7527 C. Quiet surfaces & hairlines
  slate:  '#6B6863',   // Steel Bay — Pantone 18-0503 TPG. Secondary text (key name kept from the 2024 theme so every screen updates automatically)
  red:    '#7D1419',   // Garnet Red — Pantone 1815 C. "A performance accent, not a base color" (p.20): errors & cancelled only
  // Master secondary palette (p.17) — used sparingly, for status coding
  strata: '#182D55',   // Strata Blue — approved / informational notes
  mist:   '#B5CDCF',   // Mist — in review (with Carbon Black text)
  green:  '#3F5A47',   // Sage — completed / margin (key name kept from the 2024 theme)
  // Derived working surfaces (not brand swatches; tuned around Off-White/Stone)
  bg:     '#F6F5F1',   // page background — warm paper between Off-White and Stone
  panel:  '#FFFFFD',   // cards = Off-White
  line:   '#E7E4DA',   // panel hairlines = Stone
  gray:   '#D9D5CA',   // input/tab borders — Stone deepened a step for visibility (key name kept)
  teal:   '#182D55',   // legacy 2024 key — now points at Strata Blue so any straggler reference stays on-brand
}

// Typography (p.25): the brand faces are Mattone (display) and Neue Haas
// Grotesk (body). Neither is freely embeddable on the web, and the
// guidelines' own "Font Alternatives" table approves Arial Bold / Arial
// Regular as the substitutes — used here, so the portal is fully
// brand-compliant with zero external font downloads (also: faster loads).
export const FONT = {
  body: 'Arial, Helvetica, sans-serif',
  headingWeight: 700,   // "Arial - Bold" per the Font Alternatives table
  subWeight: 700,
  badgeSpacing: '0.08em',
  subtitleSpacing: '0.06em',
}

// Order-status color coding — ONE map, used by every screen that shows a
// status badge. All six tones are brand swatches.
export const STATUS_TONE = {
  submitted:   { bg: COLOR.slate,  fg: COLOR.white },  // Steel Bay — just arrived
  in_review:   { bg: COLOR.mist,   fg: COLOR.black },  // Mist — being looked at
  approved:    { bg: COLOR.strata, fg: COLOR.white },  // Strata Blue — cleared to proceed
  in_progress: { bg: COLOR.yellow, fg: COLOR.black },  // XPEL Yellow — on the floor
  completed:   { bg: COLOR.green,  fg: COLOR.white },  // Sage — done
  cancelled:   { bg: COLOR.red,    fg: COLOR.white },  // Garnet Red — performance accent
}

export const money = (n, frac = 2) =>
  '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac })

// Format a date-only value like '2026-07-15' as '7/15/2026' WITHOUT letting
// the browser shift it by timezone. (new Date('2026-07-15') is parsed as UTC
// midnight and can display as the PREVIOUS day in US timezones.)
export const dateUS = (d) => {
  if (!d) return ''
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return `${Number(m)}/${Number(day)}/${y}`
}
