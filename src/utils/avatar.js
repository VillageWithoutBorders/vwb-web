import { createAvatar } from '@dicebear/core'
import * as avataaars from '@dicebear/avataaars'
import * as thumbs from '@dicebear/thumbs'

// Nov 11 (Jade): avatars are drawn on the phone, the same look as before. Nothing is sent
// to an outside website, and nobody's account id leaves the app.
// Saved avatars are still the old DiceBear address (helper_profiles.avatar_url), so no
// one has to remake theirs. This reads the choices out of that address and draws it here.
// Code: DiceBear (MIT). Art: Avataaars by Pablo Stanley (free for personal and commercial
// use), Thumbs by DiceBear (CC0).
const STYLES = { avataaars, thumbs }
const cache = new Map()

// Only plain choices get through: names made of letters and numbers, and real numbers.
// Anything else in a saved address is dropped, so a made-up address can't sneak code into the drawing.
const NUMBER_KEY = /^(radius|size|scale|rotate|translateX|translateY)$|Probability$/
const PLAIN = /^[A-Za-z0-9]{1,40}$/
function parseOptions(query) {
  const opts = {}
  for (const [rawKey, value] of new URLSearchParams(query)) {
    const key = rawKey.endsWith('[]') ? rawKey.slice(0, -2) : rawKey
    if (!/^[A-Za-z]{1,40}$/.test(key)) continue
    if (key === 'seed') { opts.seed = value.slice(0, 120); continue }
    if (NUMBER_KEY.test(key)) {
      const n = Number(value)
      if (value.trim() !== '' && Number.isFinite(n)) opts[key] = Math.max(-360, Math.min(360, n))
      continue
    }
    if (value === 'true' || value === 'false') { opts[key] = value === 'true'; continue }
    const items = value.split(',').filter((v) => PLAIN.test(v))
    if (items.length) opts[key] = [...(opts[key] || []), ...items].slice(0, 30)
  }
  return opts
}

// url: the saved avatar address (or nothing). seed: used for the plain avatar when there is none.
// Anything that isn't a DiceBear address is returned as is (the page's safety rules still decide
// which websites a picture may come from).
export function avatarSrc(url, seed) {
  const key = url ? 'u:' + url : 's:' + (seed || 'default')
  if (cache.has(key)) return cache.get(key)
  let out = url || ''
  try {
    if (!url) {
      out = createAvatar(thumbs, { seed: String(seed || 'default') }).toDataUriSync()
    } else {
      const m = /^https:\/\/api\.dicebear\.com\/\d+\.x\/([a-z-]+)\/svg\?(.*)$/i.exec(url)
      if (m) {
        // A style we don't carry gets the plain avatar, drawn here too.
        out = STYLES[m[1]] ? createAvatar(STYLES[m[1]], parseOptions(m[2])).toDataUriSync()
          : createAvatar(thumbs, { seed: String(seed || 'default') }).toDataUriSync()
      }
    }
  } catch (err) {
    console.error('Drawing the avatar failed:', err)
  }
  if (cache.size > 500) cache.clear()
  cache.set(key, out)
  return out
}
