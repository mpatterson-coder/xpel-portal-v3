// =============================================================================
// VIN decoding for the ordering flow.
//
// Uses the NHTSA vPIC API — the U.S. government's free, public vehicle
// database (vpic.nhtsa.dot.gov). No account, no key, no XPEL system involved.
// Returns year, make, model, trim, and an auto-inferred size category
// (standard / midsize / fullsize) based on the vehicle's body class.
// If the API is unreachable, falls back to local year-only decoding.
// =============================================================================

const YEAR_CODES = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
  J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025,
  T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  1: 2001, 2: 2002, 3: 2003, 4: 2004, 5: 2005, 6: 2006, 7: 2007, 8: 2008, 9: 2009,
}

export function isLikelyVin(vin) {
  return typeof vin === 'string' && /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim())
}

// Models that are full-size even though their body class reads generic "SUV".
const FULLSIZE_MODELS = /tahoe|suburban|yukon|escalade|expedition|navigator|sequoia|armada|wagoneer|land cruiser|lx ?600|gls|qx80|range rover(?! evoque| velar)/i

function inferSize({ bodyClass = '', model = '' }) {
  const bc = bodyClass.toLowerCase()
  if (/truck|pickup|van|bus|cab/.test(bc)) return 'fullsize'
  if (FULLSIZE_MODELS.test(model)) return 'fullsize'
  if (/sport utility|suv|crossover|multipurpose|mpv|wagon/.test(bc)) return 'midsize'
  if (/sedan|coupe|hatchback|convertible|roadster|liftback/.test(bc)) return 'standard'
  return '' // unknown body class -> let the user choose
}

// Full decode via NHTSA. Returns { year, make, model, trim, size, source }.
export async function decodeVinFull(vin) {
  const clean = vin.trim().toUpperCase()
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${clean}?format=json`)
    if (!res.ok) throw new Error('lookup failed')
    const data = await res.json()
    const r = data?.Results?.[0] ?? {}
    const year = r.ModelYear && r.ModelYear !== '0' ? Number(r.ModelYear) : localYear(clean)
    return {
      year: year || '',
      make: r.Make ? title(r.Make) : '',
      model: r.Model || '',
      trim: r.Trim && r.Trim !== 'Not Applicable' ? r.Trim : (r.Series || ''),
      size: inferSize({ bodyClass: r.BodyClass || '', model: r.Model || '' }),
      source: 'nhtsa',
    }
  } catch {
    return { year: localYear(clean) || '', make: '', model: '', trim: '', size: '', source: 'local' }
  }
}

function localYear(vin) {
  return YEAR_CODES[vin[9]] || null
}

function title(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
