import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import VillageRiskDialog from '../components/VillageRiskDialog'

// Find village chats, join as many as cover your zip code, or start your own.
// A village is a list of zip codes. You can join when your zip is on the list.
// Shows village names, towns, and rough sizes only. Never people.
// Joining or starting always goes through the risk warning first.

const REACH_CHOICES = [5, 10, 15, 25]

const WORDS = {
  signin: 'Please sign in first.',
  missing: 'We could not find that village. It may have closed.',
  noprofile: 'We could not find your profile. Try again in a moment.',
  needzip: 'Add your zip code on your Profile first, so we can find villages near you.',
  toofar: 'Your zip code is not on that village\u2019s list, so you cannot join it.',
  exists: 'A village already centers on your zip code. Search for it and join that one.',
  already: 'You already started 3 villages. Ask an admin if one needs changes.',
  badzip: 'One of those zip codes was not found. Try again.',
  toomany: 'A village can have up to 40 zip codes. Untick a few and try again.',
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
  // Starting a village: name, how far to suggest zips, and which zips are ticked.
  const [starting, setStarting] = useState(false)
  const [startName, setStartName] = useState('')
  const [reach, setReach] = useState(10)
  const [suggested, setSuggested] = useState([])
  const [ticked, setTicked] = useState({})
  const [reachBusy, setReachBusy] = useState(false)

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

  // Zips near mine. All ticked to begin with; the starter unticks what does not fit.
  async function loadReach(miles) {
    if (!profile?.zip_code) return
    setReachBusy(true)
    const { data, error: err } = await supabase.rpc('village_reach', { p_zip: profile.zip_code, p_miles: miles })
    setReachBusy(false)
    if (err) { console.error('Failed to load nearby zips:', err); setError('We could not load nearby zip codes. Try again.'); return }
    const rows = (data || []).slice(0, 40)
    setSuggested(rows)
    const t = {}
    rows.forEach(r => { t[r.zip] = true })
    setTicked(t)
  }

  function openStart() {
    setError(''); setStarting(true)
    loadReach(reach)
  }

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
    const isStart = risk.type === 'start'
    const zips = suggested.filter(r => ticked[r.zip]).map(r => r.zip)
    const { data, error: err } = isStart
      ? await supabase.rpc('start_my_village', { p_agreed: true, p_name: startName.trim() || null, p_zips: zips })
      : await supabase.rpc('join_village', { p_village: risk.village.id, p_agreed: true })
    if (err) { console.error('Failed to join village:', err); setRiskError('Could not join. Try again.'); setBusy(false); return }
    if (data !== 'ok') {
      setBusy(false)
      setRisk(null)
      setError(WORDS[data] || 'Could not join. Try again.')
      if (data === 'exists') { setStarting(false); load('') }
      return
    }
    const villageId = isStart ? null : risk.village.id
    setRisk(null)
    setStarting(false)
    await finishJoin(villageId)
    setBusy(false)
  }

  function join(v) { setRiskError(''); setRisk({ type: 'join', village: v }) }
  function startOne() { setRiskError(''); setRisk({ type: 'start' }) }
  const tickedCount = suggested.filter(r => ticked[r.zip]).length

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
      <p className="cal-sub">A village chat is for neighbors in the zip codes it covers. Anyone with an account can join a village that has their zip code. You can join more than one, especially where villages overlap. Any neighbor can start one.</p>
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
                  {countText(v)}{v.zip_count ? ' · ' + v.zip_count + ' zip codes' : ''}{v.miles_away != null ? ' · about ' + v.miles_away + ' miles away' : ''}
                </span>
                {v.towns && <span className="cal-card-meta" style={{ display: 'block', marginBottom: '0.5rem' }}>Covers {v.towns}</span>}
                {v.is_mine && (
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => openChat(v)}>Open this village chat</button>
                )}
                {!v.is_mine && v.can_join && (
                  <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => join(v)}>Join this village chat</button>
                )}
                {!v.is_mine && !v.can_join && (
                  <p className="cal-sub" style={{ margin: 0 }}>{hasZip ? 'Your zip code is not on this village\u2019s list.' : 'Add your zip code to join.'}</p>
                )}
              </div>
            ))}
          </section>
        )}

        {nothingNear && <p className="cal-sub">No village covers your zip code yet. You can start one below.</p>}

        {hasZip && !loading && !starting && (
          <section className="cal-box" aria-labelledby="fv-start">
            <h2 id="fv-start">{shown.length === 0 ? 'Start a village for your area' : 'Do not see your town?'}</h2>
            <p className="cal-sub">Any neighbor can start a village. You choose the name and the zip codes it covers. The admins are told when a new one starts.</p>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={openStart}>Start a village</button>
          </section>
        )}

        {hasZip && starting && (
          <section className="cal-box" aria-labelledby="fv-startform">
            <h2 id="fv-startform">Start a village</h2>
            <label htmlFor="fv-name" style={{ display: 'block', margin: '0.5rem 0 0.25rem' }}>Village name</label>
            <input id="fv-name" type="text" value={startName} onChange={e => setStartName(e.target.value)} maxLength={40} placeholder="Leave blank to use your town" autoComplete="off" style={{ width: '100%', minHeight: '44px', boxSizing: 'border-box', padding: '0 0.75rem', fontSize: '1rem' }} />
            <p className="cal-sub" style={{ margin: '0.75rem 0 0.25rem' }}>Zip codes near {profile.zip_code}. Tick the ones this village covers. Your own zip code stays on the list.</p>
            <div role="group" aria-label="Show zip codes within" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0 0 0.5rem' }}>
              {REACH_CHOICES.map(m => (
                <button key={m} type="button" className={'btn ' + (reach === m ? 'btn-primary' : 'btn-outline')} style={{ minHeight: '44px' }} disabled={reachBusy} aria-pressed={reach === m} onClick={() => { setReach(m); loadReach(m) }}>{m} miles</button>
              ))}
            </div>
            {reachBusy && <p className="cal-empty">Loading...</p>}
            {/* A dropdown: closed by default, so 40 zip codes do not fill the screen. */}
            <details style={{ border: '1px solid #444', borderRadius: '8px', margin: '0 0 0.5rem' }}>
              <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center', padding: '0 0.75rem', cursor: 'pointer', fontSize: '1rem' }}>
                Zip codes: {tickedCount} of {suggested.length} ticked (tap to change)
              </summary>
              <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem' }}>
                <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 1 }} onClick={() => { const t = {}; suggested.forEach(r => { t[r.zip] = true }); setTicked(t) }}>Tick all</button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 1 }} onClick={() => setTicked({})}>Untick all</button>
              </div>
              <div style={{ maxHeight: '45vh', overflowY: 'auto', padding: '0 0.75rem 0.5rem' }}>
                {suggested.map(r => {
                  const mine = r.zip === profile.zip_code
                  return (
                    <label key={r.zip} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: '44px', cursor: mine ? 'default' : 'pointer' }}>
                      <input type="checkbox" checked={mine || !!ticked[r.zip]} disabled={mine} onChange={e => setTicked(t => ({ ...t, [r.zip]: e.target.checked }))} style={{ width: '24px', height: '24px', flexShrink: 0 }} />
                      <span>{r.zip} {r.city}{r.state ? ', ' + r.state : ''} <span className="cal-card-meta">{r.miles > 0 ? Math.round(r.miles) + ' mi' : 'yours'}</span></span>
                    </label>
                  )
                })}
              </div>
            </details>
            <p className="cal-sub">A village can have up to 40 zip codes.</p>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} disabled={busy || reachBusy || tickedCount === 0 || tickedCount > 40} onClick={startOne}>Continue</button>
            <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => setStarting(false)}>Cancel</button>
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
