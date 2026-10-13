// Shared by the Village Network map and the World globe.
// Lays out villages as circles from real places; circles overlap only where
// villages share zip codes.

export function labelWidth(name) { return Math.round(String(name || '').length * 7 + 22) }

function layout(list, w, h, pad) {
  const lat0 = list.reduce((s, v) => s + Number(v.latitude), 0) / list.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const pts = list.map((v) => ({ x: Number(v.longitude) * kx, y: -Number(v.latitude) }))
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y))
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
  // Center the real spread of the villages. With one village (or villages in a
  // straight line) the spread is zero on that side, so it sits in the middle.
  const offX = (w - (maxX - minX) * scale) / 2, offY = (h - (maxY - minY) * scale) / 2
  return pts.map((p) => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }))
}

// The circle map, laid out from real data like the prototype:
// each neighborhood is a circle sized by how many zip codes it covers,
// circles that share zip codes overlap (more shared, more overlap), and
// circles that share nothing never touch. Starts from real locations.
export function circleLayout(list, pointsByVillage) {
  const zips = list.map((v) => new Set((pointsByVillage[v.id] || []).map((p) => p.zip)))
  const zcount = list.map((v, i) => Math.max(1, zips[i].size || Number(v.zip_count) || 1))
  const start = layout(list, 420, 380, 80)
  const n = list.map((v, i) => ({ x: start[i].x, y: start[i].y, r: Math.max(32, Math.min(62, 28 + 7 * Math.sqrt(zcount[i]))) }))
  const pairs = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      let shared = 0
      for (const z of zips[i]) if (zips[j].has(z)) shared++
      const a = n[i], b = n[j], small = Math.min(a.r, b.r)
      let target = null
      if (shared) {
        const ratio = shared / Math.min(zcount[i], zcount[j])
        const overlap = Math.max(16, Math.min(small * 0.6, small * (0.3 + 0.35 * ratio)))
        target = Math.max(Math.abs(a.r - b.r) + 12, Math.max(a.r, b.r) * 0.95, a.r + b.r - overlap)
      }
      pairs.push({ i, j, shared, target })
    }
  }
  for (let pass = 0; pass < 500; pass++) {
    pairs.forEach((p) => {
      const a = n[p.i], b = n[p.j]
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy)
      if (d < 0.01) { dx = 1; dy = 0.5; d = Math.hypot(dx, dy) }
      let want = null
      if (p.target != null) want = p.target
      else if (d < a.r + b.r + 34) want = a.r + b.r + 34
      if (want == null) return
      const k = p.target != null ? 0.25 : 0.5
      const move = ((d - want) / d) * k * 0.5
      a.x += dx * move; a.y += dy * move; b.x -= dx * move; b.y -= dy * move
    })
  }
  // Name pills: under the circle if there is room, else above, else in the middle.
  const labels = []
  const hitsCircle = (r, k) => n.some((c, m) => {
    if (m === k) return false
    const cx = Math.max(r.left, Math.min(c.x, r.right)), cy = Math.max(r.top, Math.min(c.y, r.bottom))
    return Math.hypot(c.x - cx, c.y - cy) < c.r - 4
  })
  const hitsLabel = (r) => labels.some((o) => r.left < o.right && o.left < r.right && r.top < o.bottom && o.top < r.bottom)
  list.forEach((v, k) => {
    const c = n[k], w = labelWidth(v.name)
    // Try the spot under the circle first, then above, then the middle,
    // then a little further out, so no two names ever sit on each other.
    const spots = [[0, c.r + 16], [0, -c.r - 12], [0, 4]]
    for (let step = 1; step <= 6; step++) spots.push([0, c.r + 16 + step * 24], [0, -c.r - 12 - step * 24], [-(w / 2 + c.r * 0.6), 4], [w / 2 + c.r * 0.6, 4])
    const box = (dx, dy) => ({ left: c.x + dx - w / 2, right: c.x + dx + w / 2, top: c.y + dy - 14, bottom: c.y + dy + 7, ty: c.y + dy, tx: c.x + dx })
    let pick = null
    for (const [dx, dy] of spots.slice(0, 3)) { const r = box(dx, dy); if (!hitsLabel(r) && !hitsCircle(r, k)) { pick = r; break } }
    if (!pick) for (const [dx, dy] of spots) { const r = box(dx, dy); if (!hitsLabel(r)) { pick = r; break } }
    if (!pick) pick = box(0, c.r + 16)
    labels.push(pick)
  })
  // One dot per shared border, in the middle of where the two circles overlap.
  const links = pairs.filter((p) => p.shared).map((p) => {
    const a = n[p.i], b = n[p.j], d = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const t = Math.max(a.r * 0.4, Math.min(d - b.r * 0.4, (d * d + a.r * a.r - b.r * b.r) / (2 * d)))
    return { i: p.i, j: p.j, shared: p.shared, mx: a.x + ((b.x - a.x) * t) / d, my: a.y + ((b.y - a.y) * t) / d }
  })
  const pad = 18
  const minX = Math.min(...n.map((c) => c.x - c.r), ...labels.map((l) => l.left)) - pad
  const maxX = Math.max(...n.map((c) => c.x + c.r), ...labels.map((l) => l.right)) + pad
  const minY = Math.min(...n.map((c) => c.y - c.r), ...labels.map((l) => l.top)) - pad
  const maxY = Math.max(...n.map((c) => c.y + c.r), ...labels.map((l) => l.bottom)) + pad
  const w = Math.max(maxX - minX, 280), h = Math.max(maxY - minY, 220)
  const ox = minX - (w - (maxX - minX)) / 2, oy = minY - (h - (maxY - minY)) / 2
  return { nodes: n, labels, links, vb: [ox, oy, w, h] }
}
