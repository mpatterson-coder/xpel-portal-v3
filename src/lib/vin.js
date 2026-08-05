// =============================================================================
// VIN decoding — NHTSA vPIC lookup with a graceful local fallback.
//
// decodeVinFull(vin) resolves to:
//   { year, make, model, trim, size, source: 'nhtsa' | 'local' }
// The `size` is a best-guess order size derived from the NHTSA body class so
// the form can pre-select it; the person always confirms or adjusts it.
// If the NHTSA API is unreachable, we still decode the model year locally
// from the VIN's 10th character so the form isn't left empty.
// =============================================================================

// VIN model-year codes (position 10). Letters skip I, O, Q, U, Z.
const YEAR_CODES = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
  J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025,
  T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  1: 2001, 2: 2002, 3: 2003, 4: 2004, 5: 2005, 6: 2006, 7: 2007, 8: 2008, 9: 2009,
}

export function isLikelyVin(v) {
  const s = (v || '').trim().toUpperCase()
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s)
}

function localYear(vin) {
  const c = (vin || '').trim().toUpperCase()[9]
  return YEAR_CODES[c] ?? null
}

function titleCase(s) {
  return (s || '').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()).trim()
}

// Two coverage sizes: FULL SIZE targets full-size SUVs and trucks;
// everything else pre-selects STANDARD (the person can always adjust).
function sizeFromBody(bodyClass) {
  const b = (bodyClass || '').toLowerCase()
  if (/(pickup|truck|sport utility|suv|van|minivan|bus|cab)/.test(b)) return 'fullsize'
  return 'standard'
}

export async function decodeVinFull(vin) {
  const clean = (vin || '').trim().toUpperCase()
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(clean)}?format=json`,
    )
    if (!res.ok) throw new Error(`NHTSA ${res.status}`)
    const json = await res.json()
    const r = json?.Results?.[0] ?? {}
    return {
      year: Number(r.ModelYear) || localYear(clean),
      make: titleCase(r.Make),
      model: (r.Model || '').trim(),
      trim: (r.Trim || r.Series || '').trim(),
      size: sizeFromBody(r.BodyClass),
      source: 'nhtsa',
    }
  } catch {
    return { year: localYear(clean), make: '', model: '', trim: '', size: '', source: 'local' }
  }
}
