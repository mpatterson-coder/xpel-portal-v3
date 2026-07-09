// =============================================================================
// XPEL brand system — sourced from the official 2024 Color Guide and Brand
// Guidelines. Single source of truth for every screen in the portal.
// =============================================================================

export const COLOR = {
  // Primary (Color Guide 2024)
  yellow: '#FDB521',   // Pantone 1235 C
  black:  '#000000',   // Pantone Black 6 C
  white:  '#FFFFFF',
  // Secondary
  gray:   '#D1D3D5',   // Pantone 427 C
  teal:   '#1A9392',   // Pantone 2461 C
  slate:  '#505A72',   // Pantone 2376 C
  red:    '#C94543',   // Pantone 2033 C
  // Derived surfaces
  bg:     '#F4F5F6',
  panel:  '#FFFFFF',
  line:   '#E4E6E8',
  green:  '#2E7D5B',
}

// Typography: XPEL's official digital typeface is Jost (per Brand Guidelines —
// "Digital Typeface"). Futura PT (the print face) is licensed and not freely
// embeddable; Jost is XPEL's own sanctioned web equivalent, loaded from
// Google Fonts in index.html. Headings use heavier weights per the guide.
export const FONT = {
  body: "'Jost', system-ui, sans-serif",
  headingWeight: 700,   // titles: bold
  subWeight: 600,       // subtitles/badges: heavy-ish
  badgeSpacing: '0.08em', // 8% tracking for badges per guide
  subtitleSpacing: '0.06em',
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
