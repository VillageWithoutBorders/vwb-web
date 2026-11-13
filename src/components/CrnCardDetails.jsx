import { useState } from 'react'
import { useT } from '../utils/lang'
import AddressLink from './AddressLink'

// Find Help cards (Nov 13, ADHD-friendly): the four answers first (when, where,
// who, what to bring), one fact per line, long lists folded away. Shows only
// what the listing says. "Unknown" or blank stays honest, never "Free" or "Available".

export const known = (v) => {
  const s = String(v || '').trim()
  return s && !/^unknown$/i.test(s) ? s : ''
}

function Row({ label, value }) {
  if (!value) return null
  return <p><span className="fh-crn-label">{label}:</span> {value}</p>
}

function Fact({ label, children }) {
  if (!children) return null
  return <><dt>{label}</dt><dd>{children}</dd></>
}

// When / Where / Who / Bring. Missing lines are left out, never guessed.
export function ResourceFacts({ r }) {
  const t = useT()
  const [showZips, setShowZips] = useState(false)
  const serves = Array.isArray(r.serves) ? r.serves : []
  const zips = Array.isArray(r.zips) ? r.zips : []
  const who = r.open_site
    ? t('Anyone, from any county')
    : [serves.join('; '), r.area_note].filter(Boolean).join('; ')
  const where = r.address
    ? <AddressLink address={r.address} inline />
    : (r.neighborhood || '')
  const zipId = 'fh-zips-' + r.id
  const hasAny = known(r.schedule) || where || who || zips.length || known(r.requirements)
  if (!hasAny) return null
  return (
    <dl className="fh-facts">
      <Fact label={t('When')}>{known(r.schedule)}</Fact>
      <Fact label={t('Where')}>{where}</Fact>
      {(who || zips.length > 0) && (
        <Fact label={t('Who')}>
          {who}
          {zips.length > 0 && (<>
            {who ? ' ' : ''}
            <button type="button" className="fh-chip-btn" aria-expanded={showZips} aria-controls={zipId} onClick={() => setShowZips(!showZips)}>
              {showZips ? t('Hide ZIP codes') : t('+{n} ZIP codes', { n: zips.length })}
            </button>
            {showZips && <span id={zipId} className="fh-zip-list">{zips.join(', ')}</span>}
          </>)}
        </Fact>
      )}
      <Fact label={t('Bring')}>{known(r.requirements)}</Fact>
    </dl>
  )
}

// An open-to-anyone listing whose "who it's for" only says "anyone" again.
const sameAsAnyone = (r) => {
  const e = known(r.eligibility_summary)
  return Boolean(r.open_site) && e.length < 90 && /\b(anyone|everyone|all are|regardless)\b/i.test(e)
    && !/\b(id|proof|income|must|only|bring|age|veteran|referral)\b/i.test(e)
}

// The rest of a listing: who runs it, the fine print, and More details.
export default function CrnCardDetails({ r }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const isCrn = r.source === 'crn'
  const zips = Array.isArray(r.zips) ? r.zips : []
  const fuzzy = Boolean(r.area_note) || zips.length > 0
  const panelId = 'crn-more-' + r.id
  const unknown = isCrn ? [
    !known(r.cost) && t('cost'),
    !known(r.appointment_required) && t('appointment'),
    !known(r.referral_required) && t('referral'),
  ].filter(Boolean) : []
  const hasMore = known(r.service_type) || known(r.delivery_method) || known(r.access_instructions)
    || known(r.cost) || known(r.appointment_required) || known(r.referral_required)
    || known(r.location_access_notes) || known(r.public_notes) || known(r.last_verified) || unknown.length > 0
  const hasAny = r.provider_name || fuzzy || known(r.eligibility_summary) || hasMore
  if (!hasAny) return null
  return (
    <div className="fh-crn" style={{ margin: '0.2rem 0 0.35rem' }}>
      {r.provider_name && <p style={{ color: 'var(--text)', fontWeight: 600 }}>{t('Run by {name}', { name: r.provider_name })}</p>}
      {fuzzy && <p>{t('Not sure if your address counts? Call and ask before you go.')}</p>}
      <Row label={t("Who it's for")} value={sameAsAnyone(r) ? '' : known(r.eligibility_summary)} />
      {hasMore && (
        <button type="button" className="fh-more" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          {open ? t('Fewer details') : t('More details')} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      )}
      {hasMore && open && (
        <div id={panelId}>
          <Row label={t('What it is')} value={known(r.service_type)} />
          <Row label={t('How to get it')} value={known(r.delivery_method)} />
          <Row label={t('How to start')} value={known(r.access_instructions)} />
          <Row label={t('Cost')} value={known(r.cost)} />
          <Row label={t('Appointment needed')} value={known(r.appointment_required)} />
          <Row label={t('Referral needed')} value={known(r.referral_required)} />
          {unknown.length > 0 && <Row label={t('Not known yet')} value={unknown.join(', ')} />}
          <Row label={t('Getting in')} value={known(r.location_access_notes)} />
          <Row label={t('Good to know')} value={known(r.public_notes)} />
          {known(r.last_verified) && <p style={{ color: 'var(--text-muted)' }}>{t('Last checked:')} {known(r.last_verified)}{isCrn ? ' (' + t('public info') + ')' : ''}</p>}
        </div>
      )}
    </div>
  )
}
