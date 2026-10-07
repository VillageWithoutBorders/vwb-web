import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import VillageRiskDialog from '../components/VillageRiskDialog'

// Find village chats, join as many as are near you, or start one if none is near.
// Shows village names, rough sizes, and distance only. Never people.
// Joining always goes through the risk warning first.

const NEAR_MILES = 45

const WORDS = {
  signin: 'Please sign in first.',
  missing: 'We could not find that village. It may have closed.',
  noprofile: 'We could not find your profile. Try again in a moment.',
  needzip: 'Add your zip code on your Profile first, so we can find villages near you.',
  toofar: 'That village is too far from your zip code to join.',
  exists: 'A village is already near you. Search again and you will find it.',
  already: 'You already started a village. Ask an admin if it needs changes.',
  needagree: 'Please read and agree to the warning first.',
  removed: 'Members of this village chat asked for you to be removed. If you think this is a mistake, contact VWB.',
}

function countText(v) {
  if (v.just_starting || v.member_count == null) return 'Just getting started'
  return v.member_count + ' neighbors'
}

export default function FindVillage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [welcome, setWelcome] = useState(null)
  const [text, setText] = useState('')
  const [searched, setSearched] = useState('')
  const [villages, setVillages] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The warning: { type: 'join', village } or { type: 'start' }
  const [risk, setRisk] = useState(null)
  const [riskError, setRiskError] = useState('')

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

  // Coming from the map with ?join=<village id>: open the warning for that village.
  const joinParam = searchParams.get('join')
  useEffect(() => {
    if (!joinParam || loading || risk) return
    const v = villages.find(x => x.id === joinParam)
    if (v && v.can_join && !v.is_mine) setRisk({ type: 'join', village: v })
    else if (v && v.is_mine && v.board_id) navigate('/campfire?board=' + v.board_id, { replace: true })
  }, [joinParam, loading, villages])

  function search(e) {
    e.preventDefault()
    load(text.trim())
  }

  // Open a village chat you already joined.
  function openChat(v) {
    navigate(v.board_id ? '/campfire?board=' + v.board_id : '/campfire')
  }

  // After joining, ask once whether they want notifications for that chat, then
  // open it with the intro box filled in. A village you joined (or started) is
  // the newest row in your own membership list.
  async function finishJoin(villageId) {
    await refreshProfile()
    let vid = villageId
    if (!vid) {
      const { data: mine } = await supabase.from('village_members').select('village_id').eq('user_id', user.id).order('joined_at', { ascending: false }).limit(1)
      vid = mine?.[0]?.village_id
    }
    if (!vid) { navigate('/campfire'); return }
    const { data: b } = await supabase.from('campfire_boards').select('id, name').eq('village_id', vid).maybeSingle()
    if (!b) { navigate('/campfire'); return }
    const { data: saved } = await supabase.from('campfire_board_user_settings').select('alerts').eq('user_id', user.id).eq('board_id', b.id).maybeSingle()
    if (saved) { navigate('/campfire?board=' + b.id + '&intro=1'); return }
    setWelcome(b)
  }

  async function answerAlerts(yes) {
    if (busy || !welcome) return
    setBusy(true); setError('')
    const { error: err } = await supabase.from('campfire_board_user_settings').upsert(
      { user_id: user.id, board_id: welcome.id, alerts: yes ? 'all' : 'off', muted_until: null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,board_id' }
    )
    if (err) { console.error('Failed to save alert choice:', err); setError('Could not save that. Try again.'); setBusy(false); return }
    navigate('/campfire?board=' + welcome.id + '&intro=1')
  }

  // The warning's "I agree" button. The agreement is sent to the database, which checks it.
  async function agreeAndGo() {
    if (busy || !risk) return
    setBusy(true); setRiskError('')
    const starting = risk.type === 'start'
    const { data, error: err } = starting
      ? await supabase.rpc('start_my_village', { p_agreed: true })
      : await supabase.rpc('join_village', { p_village: risk.village.id, p_agreed: true })
    if (err) { console.error('Failed to join village:', err); setRiskError('Could not join. Try again.'); setBusy(false); return }
    if (data !== 'ok') {
      setBusy(false)
      setRisk(null)
      setError(WORDS[data] || 'Could not join. Try again.')
      if (data === 'exists') load('')
      return
    }
    const villageId = starting ? null : risk.village.id
    setRisk(null)
    await finishJoin(villageId)
    setBusy(false)
  }

  function join(v) { setRiskError(''); setRisk({ type: 'join', village: v }) }
  function startOne() { setRiskError(''); setRisk({ type: 'start' }) }

  const searching = searched !== ''
  // With no search, show only villages you can join or already belong to.
  const shown = searching ? villages : villages.filter(v => v.can_join || v.is_mine)
  const nothingNear = !loading && !error && !searching && hasZip && shown.length === 0

  if (welcome) {
    return (
      <div className="cal-page hub-page">
        <h1 className="hub-org-name">You joined {welcome.name}</h1>
        <section className="cal-box" aria-labelledby="fv-alerts">
          <h2 id="fv-alerts">Get a notification for new messages?</h2>
          <p className="cal-sub">We send one notification after the chat goes quiet, not one for every message. You can change this any time in the Village Square settings.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} disabled={busy} onClick={() => answerAlerts(true)}>Yes, notify me</button>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => answerAlerts(false)}>Not now</button>
        </section>
      </div>
    )
  }

  return (
    <div className="cal-page hub-page">
      <Link to="/campfire" className="hub-back">&#8592; Village Square</Link>
      <h1 className="hub-org-name">Find village chats</h1>
      <p className="cal-sub">A village chat is for neighbors in your area. Anyone with an account can join. You can join more than one, especially where villages overlap. We use your zip code to find villages near you.</p>
      <p style={{ margin: '0 0 0.75rem' }}><Link to="/villages">See the village map</Link></p>

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
                <span className="cal-card-title">{v.name}{v.is_mine ? ' · joined' : ''}</span>
                <span className="cal-card-meta" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {v.region_label ? v.region_label + ' · ' : ''}{countText(v)}{v.miles_away != null ? ' · about ' + v.miles_away + ' miles away' : ''}
                </span>
                {v.is_mine && (
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => openChat(v)}>Open this village chat</button>
                )}
                {!v.is_mine && v.can_join && (
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

      {risk && (
        <VillageRiskDialog
          villageName={risk.type === 'join' ? risk.village.name : 'your new village chat'}
          busy={busy}
          error={riskError}
          onAgree={agreeAndGo}
          onCancel={() => { setRisk(null); setRiskError('') }}
        />
      )}
    </div>
  )
}
