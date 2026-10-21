import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { lookupZip, saveZip } from '../utils/location'
import VillageRiskDialog from './VillageRiskDialog'
import Icon from './Icon'

// First run, step 2 (after the Community Guidelines, before Simple view and
// the tour): find your village.
//
// 1. Type your zip code. It is saved on your profile. Only you and VWB admins
//    can see it. The database turns it into the zip's rounded center point.
// 2. We show the villages that cover your zip, closest first. One tap joins.
//    Nobody is put in a village without tapping Join.
//    No village covers it yet? We show the closest ones and offer to start one.
// 3. After joining: get a notification for new messages? Then on to the app.
//
// "Not now" is always on screen. Answering is saved in
// helper_profiles.village_opt_in, so this shows once per account.
// join_village and start_my_village set it to true on their own.

// The Guidelines cover the risk of a community chat for a first join made
// after this date (same rule as Find village chats).
const GUIDELINES_COVER_CHAT_RISK_SINCE = '2026-10-16T00:00:00Z'
const NEARBY_MILES = 50

const WORDS = {
  toofar: 'Your zip code is not on that village’s list, so you cannot join it.',
  needzip: 'Your zip code did not save. Go back and try again.',
  needagree: 'Please read and agree to the warning first.',
  removed: 'Members of this village chat asked for you to be removed. If you think this is a mistake, contact VWB.',
  missing: 'We could not find that village. It may have closed.',
}

function countText(v) {
  if (v.just_starting || v.member_count == null) return 'Just getting started'
  return v.member_count + ' neighbors'
}

export default function FirstVillage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('zip') // zip, list, joined
  const [zip, setZip] = useState('')
  const [place, setPlace] = useState('')
  const [villages, setVillages] = useState([])
  const [joined, setJoined] = useState(null) // { name, boardId }
  const [risk, setRisk] = useState(null)
  const [riskError, setRiskError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headRef = useRef(null)

  // Move focus to each new heading so screen readers hear the change.
  useEffect(() => { headRef.current?.focus() }, [step])

  // Already has a zip saved? Go straight to the list.
  useEffect(() => {
    const saved = String(profile?.zip_code || '').replace(/[^0-9]/g, '').slice(0, 5)
    if (saved.length !== 5) return
    setZip(saved)
    lookupZip(saved).then((p) => { if (p) setPlace(p.label) })
    loadVillages()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadVillages() {
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc('find_villages', { p_search: null })
    setBusy(false)
    if (err) {
      console.error('First village: failed to find villages:', err)
      setError('We could not load the villages. Try again in a moment.')
      return false
    }
    setVillages(data || [])
    setStep('list')
    return true
  }

  async function submitZip(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    const clean = zip.replace(/[^0-9]/g, '').slice(0, 5)
    if (clean.length !== 5) { setError('Type the 5 numbers of your zip code.'); return }
    setBusy(true)
    const found = await lookupZip(clean)
    if (!found) { setBusy(false); setError('We could not find that zip code. Check it and try again.'); return }
    const saveErr = await saveZip(user.id, clean)
    setBusy(false)
    if (saveErr) { setError(saveErr); return }
    setPlace(found.label)
    await loadVillages()
  }

  // Leave this screen. Saying "not now" is saved so we don't ask again.
  async function finish(optIn, to = '/') {
    if (busy) return
    setBusy(true); setError('')
    if (optIn !== undefined) {
      const { error: err } = await supabase.from('helper_profiles').update({ village_opt_in: optIn }).eq('user_id', user.id)
      if (err) { console.error('First village: failed to save answer:', err); setError('Could not save that. Try again.'); setBusy(false); return }
    }
    navigate(to, { replace: true })
    await refreshProfile()
    setBusy(false)
  }

  function join(v) {
    setRiskError('')
    const covered = !!profile?.guidelines_accepted_at
      && profile.guidelines_accepted_at >= GUIDELINES_COVER_CHAT_RISK_SINCE
      && !villages.some((x) => x.is_mine)
    if (covered) agreeAndJoin(v)
    else setRisk(v)
  }

  async function agreeAndJoin(v) {
    if (busy) return
    setBusy(true); setRiskError(''); setError('')
    const { data, error: err } = await supabase.rpc('join_village', { p_village: v.id, p_agreed: true })
    if (err) {
      console.error('First village: failed to join:', err)
      setBusy(false)
      if (risk) setRiskError('Could not join. Try again.')
      else setError('Could not join. Try again.')
      return
    }
    setRisk(null)
    if (data !== 'ok') { setBusy(false); setError(WORDS[data] || 'Could not join. Try again.'); return }
    // The chat for this village.
    let boardId = v.board_id || null
    if (!boardId) {
      const { data: b, error: bErr } = await supabase.from('campfire_boards').select('id').eq('village_id', v.id).eq('archived', false).maybeSingle()
      if (bErr) console.error('First village: failed to find the village chat:', bErr)
      boardId = b?.id || null
    }
    setBusy(false)
    setJoined({ name: v.name, boardId })
    setStep('joined')
  }

  async function answerAlerts(yes) {
    if (busy) return
    if (!joined?.boardId) { finish(); return }
    setBusy(true); setError('')
    const { error: err } = await supabase.from('campfire_board_user_settings').upsert(
      { user_id: user.id, board_id: joined.boardId, alerts: yes ? 'all' : 'off', muted_until: null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,board_id' }
    )
    setBusy(false)
    if (err) { console.error('First village: failed to save alert choice:', err); setError('Could not save that. Try again.'); return }
    finish()
  }

  const canJoin = villages.filter((v) => v.can_join && !v.is_mine)
  const mine = villages.filter((v) => v.is_mine)
  const nearby = villages
    .filter((v) => !v.can_join && !v.is_mine && v.miles_away != null && Number(v.miles_away) <= NEARBY_MILES)
    .slice(0, 3)
  const where = place || zip

  return (
    <div className="login-page">
      <div className="login-card fv1-card">
        <div className="login-header">
          <span aria-hidden="true"><Icon name="houses" size={40} /></span>
        </div>

        {step === 'zip' && (
          <form className="login-form" onSubmit={submitZip} noValidate>
            <h1 className="fv1-h" tabIndex={-1} ref={headRef}>Find your village</h1>
            <p className="fv1-text">A village is the neighbors who live near you. Type your zip code and we will show you the village for your area.</p>
            <div className="form-field">
              <label htmlFor="fv1-zip">Your zip code</label>
              <input id="fv1-zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]*" maxLength={5} placeholder="12345"
                value={zip} onChange={(e) => { setZip(e.target.value.replace(/[^0-9]/g, '')); setError('') }}
                aria-describedby={'fv1-zip-note' + (error ? ' fv1-err' : '')} aria-invalid={error ? true : undefined} />
              <p id="fv1-zip-note" className="fv1-note">Only you and VWB admins can see your zip code. We never show where you live.</p>
            </div>
            {error && <p id="fv1-err" className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Looking...' : 'Show my village'}</button>
            <button type="button" className="btn btn-outline btn-full fv1-gap" disabled={busy} onClick={() => finish(false)}>Not now</button>
            <p className="fv1-note">You can find your village later from the Village tab.</p>
          </form>
        )}

        {step === 'list' && (
          <div className="login-form">
            <h1 className="fv1-h" tabIndex={-1} ref={headRef}>
              {mine.length ? 'You are in a village' : canJoin.length ? 'Your village' + (canJoin.length > 1 ? 's' : '') : 'No village here yet'}
            </h1>
            {where && <p className="fv1-text">Near {where}. <button type="button" className="link-button fv1-link" disabled={busy} onClick={() => { setStep('zip'); setError('') }}>Change zip code</button></p>}

            {mine.length > 0 && (
              <>
                {mine.map((v) => (
                  <div key={v.id} className="cal-card fv1-village">
                    <span className="cal-card-title">{v.name}</span>
                    {v.towns && <span className="cal-card-meta fv1-meta">Covers {v.towns}</span>}
                  </div>
                ))}
                <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={() => finish(true)}>Continue</button>
              </>
            )}

            {!mine.length && canJoin.length > 0 && (
              <>
                <p className="fv1-text">{canJoin.length > 1
                  ? 'These villages cover your zip code. Pick one to start. You can join more later.'
                  : 'This village covers your zip code. Join to meet your neighbors in the village chat.'}</p>
                {canJoin.map((v) => (
                  <div key={v.id} className="cal-card fv1-village">
                    <span className="cal-card-title">{v.name}</span>
                    <span className="cal-card-meta fv1-meta">{countText(v)}{v.miles_away != null ? ' · about ' + v.miles_away + ' miles away' : ''}</span>
                    {v.towns && <span className="cal-card-meta fv1-meta">Covers {v.towns}</span>}
                    <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={() => join(v)}>{busy ? 'Joining...' : 'Join ' + v.name}</button>
                  </div>
                ))}
              </>
            )}

            {!mine.length && canJoin.length === 0 && (
              <>
                <p className="fv1-text">No village covers {where || 'your zip code'} yet. Any neighbor can start one. You pick the name and the zip codes it covers.</p>
                {nearby.length > 0 && (
                  <>
                    <h2 className="fv1-h2">Closest villages</h2>
                    {nearby.map((v) => (
                      <div key={v.id} className="cal-card fv1-village">
                        <span className="cal-card-title">{v.name}</span>
                        <span className="cal-card-meta fv1-meta">About {v.miles_away} miles away{v.towns ? ' · covers ' + v.towns : ''}</span>
                      </div>
                    ))}
                    <p className="fv1-note">Your zip code is not on their lists, so you cannot join them yet. A member can invite you as a guest.</p>
                  </>
                )}
                <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={() => finish(true, '/find-village?start=1')}>Start a village</button>
              </>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
            {!mine.length && <button type="button" className="btn btn-outline btn-full fv1-gap" disabled={busy} onClick={() => finish(false)}>Not now</button>}
          </div>
        )}

        {step === 'joined' && (
          <div className="login-form">
            <h1 className="fv1-h" tabIndex={-1} ref={headRef}>You joined {joined?.name}</h1>
            <p className="fv1-text">Welcome, neighbor. Say hi in the village chat when you are ready.</p>
            <h2 className="fv1-h2">Get a notification for new messages?</h2>
            <p className="fv1-note">We send one notification after the chat goes quiet, not one for every message. You can change this any time in the chat settings.</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={() => answerAlerts(true)}>Yes, notify me</button>
            <button type="button" className="btn btn-outline btn-full fv1-gap" disabled={busy} onClick={() => answerAlerts(false)}>Not now</button>
          </div>
        )}
      </div>

      {risk && (
        <VillageRiskDialog
          villageName={risk.name}
          busy={busy}
          error={riskError}
          onAgree={() => agreeAndJoin(risk)}
          onCancel={() => { setRisk(null); setRiskError('') }}
        />
      )}
    </div>
  )
}
