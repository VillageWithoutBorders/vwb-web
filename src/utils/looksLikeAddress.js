// Does this text look like a street address? (Nov 7, privacy sweep part 2)
// Jade's rule: never a chance someone could use VWB to find where a person is.
// Used to show a gentle note while someone types. It never blocks posting:
// "123 Main St" could be a church or a library, and the person decides.
// The same pattern is in vwb-privacy-sweep-2.sql.
const STREET = /\b\d{2,6}\s+[a-z0-9.\- ]{2,40}\s(st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|blvd|hwy|highway|pike|way|cir|circle|trl|trail|pkwy|pl|place)\b/i
const UNIT = /\b(apt|apartment|unit|lot)\.?\s*#?\s*\d+[a-z]?\b/i
const SPANISH = /\b(calle|avenida|camino|carretera)\s+[a-z0-9 ]{2,40}\s\d{1,6}\b/i

export function looksLikeAddress(text) {
  if (!text || text.length < 6) return false
  return STREET.test(text) || UNIT.test(text) || SPANISH.test(text)
}
