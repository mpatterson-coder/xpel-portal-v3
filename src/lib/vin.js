// Minimal VIN helper for the F&I ordering flow. DPV1 "decodes make & year from
// the VIN"; for a standalone pilot we decode the model YEAR locally from the
// 10th VIN character (the industry-standard position). Make/model/trim are then
// confirmed by the F&I user, matching DPV1's "confirm model, trim and size".
//
// To make this a full real decode later, point decodeVin() at the FREE public
// NHTSA vPIC API (vpic.nhtsa.dot.gov/api) — no XPEL system required.

const YEAR_CODES = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
  J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025,
  T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  1: 2001, 2: 2002, 3: 2003, 4: 2004, 5: 2005, 6: 2006, 7: 2007, 8: 2008, 9: 2009,
}

export function isLikelyVin(vin) {
  return typeof vin === 'string' && /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim())
}

// Returns { year } when decodable, or {} otherwise.
export function decodeVin(vin) {
  if (!isLikelyVin(vin)) return {}
  const code = vin.trim().toUpperCase()[9]
  const year = YEAR_CODES[code]
  return year ? { year } : {}
}
