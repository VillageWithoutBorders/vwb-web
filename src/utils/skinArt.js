import { activeSkin } from './skin'

// Skin art (Nov 11, Jade). Each skin can have its own drawings, saved in
// public/art/skins/<skin>/ with the same folder, name and size as today:
//   /art/village-path/spot-chat.webp -> /art/skins/space/village-path/spot-chat.webp
// A picture not drawn yet shows today's picture. Positions never change.
// vite.config.js lists the files when the app builds or `npm run dev` starts
// (__SKIN_ART__), so restart dev after adding a drawing. Same as the painted icons.
const HAVE = new Set(typeof __SKIN_ART__ !== 'undefined' ? __SKIN_ART__ : [])

export function skinArt(src) {
  if (!src || !HAVE.size || !src.startsWith('/art/')) return src
  const sk = activeSkin()
  if (sk === 'home') return src
  const own = '/art/skins/' + sk + src.slice(4)
  return HAVE.has(own) ? own : src
}
