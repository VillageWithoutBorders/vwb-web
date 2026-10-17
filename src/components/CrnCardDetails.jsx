// Extra lines on a Find Help card for programs from the Community Resource
// Network (CRN). Shows only what the listing says. "Unknown" or blank stays
// honest ("not known yet"), never "Free" or "Available".

const known = (v) => {
  const t = String(v || '').trim()
  return t && !/^unknown$/i.test(t) ? t : ''
}

const line = { color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.15rem 0', lineHeight: 1.45 }
const lab = { color: 'var(--text-muted)', fontWeight: 600 }

function Row({ label, value }) {
  if (!value) return null
  return <p style={line}><span style={lab}>{label}:</span> {value}</p>
}

export default function CrnCardDetails({ r }) {
  const isCrn = r.source === 'crn'
  const hasAny = isCrn || r.provider_name || r.eligibility_summary || r.delivery_method || r.cost || r.schedule
  if (!hasAny) return null
  const serves = Array.isArray(r.serves) ? r.serves : []
  return (
    <div style={{ margin: '0.2rem 0 0.35rem' }}>
      {r.provider_name && <p style={{ ...line, color: 'var(--text)', fontWeight: 600 }}>Run by {r.provider_name}</p>}
      {serves.length > 0 && <Row label="Serves" value={serves.join('; ')} />}
      <Row label="What it is" value={known(r.service_type)} />
      <Row label="Who it's for" value={known(r.eligibility_summary)} />
      <Row label="How to get it" value={known(r.delivery_method)} />
      <Row label="How to start" value={known(r.access_instructions)} />
      <Row label="When" value={known(r.schedule)} />
      {isCrn && <Row label="Cost" value={known(r.cost) || 'not known yet'} />}
      {isCrn && <Row label="Appointment needed" value={known(r.appointment_required) || 'not known yet'} />}
      {isCrn && <Row label="Referral needed" value={known(r.referral_required) || 'not known yet'} />}
      <Row label="Getting in" value={known(r.location_access_notes)} />
      <Row label="Good to know" value={known(r.public_notes)} />
      {known(r.last_verified) && <p style={{ ...line, color: 'var(--text-muted)', fontSize: '0.8rem' }}>Last checked: {known(r.last_verified)}</p>}
    </div>
  )
}
