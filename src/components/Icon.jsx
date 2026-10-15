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

export default function Icon({ name, size = 22, className = '', label, style }) {
  const n = iconName(name)
  if (!n) return name ? <span className={('vwb-icon-em ' + className).trim()} aria-hidden="true" style={style}>{name}</span> : null
  return (
    <img
      className={('vwb-icon ' + className).trim()}
      src={'/art/icons/' + n + '.svg'}
      alt={label || ''}
      aria-hidden={label ? undefined : 'true'}
      width={size}
      height={size}
      draggable="false"
      style={style}
    />
  )
}
