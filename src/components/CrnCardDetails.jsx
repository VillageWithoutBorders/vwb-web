import { useState } from 'react'
import { useT } from '../utils/lang'

// Extra lines on a Find Help card for programs from the Community Resource
// Network (CRN). Shows only what the listing says. "Unknown" or blank stays
// honest ("not known yet"), never "Free" or "Available".

const known = (v) => {
  const s = String(v || '').trim()
  return s && !/^unknown$/i.test(s) ? s : ''
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
  const t = useT()
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
      {r.provider_name && <p style={{ color: 'var(--text)', fontWeight: 600 }}>{t('Run by {name}', { name: r.provider_name })}</p>}
      {serves.length > 0 && <Row label={t('Serves')} value={serves.join('; ')} />}
      {r.open_site && <p>{t('Open to anyone, from any county. Located in {place}.', { place: r.open_site })}</p>}
      {r.area_note && <Row label={serves.length > 0 ? t('Also serves') : t('Serves')} value={r.area_note} />}
      {zips.length > 0 && <Row label={t('Also serves these ZIP codes')} value={zips.join(', ')} />}
      {fuzzy && <p>{t('Not sure if your address counts? Call and ask before you go.')}</p>}
      <Row label={t("Who it's for")} value={known(r.eligibility_summary)} />
      {hasMore && (
        <button type="button" className="fh-more" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          {open ? t('Fewer details') : t('More details')}
        </button>
      )}
      {hasMore && open && (
        <div id={panelId}>
          <Row label={t('What it is')} value={known(r.service_type)} />
          <Row label={t('How to get it')} value={known(r.delivery_method)} />
          <Row label={t('How to start')} value={known(r.access_instructions)} />
          <Row label={t('When')} value={known(r.schedule)} />
          {isCrn && <Row label={t('Cost')} value={known(r.cost) || t('not known yet')} />}
          {isCrn && <Row label={t('Appointment needed')} value={known(r.appointment_required) || t('not known yet')} />}
          {isCrn && <Row label={t('Referral needed')} value={known(r.referral_required) || t('not known yet')} />}
          <Row label={t('Getting in')} value={known(r.location_access_notes)} />
          <Row label={t('Good to know')} value={known(r.public_notes)} />
          {known(r.last_verified) && <p style={{ color: 'var(--text-muted)' }}>{t('Last checked:')} {known(r.last_verified)}{isCrn ? ' (' + t('public info') + ')' : ''}</p>}
        </div>
      )}
    </div>
  )
}
