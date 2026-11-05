import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import VillageRiskDialog from '../components/VillageRiskDialog'
import VillageGuestInvites from '../components/VillageGuestInvites'
import BackLink from '../components/BackLink'
import { isSimpleView } from '../utils/simpleView'
import { useT } from '../utils/lang'

// Join or start a village. Oct 22: the list of villages lives on the Village
// Network page (/villages), the list twin of the globe. This page is the join
// step (?join=<id>, with the warning) and the start-a-village step.
// A village is a list of zip codes. You can join when your zip is on the list.
// Joining or starting always goes through the risk warning first.

const REACH_CHOICES = [5, 10, 15, 25]

const WORDS = {
  signin: 'Please sign in first.',
  missing: 'We could not find that village. It may have closed.',
  noprofile: 'We could not find your profile. Try again in a moment.',
  needzip: 'Add your zip code on your Profile first, so we can find villages near you.',
  toofar: 'Your zip code is not on that village\u2019s list, so you cannot join it.',
  exists: 'A village already centers on your zip code. Find it on the World map and join that one.',
  already: 'You already started 3 villages. Ask an admin if one needs changes.',
  badzip: 'One of those zip codes was not found. Try again.',
  toomany: 'A village can have up to 40 zip codes. Untick a few and try again.',
  needagree: 'Please read and agree to the warning first.',
  new: 'New accounts can join a village right away. Starting one opens up after your first 14 days, or sooner once a neighbor vouches for you or you finish a task with someone.',
  removed: 'Members of this village chat asked for you to be removed. If you think this is a mistake, contact VWB.',
}

export default function FindVillage() {
  const t = useT()
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [welcome, setWelcome] = useState(null)
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
  // Problems with starting a village show next to its buttons, not at the top of the page.
  const [startError, setStartError] = useState('')
  const [checking, setChecking] = useState(false)

  const hasZip = !!profile?.zip_code

  // One agreement, not two: the Community Guidelines now cover the risk of a
  // community chat, so a first village join right after agreeing skips the
  // second warning. Later joins still show it. The database still gets p_agreed.
  const GUIDELINES_COVER_CHAT_RISK_SINCE = '2026-10-16T00:00:00Z'
  const [firstJoinCovered, setFirstJoinCovered] = useState(false)
  useEffect(() => {
    if (!user || !profile?.guidelines_accepted_at || profile.guidelines_accepted_at < GUIDELINES_COVER_CHAT_RISK_SINCE) return
    supabase.from('village_members').select('village_id', { count: 'exact', head: true }).eq('user_id', user.id).then(({ count, error: err }) => {
      if (err) { console.error('Failed to check your villages:', err); return }
      setFirstJoinCovered((count || 0) === 0)
    })
  }, [user?.id, profile?.guidelines_accepted_at]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(term) {
    setLoading(true); setError('')
    const { data, error: err } = await supabase.rpc('find_villages', { p_search: term || null })
    if (err) {
      console.error('Failed to find villages:', err)
      setError(t('We could not load the villages. Try again in a moment.'))
      setVillages([]); setLoading(false); return
    }
    setVillages(data || [])
    setLoading(false)
  }

  useEffect(() => { load('') }, [])

  // Coming from the map with ?join=<village id>: open the warning for that village.
  const joinParam = searchParams.get('join')
  useEffect(() => {
    if (!joinParam || loading || risk) return
    const v = villages.find(x => x.id === joinParam)
    if (v && v.can_join && !v.is_mine) { if (firstJoinCovered) agreeAndGo({ type: 'join', village: v }); else setRisk({ type: 'join', village: v }) }
    else if (v && v.is_mine) navigate(v.board_id ? '/village-square?board=' + v.board_id : '/village-square', { replace: true })
    else if (!v) { setError(t('We could not open that village. Find it on the World map.')); navigate('/find-village', { replace: true }) }
  }, [joinParam, loading, villages])

  // Coming from the first-run village screen with ?start=1: open the start form.
  const startParam = searchParams.get('start')
  useEffect(() => {
    if (startParam !== '1' || !hasZip || starting) return
    openStart()
    navigate('/find-village', { replace: true })
    setTimeout(() => document.getElementById('fv-startform')?.scrollIntoView({ block: 'start' }), 120)
  }, [startParam, hasZip]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zips near mine. All ticked to begin with; the starter unticks what does not fit.
  async function loadReach(miles) {
    if (!profile?.zip_code) return
    setReachBusy(true)
    const { data, error: err } = await supabase.rpc('village_reach', { p_zip: profile.zip_code, p_miles: miles })
    setReachBusy(false)
    if (err) { console.error('Failed to load nearby zips:', err); setError(t('We could not load nearby zip codes. Try again.')); return }
    const rows = (data || []).slice(0, 40)
    setSuggested(rows)
    const tk = {}
    rows.forEach(r => { tk[r.zip] = true })
    setTicked(tk)
  }

  // Ask the database first, without starting anything (p_agreed = false stops it
  // before it saves), so a village that already centers on your zip, or the
  // 3-village limit, is said right away instead of after the warning.
  async function canStart(zips) {
    const { data, error: err } = await supabase.rpc('start_my_village', { p_agreed: false, p_name: null, p_zips: zips })
    if (err) { console.error('Failed to check starting a village:', err); return t('Could not check that. Try again in a moment.') }
    if (data === 'needagree') return ''
    if (data === 'exists') return t('A village already centers on your zip code ({zip}). There can be only one village for each center. Join that one from the list above.', { zip: profile.zip_code })
    return t(WORDS[data] || 'Could not start a village. Try again.')
  }

  async function openStart() {
    setError(''); setStartError(''); setStarting(true)
    setChecking(true)
    const why = await canStart(null)
    setChecking(false)
    if (why) { setStartError(why); return }
    loadReach(reach)
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
    if (!vid) { navigate('/village-square'); return }
    const { data: b } = await supabase.from('campfire_boards').select('id, name').eq('village_id', vid).maybeSingle()
    if (!b) { navigate('/village-square'); return }
    const { data: saved } = await supabase.from('campfire_board_user_settings').select('alerts').eq('user_id', user.id).eq('board_id', b.id).maybeSingle()
    if (saved) { navigate('/village-square?board=' + b.id + '&intro=1'); return }
    setWelcome(b)
  }

  async function answerAlerts(yes) {
    if (busy || !welcome) return
    setBusy(true); setError('')
    const { error: err } = await supabase.from('campfire_board_user_settings').upsert(
      { user_id: user.id, board_id: welcome.id, alerts: yes ? 'all' : 'off', muted_until: null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,board_id' }
    )
    if (err) { console.error('Failed to save alert choice:', err); setError(t('Could not save that. Try again.')); setBusy(false); return }
    navigate('/village-square?board=' + welcome.id + '&intro=1')
  }

  // The warning's "I agree" button. The agreement is sent to the database, which checks it.
  async function agreeAndGo(direct) {
    const r = direct || risk
    if (busy || !r) return
    setBusy(true); setRiskError('')
    const isStart = r.type === 'start'
    const zips = suggested.filter(r => ticked[r.zip] || r.zip === profile?.zip_code).map(r => r.zip)
    const { data, error: err } = isStart
      ? await supabase.rpc('start_my_village', { p_agreed: true, p_name: startName.trim() || null, p_zips: zips })
      : await supabase.rpc('join_village', { p_village: r.village.id, p_agreed: true })
    if (err) { console.error('Failed to join village:', err); setRiskError(t('Could not join. Try again.')); setBusy(false); return }
    if (data !== 'ok') {
      setBusy(false)
      setRisk(null)
      if (isStart) setStartError(t(WORDS[data] || 'Could not start a village. Try again.'))
      else setError(t(WORDS[data] || 'Could not join. Try again.'))
      if (data === 'exists') load('')
      return
    }
    const villageId = isStart ? null : r.village.id
    setRisk(null)
    setFirstJoinCovered(false)
    setStarting(false)
    await finishJoin(villageId)
    setBusy(false)
  }

  async function startOne() {
    if (busy) return
    setRiskError(''); setStartError('')
    setBusy(true)
    const why = await canStart(suggested.filter(r => ticked[r.zip] || r.zip === profile.zip_code).map(r => r.zip))
    setBusy(false)
    if (why) { setStartError(why); return }
    if (firstJoinCovered) { agreeAndGo({ type: 'start' }); return }
    setRisk({ type: 'start' })
  }
  // Your own zip code is always on the list, so it always counts.
  const tickedCount = suggested.filter(r => ticked[r.zip] || r.zip === profile?.zip_code).length

  // Villages you can join or already belong to (the full list is on the World map).
  const shown = villages.filter(v => v.can_join || v.is_mine)
  const nothingNear = !loading && !error && hasZip && shown.length === 0

  if (welcome) {
    return (
      <div className="cal-page hub-page">
        <h1 className="hub-org-name">{t('You joined {name}', { name: welcome.name })}</h1>
        <section className="cal-box" aria-labelledby="fv-alerts">
          <h2 id="fv-alerts">{t('Get a notification for new messages?')}</h2>
          <p className="cal-sub">{t('We send one notification after the chat goes quiet, not one for every message. You can change this any time in the Village Square settings.')}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} disabled={busy} onClick={() => answerAlerts(true)}>{t('Yes, notify me')}</button>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => answerAlerts(false)}>{t('Not now')}</button>
        </section>
      </div>
    )
  }

  return (
    <div className="cal-page hub-page">
      <BackLink fallback={isSimpleView() ? '/' : '/village-square'} fallbackLabel={isSimpleView() ? t('Home') : t('Village Square')} />
      <h1 className="hub-org-name">{t('Join or start a village')}</h1>
      <p className="cal-sub">{t('A village chat is for neighbors in the zip codes it covers. Anyone with an account can join a village that has their zip code. You can join more than one, especially where villages overlap. Any neighbor can start one.')}</p>
      {/* Simple view (Oct 27): no globe. The villages for your zip code are listed below. */}
      {!isSimpleView() && <Link to="/world" className="btn btn-primary btn-full" style={{ minHeight: '48px', margin: '0 0 0.75rem' }}>{t('See villages near you')}</Link>}

      <VillageGuestInvites />

      {!hasZip && (
        <section className="cal-box" aria-labelledby="fv-zip">
          <h2 id="fv-zip">{t('Add your zip code first')}</h2>
          <p className="cal-sub">{t('Your zip code is how we find villages near you. We never show it to anyone.')}</p>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/profile')}>{t('Go to my Profile')}</button>
        </section>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="cal-empty">{t('Loading...')}</p>}

      <div aria-live="polite">
        {nothingNear && <p className="cal-sub">{t('No village covers your zip code yet. You can start one below.')}</p>}

        {hasZip && !loading && !starting && (
          <section className="cal-box" aria-labelledby="fv-start">
            <h2 id="fv-start">{shown.length === 0 ? t('Start a village for your area') : t('Do not see your town?')}</h2>
            <p className="cal-sub">{t('Any neighbor can start a village. You choose the name and the zip codes it covers. The admins are told when a new one starts.')}</p>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={openStart}>{t('Start a village')}</button>
          </section>
        )}

        {hasZip && starting && (
          <section className="cal-box" aria-labelledby="fv-startform">
            <h2 id="fv-startform">{t('Start a village')}</h2>
            {checking && <p className="cal-empty">{t('Checking...')}</p>}
            {!checking && startError && !suggested.length && (
              <>
                <p className="form-error" role="alert">{startError}</p>
                <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} onClick={() => { setStarting(false); setStartError('') }}>{t('Back')}</button>
              </>
            )}
            {!checking && !(startError && !suggested.length) && (<>
            <label htmlFor="fv-name" style={{ display: 'block', margin: '0.5rem 0 0.25rem' }}>{t('Village name')}</label>
            <input id="fv-name" type="text" value={startName} onChange={e => setStartName(e.target.value)} maxLength={40} placeholder={t('Leave blank to use your town')} autoComplete="off" style={{ width: '100%', minHeight: '44px', boxSizing: 'border-box', padding: '0 0.75rem', fontSize: '1rem' }} />
            <p className="cal-sub" style={{ margin: '0.75rem 0 0.25rem' }}>{t('Zip codes near {zip}. Tick the ones this village covers. Your own zip code stays on the list.', { zip: profile.zip_code })}</p>
            <div role="group" aria-label={t('Show zip codes within')} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0 0 0.5rem' }}>
              {REACH_CHOICES.map(m => (
                <button key={m} type="button" className={'btn ' + (reach === m ? 'btn-primary' : 'btn-outline')} style={{ minHeight: '44px' }} disabled={reachBusy} aria-pressed={reach === m} onClick={() => { setReach(m); loadReach(m) }}>{t('{n} miles', { n: m })}</button>
              ))}
            </div>
            {reachBusy && <p className="cal-empty">{t('Loading...')}</p>}
            {/* A dropdown: closed by default, so 40 zip codes do not fill the screen. */}
            <details style={{ border: '1px solid var(--border-strong)', borderRadius: '8px', margin: '0 0 0.5rem' }}>
              <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center', padding: '0 0.75rem', cursor: 'pointer', fontSize: '1rem' }}>
                {t('Zip codes: {n} of {total} ticked (tap to change)', { n: tickedCount, total: suggested.length })}
              </summary>
              <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem' }}>
                <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 1 }} onClick={() => { const tk = {}; suggested.forEach(r => { tk[r.zip] = true }); setTicked(tk) }}>{t('Tick all')}</button>
                <button type="button" className="btn btn-outline" style={{ minHeight: '44px', flex: 1 }} onClick={() => setTicked({})}>{t('Untick all but mine')}</button>
              </div>
              <div style={{ maxHeight: '45vh', overflowY: 'auto', padding: '0 0.75rem 0.5rem' }}>
                {suggested.map(r => {
                  const mine = r.zip === profile.zip_code
                  return (
                    <label key={r.zip} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: '44px', cursor: mine ? 'default' : 'pointer' }}>
                      <input type="checkbox" checked={mine || !!ticked[r.zip]} disabled={mine} onChange={e => setTicked(prev => ({ ...prev, [r.zip]: e.target.checked }))} style={{ width: '24px', height: '24px', flexShrink: 0 }} />
                      <span>{r.zip} {r.city}{r.state ? ', ' + r.state : ''} <span className="cal-card-meta">{r.miles > 0 ? t('{n} mi', { n: Math.round(r.miles) }) : t('yours')}</span></span>
                    </label>
                  )
                })}
              </div>
            </details>
            <p className="cal-sub">{t('A village can have up to 40 zip codes.')}</p>
            {startError && <p className="form-error" role="alert">{startError}</p>}
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} disabled={busy || reachBusy || tickedCount === 0 || tickedCount > 40} onClick={startOne}>{t('Continue')}</button>
            <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => { setStarting(false); setStartError('') }}>{t('Cancel')}</button>
            </>)}
          </section>
        )}
      </div>

      {risk && (
        <VillageRiskDialog
          villageName={risk.type === 'join' ? risk.village.name : t('your new village chat')}
          busy={busy}
          error={riskError}
          onAgree={() => agreeAndGo()}
          onCancel={() => { setRisk(null); setRiskError(''); if (joinParam) navigate('/world', { replace: true }) }}
        />
      )}
    </div>
  )
}
