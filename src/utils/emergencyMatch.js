// Does a new emergency report look like one already reported? (Moved here Nov 5 so
// reports saved with no signal can check again before they send.)

function textSimilarity(a, b) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  a = a.toLowerCase().trim()
  b = b.toLowerCase().trim()
  if (a === b) return 1
  const wordsA = new Set(a.split(/\s+/))
  const wordsB = new Set(b.split(/\s+/))
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  if (union === 0) return 0
  return intersection / union
}

// draft: { eventType, title, description, locationName }
export function eventSimilarity(draft, existing) {
  const typeScore = draft.eventType === existing.event_type ? 1 : 0
  const titleScore = textSimilarity(draft.title, existing.title)
  const descScore = textSimilarity(draft.description, existing.description)
  const locationScore = textSimilarity(draft.locationName, existing.location_name)
  // Weighted: type 30%, title 35%, location 20%, description 15%
  return (typeScore * 0.30) + (titleScore * 0.35) + (locationScore * 0.20) + (descScore * 0.15)
}

// The closest active emergency, if it is close enough to ask "Is this the same one?"
export function bestMatch(draft, existing) {
  let best = null
  let bestScore = 0
  for (const ev of existing || []) {
    const score = eventSimilarity(draft, ev)
    if (score > bestScore) { bestScore = score; best = ev }
  }
  return bestScore >= 0.70 ? best : null
}
