import { useState } from 'react'

// Extra lines on a Find Help card for programs from the Community Resource
// Network (CRN). Shows only what the listing says. "Unknown" or blank stays
// honest ("not known yet"), never "Free" or "Available".

const known = (v) => {
  const t = String(v || '').trim()
  return t && !/^unknown$/i.test(t) ? t : ''
}

function Row({ label, value }) {
  if (!value) return null
  return <p><span className="fh-crn-label">{label}:</span> {value}</p>
}

// CRN listings carry a lot of detail. The card shows who runs it and where
// it serves; the rest opens with "More details" so the list stays easy to scan.
// Some programs serve only some towns in a county (area_note) or list extra
// ZIP codes (zips). Those never say "you qualify": the card asks people to call.
export default function CrnCardDetails({ r }) {
  const [open, setOpen] = useState(false)
  const isCrn = r.source === 'crn'
  const hasAny = isCrn || r.provider_name || r.eligibility_summary || r.delivery_method || r.cost || r.schedule
  if (!hasAny) return null
  const serves = Array.isArray(r.serves) ? r.serves : []
  const zips = Array.isArray(r.zips) ? r.zips : []
  const fuzzy = Boolean(r.area_note) || zips.length > 0
  const panelId = 'crn-more-' + r.id
  const hasMore = isCrn || r.service_type || r.delivery_method || r.access_instructions || r.schedule
    || r.location_access_notes || r.public_notes || known(r.last_verified)
  return (
    <div className="fh-crn" style={{ margin: '0.2rem 0 0.35rem' }}>
      {r.provider_name && <p style={{ color: 'var(--text)', fontWeight: 600 }}>Run by {r.provider_name}</p>}
      {serves.length > 0 && <Row label="Serves" value={serves.join('; ')} />}
      {r.open_site && <p>Open to anyone, from any county. Located in {r.open_site}.</p>}
      {r.area_note && <Row label={serves.length > 0 ? 'Also serves' : 'Serves'} value={r.area_note} />}
      {zips.length > 0 && <Row label="Also serves these ZIP codes" value={zips.join(', ')} />}
      {fuzzy && <p>Not sure if your address counts? Call and ask before you go.</p>}
      <Row label="Who it's for" value={known(r.eligibility_summary)} />
      {hasMore && (
        <button type="button" className="fh-more" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          {open ? 'Fewer details' : 'More details'}
        </button>
      )}
      {hasMore && open && (
        <div id={panelId}>
          <Row label="What it is" value={known(r.service_type)} />
          <Row label="How to get it" value={known(r.delivery_method)} />
          <Row label="How to start" value={known(r.access_instructions)} />
          <Row label="When" value={known(r.schedule)} />
          {isCrn && <Row label="Cost" value={known(r.cost) || 'not known yet'} />}
          {isCrn && <Row label="Appointment needed" value={known(r.appointment_required) || 'not known yet'} />}
          {isCrn && <Row label="Referral needed" value={known(r.referral_required) || 'not known yet'} />}
          <Row label="Getting in" value={known(r.location_access_notes)} />
          <Row label="Good to know" value={known(r.public_notes)} />
          {known(r.last_verified) && <p style={{ color: 'var(--text-muted)' }}>Last checked: {known(r.last_verified)}{isCrn ? ' (public info)' : ''}</p>}
        </div>
      )}
    </div>
  )
}
