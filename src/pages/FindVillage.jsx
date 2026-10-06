import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// Find your village chat, join one, or start one if none is near you.
// Shows village names, rough sizes, and distance only. Never people.

const NEAR_MILES = 45

const WORDS = {
  signin: 'Please sign in first.',
  missing: 'We could not find that village. It may have closed.',
  noprofile: 'We could not find your profile. Try again in a moment.',
  needzip: 'Add your zip code on your Profile first, so we can find villages near you.',
  toofar: 'That village is too far from your zip code to join.',
  exists: 'A village is already near you. Search again and you will find it.',
  already: 'You already started a village. Ask an admin if it needs changes.',
}

function countText(v) {
  if (v.just_starting || v.member_count == null) return 'Just getting started'
  return v.member_count + ' neighbors'
}

export default function FindVillage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [searched, setSearched] = useState('')
  const [villages, setVillages] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const hasZip = !!profile?.zip_code

  async function load(term) {
    setLoading(true); setError('')
    const { data, error: err } = await supabase.rpc('find_villages', { p_search: term || null })
    if (err) {
      console.error('Failed to find villages:', err)
      setError('We could not load the villages. Try again in a moment.')
      setVillages([]); setLoading(false); return
    }
    setVillages(data || [])
    setSearched(term || '')
    setLoading(false)
  }

  useEffect(() => { load('') }, [])

  function search(e) {
    e.preventDefault()
    load(text.trim())
  }

  // After joining or starting, open the village's chat.
  async function openMyVillage() {
    await refreshProfile()
    const { data: me } = await supabase.from('helper_profiles').select('village_id').eq('user_id', user.id).maybeSingle()
    let boardId = null
    if (me?.village_id) {
      const { data: b } = await supabase.from('campfire_boards').select('id').eq('village_id', me.village_id).maybeSingle()
      boardId = b?.id || null
    }
    navigate(boardId ? '/campfire?board=' + boardId : '/campfire')
  }

  async function join(v) {
    if (busy) return
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc('join_village', { p_village: v.id })
    if (err) { console.error('Failed to join village:', err); setError('Could not join. Try again.'); setBusy(false); return }
    if (data !== 'ok') { setError(WORDS[data] || 'Could not join. Try again.'); setBusy(false); return }
    await openMyVillage()
    setBusy(false)
  }

  async function startOne() {
    if (busy) return
    if (!confirm('Start a village chat for your area? We name it after your town and tell the admins. Neighbors within ' + NEAR_MILES + ' miles can join it.')) return
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc('start_my_village')
    if (err) { console.error('Failed to start village:', err); setError('Could not start a village. Try again.'); setBusy(false); return }
    if (data !== 'ok') {
      setError(WORDS[data] || 'Could not start a village. Try again.')
      setBusy(false)
      if (data === 'exists') load('')
      return
    }
    await openMyVillage()
    setBusy(false)
  }

  const searching = searched !== ''
  // With no search, show only villages you can join or already belong to.
  const shown = searching ? villages : villages.filter(v => v.can_join || v.is_mine)
  const nothingNear = !loading && !error && !searching && hasZip && shown.length === 0

  return (
    <div className="cal-page hub-page">
      <Link to="/campfire" className="hub-back">&#8592; Village Square</Link>
      <h1 className="hub-org-name">Find your village chat</h1>
      <p className="cal-sub">A village chat is for neighbors in your area who chose to join. We use your zip code to find villages near you.</p>

      {!hasZip && (
        <section className="cal-box" aria-labelledby="fv-zip">
          <h2 id="fv-zip">Add your zip code first</h2>
          <p className="cal-sub">Your zip code is how we find villages near you. We never show it to anyone.</p>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/profile')}>Go to my Profile</button>
        </section>
      )}

      <form onSubmit={search} style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0' }}>
        <label htmlFor="fv-search" className="sr-only">Search villages by name</label>
        <input id="fv-search" type="search" value={text} onChange={e => setText(e.target.value)} placeholder="Search by town or village name" autoComplete="off" style={{ flex: 1, minHeight: '44px', boxSizing: 'border-box', padding: '0 0.75rem', fontSize: '1rem' }} />
        <button type="submit" className="btn btn-outline" style={{ minHeight: '44px' }}>Search</button>
      </form>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="cal-empty">Loading...</p>}

      <div aria-live="polite">
        {!loading && !error && searching && shown.length === 0 && <p className="cal-empty">No villages match &quot;{searched}&quot;.</p>}

        {!loading && shown.length > 0 && (
          <section className="hub-section" aria-labelledby="fv-list">
            <div className="hub-section-head"><h2 id="fv-list">{searching ? 'Villages that match' : 'Villages near you'}</h2></div>
            {shown.map(v => (
              <div key={v.id} className="cal-card" style={{ display: 'block' }}>
                <span className="cal-card-title">{v.name}{v.is_mine ? ' · yours' : ''}</span>
                <span className="cal-card-meta" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {v.region_label ? v.region_label + ' · ' : ''}{countText(v)}{v.miles_away != null ? ' · about ' + v.miles_away + ' miles away' : ''}
                </span>
                {v.is_mine && profile?.village_opt_in === true && (
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={openMyVillage}>Open my village chat</button>
                )}
                {!(v.is_mine && profile?.village_opt_in === true) && v.can_join && (
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => join(v)}>Join this village chat</button>
                )}
                {!v.is_mine && !v.can_join && (
                  <p className="cal-sub" style={{ margin: 0 }}>{hasZip ? 'This village is too far from your zip code to join.' : 'Add your zip code to join.'}</p>
                )}
              </div>
            ))}
          </section>
        )}

        {nothingNear && (
          <section className="cal-box" aria-labelledby="fv-start">
            <h2 id="fv-start">No village chat near you yet</h2>
            <p className="cal-sub">You can start one for your area. We name it after your town and tell the admins. Neighbors within {NEAR_MILES} miles can join it.</p>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={startOne}>Start a village for my area</button>
          </section>
        )}
      </div>
    </div>
  )
}
