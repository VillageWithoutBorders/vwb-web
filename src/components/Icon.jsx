import { EMOJI_ICONS } from '../data/iconMap'

// A picture from public/art/icons, in the same cream-badge style as the village map.
// name can be a file name ("campfire") or an emoji ("🔥"); emoji are looked up in
// data/iconMap.js. If there is no picture, the emoji itself shows instead.
// Decorative by default (hidden from screen readers). Pass label to have it read.
export function iconName(v) {
  if (!v) return null
  if (/^[a-z0-9-]+$/.test(v)) return v
  return EMOJI_ICONS[String(v).replace(/[️\s]/g, '')] || null
}

// Nov 8: Jade's own watercolor pictures. When public/art/icons has <name>.webp,
// that painting is used and the cream circle is drawn around it (.vwb-icon-painted),
// so the painting is just the object. Pictures not painted yet keep their .svg.
// eslint-disable-next-line no-undef
const PAINTED = new Set(typeof __PAINTED_ICONS__ !== 'undefined' ? __PAINTED_ICONS__ : [])
export function isPainted(n) { return PAINTED.has(n) }
export function iconSrc(n) { return '/art/icons/' + n + (PAINTED.has(n) ? '.webp' : '.svg') }
export function iconClass(n, base = '') { return (base + (PAINTED.has(n) ? ' vwb-icon-painted' : '')).trim() }

export default function Icon({ name, size = 22, className = '', label, style }) {
  const n = iconName(name)
  if (!n) return name ? <span className={('vwb-icon-em ' + className).trim()} aria-hidden="true" style={style}>{name}</span> : null
  return (
    <img
      className={iconClass(n, 'vwb-icon ' + className)}
      src={iconSrc(n)}
      alt={label || ''}
      aria-hidden={label ? undefined : 'true'}
      width={size}
      height={size}
      draggable="false"
      style={style}
    />
  )
}
