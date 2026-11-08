import { useState, useEffect } from 'react'
import AddressHint from '../components/AddressHint'
import { NEW_ACCOUNT_NOTE, isNewAccountBlock } from '../utils/newAccount'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getMyLocation } from '../utils/location'
import { LocationPrompt } from '../components/LocationPrompt'
import { loadSkillCategories, groupSkills, offerSkillRows, OFFER_ITEM_CATEGORIES, OFFER_ITEMS_GROUP } from '../utils/skillGroups'
import { useGoBack } from '../components/BackLink'
import { useT } from '../utils/lang'
import '../desktop-forms.css'


const fieldStyle = { display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-strong)', fontSize: '1rem' }
const labelStyle = { display: 'block', marginBottom: '0.25rem', marginTop: '1rem', fontWeight: 600, color: 'var(--text-soft)' }

export default function PostOffer() {
  const t = useT()
  const { user, profile, established, organizations } = useAuth()
  const [, setAreaTick] = useState(0)
  const [searchParams] = useSearchParams()
  const managedOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const [postAs, setPostAs] = useState(() => {
    const want = searchParams.get('org')
    return managedOrgs.some((o) => o.id === want) ? want : ''
  })
  const navigate = useNavigate()
  const goBack = useGoBack()

  const [category, setCategory] = useState('')
  const [skillRows, setSkillRows] = useState([])

  useEffect(() => {
    loadSkillCategories().then((rows) => setSkillRows(offerSkillRows(rows)))
  }, [])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.neighborhood) {
      setNeighborhood(profile.neighborhood)
    }
  }, [profile])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!category) { setError(t('Pick a category')); return }
    if (!title.trim()) { setError(t('Add a short title')); return }
    if (!description.trim()) { setError(t('Describe what you are offering')); return }

    setSubmitting(true)

    let lat = null
    let lng = null
    // The area they chose (zip or phone, never a guess). No area, no location.
    const loc = getMyLocation(profile)
    if (loc) { lat = loc.lat; lng = loc.lng }
    // No area, nobody nearby would ever see it (Oct 27). Ask first.
    if (!loc) { setSubmitting(false); setError(t('Add your zip code at the top first, so neighbors near you can see your offer.')); window.scrollTo(0, 0); return }

    const { error: insertErr } = await supabase.from('offers').insert({
      user_id: user.id,
      category,
      title: title.trim(),
      description: description.trim(),
      neighborhood: neighborhood.trim() || null,
      latitude: lat,
      longitude: lng,
      organization_id: postAs || null,
    })

    setSubmitting(false)

    if (insertErr) {
      if (isNewAccountBlock(insertErr)) { setError(t(NEW_ACCOUNT_NOTE)); return }
      console.error('Offer insert error:', insertErr)
      setError(t('Something went wrong. Please try again.'))
      return
    }

    navigate('/skillshare?tab=offers', { state: { message: t('Your offer is shared. Neighbors near you can see it now.') } })
  }

  // Nov 7 (Jade): on a computer the form is on the left and a live preview on the right.
  const postedBy = postAs ? ((managedOrgs.find((o) => o.id === postAs) || {}).name || t('Your group')) : (profile?.display_name || t('A neighbor'))

  return (
    <div className="offer-split" style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div className="ask-left">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <button onClick={() => goBack('/')} aria-label={t('Go back')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}>&#8592;</button>
        <h1 style={{ color: 'var(--accent)', margin: 0, fontSize: '1.5rem' }}>{t('Share an Offer')}</h1>
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        {t('Let your neighbors know what you have to share. Free meals, supplies, labor, rides, anything helps.')}
      </p>

      {/* Oct 27: offers are shown by area, so ask for a zip code up front. */}
      {!getMyLocation(profile) && <LocationPrompt onDone={() => setAreaTick((n) => n + 1)} intro={t('Add your zip code so neighbors near you can see your offer. We never guess where you are.')} />}

      {established === false && (
        <p className="new-account-note" role="status">{t(NEW_ACCOUNT_NOTE)}</p>
      )}

      <form onSubmit={handleSubmit}>
        {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</div>}

        <label style={labelStyle} htmlFor="offer-category">{t('Category')}</label>
        <select id="offer-category" style={fieldStyle} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">{t('Choose a category')}</option>
          <optgroup label={t(OFFER_ITEMS_GROUP)}>
            {OFFER_ITEM_CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
          </optgroup>
          {groupSkills(skillRows).map(g => (
            <optgroup key={g.group} label={t(g.group)}>
              {g.skills.map(c => <option key={c} value={c}>{t(c)}</option>)}
            </optgroup>
          ))}
          <option value="Other">{t('Other')}</option>
        </select>

        <label style={labelStyle} htmlFor="offer-title">{t('What are you offering?')}</label>
        <input id="offer-title" style={fieldStyle} type="text" placeholder={t('e.g. Hot meals Saturday, Free winter coats')} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />

        <label style={labelStyle} htmlFor="offer-desc">{t('Details')}</label>
        <textarea id="offer-desc" style={{ ...fieldStyle, minHeight: '100px', resize: 'vertical' }} placeholder={t('How much do you have? When is it available? Can you deliver or should people pick up?')} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} aria-describedby="offer-desc-hint" />
        {/* Nov 5 (Jade): nothing people post should help anyone find where someone is. */}
        <p id="offer-desc-hint" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '-0.25rem 0 0.75rem' }}>{t('Never put an address here. Share where to meet in a private message.')}</p>
        <AddressHint text={description + ' ' + title} />

        <label style={labelStyle} htmlFor="offer-hood">{t('Neighborhood')}</label>
        <input id="offer-hood" style={fieldStyle} type="text" placeholder={t('Your town or neighborhood')} value={neighborhood} onChange={e => setNeighborhood(e.target.value)} maxLength={100} />

        {managedOrgs.length > 0 && (
          <>
            <label style={labelStyle} htmlFor="offer-postas">{t('Post as')}</label>
            <select id="offer-postas" style={fieldStyle} value={postAs} onChange={e => setPostAs(e.target.value)}>
              <option value="">{t('Myself')}</option>
              {managedOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </>
        )}

        <button type="submit" disabled={submitting} style={{ display: 'block', width: '100%', marginTop: '1.5rem', padding: '0.875rem', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? t('Posting...') : t('Post Offer')}
        </button>
      </form>
      </div>

      <aside className="ask-preview" aria-labelledby="offer-preview-h">
        <h2 id="offer-preview-h" className="ask-preview-h">{t('How neighbors will see it')}</h2>
        <div className="feed-card ask-preview-card">
          <div className="feed-card-top">
            <span className={'offer-badge' + (category ? '' : ' ask-preview-empty')}>{category ? t(category) : t('Category')}</span>
            <span className="feed-card-time">{t('Just now')}</span>
          </div>
          <div className="feed-card-meta">
            <span className={'feed-card-skill' + (title.trim() ? '' : ' ask-preview-empty')}>{title.trim() || t('What you are offering')}</span>
          </div>
          <div className="feed-card-who">
            <span className="feed-card-name">{postedBy}</span>
            {neighborhood.trim() && <span className="feed-card-hood"> {t('in {place}', { place: neighborhood.trim() })}</span>}
          </div>
          <p className={'feed-card-desc' + (description.trim() ? '' : ' ask-preview-empty')}>{description.trim() || t('What you write shows here.')}</p>
        </div>
        <p className="ask-preview-note">{t('Neighbors see your name and the town you typed. Never your address.')}</p>
      </aside>
    </div>
  )
}
