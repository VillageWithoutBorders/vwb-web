import { useState, useEffect } from 'react'
import { NEW_ACCOUNT_NOTE, isNewAccountBlock } from '../utils/newAccount'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getMyLocation } from '../utils/location'
import { loadSkillCategories, groupSkills, offerSkillRows, OFFER_ITEM_CATEGORIES, OFFER_ITEMS_GROUP } from '../utils/skillGroups'


const fieldStyle = { display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #444', background: '#1a1a1a', color: '#fff', fontSize: '1rem' }
const labelStyle = { display: 'block', marginBottom: '0.25rem', marginTop: '1rem', fontWeight: 600, color: '#ccc' }

export default function PostOffer() {
  const { user, profile, established, organizations } = useAuth()
  const [searchParams] = useSearchParams()
  const managedOrgs = organizations.filter((o) => o.role === 'admin' || o.role === 'organizer')
  const [postAs, setPostAs] = useState(() => {
    const want = searchParams.get('org')
    return managedOrgs.some((o) => o.id === want) ? want : ''
  })
  const navigate = useNavigate()

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

    if (!category) { setError('Pick a category'); return }
    if (!title.trim()) { setError('Add a short title'); return }
    if (!description.trim()) { setError('Describe what you are offering'); return }

    setSubmitting(true)

    let lat = null
    let lng = null
    // The area they chose (zip or phone, never a guess). No area, no location.
    const loc = getMyLocation(profile)
    if (loc) { lat = loc.lat; lng = loc.lng }

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
      if (isNewAccountBlock(insertErr)) { setError(NEW_ACCOUNT_NOTE); return }
      console.error('Offer insert error:', insertErr)
      setError('Something went wrong. Please try again.')
      return
    }

    navigate('/skillshare?tab=offers')
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <button onClick={() => navigate(-1)} aria-label="Go back" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}>&#8592;</button>
        <h1 style={{ color: '#4ecca3', margin: 0, fontSize: '1.5rem' }}>Share an Offer</h1>
      </div>

      <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>
        Let your neighbors know what you have to share. Free meals, supplies, labor, rides, anything helps.
      </p>

      {established === false && (
        <p className="new-account-note" role="status">{NEW_ACCOUNT_NOTE}</p>
      )}

      <form onSubmit={handleSubmit}>
        {error && <div style={{ background: '#5c1a1a', color: '#ff9999', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</div>}

        <label style={labelStyle} htmlFor="offer-category">Category</label>
        <select id="offer-category" style={fieldStyle} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Choose a category</option>
          <optgroup label={OFFER_ITEMS_GROUP}>
            {OFFER_ITEM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </optgroup>
          {groupSkills(skillRows).map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.skills.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          ))}
          <option value="Other">Other</option>
        </select>

        <label style={labelStyle} htmlFor="offer-title">What are you offering?</label>
        <input id="offer-title" style={fieldStyle} type="text" placeholder="e.g. Hot meals Saturday, Free winter coats" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />

        <label style={labelStyle} htmlFor="offer-desc">Details</label>
        <textarea id="offer-desc" style={{ ...fieldStyle, minHeight: '100px', resize: 'vertical' }} placeholder="How much do you have? When is it available? Can you deliver or should people pick up?" value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} />

        <label style={labelStyle} htmlFor="offer-hood">Neighborhood</label>
        <input id="offer-hood" style={fieldStyle} type="text" placeholder="e.g. Ringgold, Tunnel Hill, Fort Oglethorpe" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} maxLength={100} />

        {managedOrgs.length > 0 && (
          <>
            <label style={labelStyle} htmlFor="offer-postas">Post as</label>
            <select id="offer-postas" style={fieldStyle} value={postAs} onChange={e => setPostAs(e.target.value)}>
              <option value="">Myself</option>
              {managedOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </>
        )}

        <button type="submit" disabled={submitting} style={{ display: 'block', width: '100%', marginTop: '1.5rem', padding: '0.875rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Posting...' : 'Post Offer'}
        </button>
      </form>
    </div>
  )
}
