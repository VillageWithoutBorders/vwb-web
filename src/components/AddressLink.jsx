import { mapLinkFor } from '../utils/calendar'

// A street address that opens the person's map app when tapped.
// The same link everywhere an address shows: iPhone and iPad open Apple
// Maps, Android opens its default map app, computers open Google Maps.
// `inline` keeps it inside a line of text (for example after a phone number).
export default function AddressLink({ address, inline = false }) {
  const href = mapLinkFor(address)
  if (!href) return address || null
  return (
    <a
      href={href}
      {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      style={{ color: '#4ecca3', overflowWrap: 'anywhere', ...(inline ? {} : { display: 'inline-flex', alignItems: 'center', minHeight: 44 }) }}
    >{address}</a>
  )
}
