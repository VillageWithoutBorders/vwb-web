import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'
import { canVouch, HOW_LABELS } from '../utils/vouchEligibility'

// Two kinds of vouches (see vwb-personal-vouches.sql):
//   helped: you finished a task together on VWB. Counts right away.
//   knows:  you know them personally (organized or volunteered together,
//           neighbor, friend or family). Only counts once they confirm.
// `allowPersonal` shows the "I know them" option. It's on for profile
// pages, and off in busy lists like the Feed.
export default function VouchButton({ userId, name, size = 'sm', showCount = true, allowPersonal = false, onVouchChange }) {
  const { user, profile: myProfile } = useAuth()
  const navigate = useNavigate()
  const [trust, setTrust] = useState(null) // { wentWell, rated } from finished tasks
  const [justRemoved, setJustRemoved] = useState(false)
  const [counts, setCounts] = useState({ total: 0, helped: 0, knows: 0 })
  const [mine, setMine] = useState(null) // my vouch row { kind } or null
  const [pending, setPending] = useState(null) // my waiting request { how } or null
  const [eligible, setEligible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [how, setHow] = useState('')
  const [askError, setAskError] = useState('')
  const isSelf = user?.id === userId
  const theirName = name || 'this person'

  useEffect(() => {
    if (!userId) return
    loadVouchData()
  }, [userId, user?.id])

  async function loadVouchData() {
    if (user?.id && !isSelf) {
      const [{ data: existing, error: existingErr }, { data: req, error: reqErr }] = await Promise.all([
        supabase.from('vouches').select('id, kind').eq('voucher_id', user.id).eq('vouchee_id', userId).maybeSingle(),
        allowPersonal
          ? supabase.from('vouch_requests').select('how').eq('voucher_id', user.id).eq('vouchee_id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      if (existingErr) console.error('[VouchButton] existing vouch', existingErr)
      if (reqErr) console.error('[VouchButton] pending request', reqErr)
      setMine(existing || null)
      setPending(req || null)
      setEligible(await canVouch(user.id, userId))
    }
    const { data: vc, error: vcErr } = await supabase
      .from('vouch_counts').select('*').eq('user_id', userId).maybeSingle()
    if (vcErr) console.error('[VouchButton] vouch_counts', vcErr)
    if (showCount) {
      // Public summary of "How did it go?" answers about this person
      // (vwb-trust-rating.sql). Only totals, never who said what.
      const { data: ts, error: tsErr } = await supabase.rpc('trust_summary', { p_user: userId })
      if (tsErr) { if (tsErr.code !== 'PGRST202') console.error('[VouchButton] trust_summary', tsErr) }
      const row = Array.isArray(ts) ? ts[0] : ts
      setTrust(row && Number(row.rated) > 0 ? { wentWell: Number(row.went_well), rated: Number(row.rated) } : null)
    }
    const total = Number(vc?.vouch_count || 0)
    // Before the database update runs, there are no split counts: treat
    // everything as "helped together", which is all that existed then.
    const knows = Number(vc?.knows_count || 0)
    const helped = vc?.helped_count != null ? Number(vc.helped_count) : total - knows
    setCounts({ total, helped, knows })
  }

  function myName() {
    return myProfile?.display_name?.trim() || 'A neighbor'
  }

  async function removeVouch() {
    if (!confirm('Take back your vouch for ' + theirName + '? You can vouch for them again any time.')) return
    setLoading(true)
    const { error } = await supabase.from('vouches').delete().eq('voucher_id', user.id).eq('vouchee_id', userId)
    setLoading(false)
    if (error) { console.error('Unvouch error:', error); alert('Could not take back your vouch. Try again.'); return }
    setMine(null)
    setJustRemoved(true)
    loadVouchData()
    onVouchChange?.()
  }

  async function helpedVouch() {
    setLoading(true)
    const { error } = await supabase.from('vouches').insert({ voucher_id: user.id, vouchee_id: userId })
    setLoading(false)
    if (error && error.code !== '23505') { console.error('Vouch error:', error); alert('Could not vouch. Try again.'); return }
    setJustRemoved(false)
    if (!error) {
      createNotification({ userId, type: 'vouch', title: myName() + ' vouched for you!', body: 'You helped each other on Village Without Borders.', link: '/profile' })
    }
    loadVouchData()
    onVouchChange?.()
  }

  async function sendPersonal(e) {
    e.preventDefault()
    if (!how) { setAskError('Pick how you know them.'); return }
    setLoading(true)
    const { error } = await supabase.from('vouch_requests').insert({ voucher_id: user.id, vouchee_id: userId, how })
    setLoading(false)
    if (error && error.code !== '23505') {
      console.error('Personal vouch request failed:', error)
      setAskError('Could not send this. Try again.')
      return
    }
    setJustRemoved(false)
    setAsking(false)
    setHow('')
    setAskError('')
    loadVouchData()
  }

  async function takeBackRequest() {
    setLoading(true)
    const { error } = await supabase.from('vouch_requests').delete().eq('voucher_id', user.id).eq('vouchee_id', userId)
    setLoading(false)
    if (error) { console.error('Failed to take back request:', error); alert('Could not take it back. Try again.'); return }
    setPending(null)
  }

  if (isSelf && !showCount) return null

  const summary = []
  if (counts.helped > 0) summary.push(counts.helped + ' helped together')
  if (counts.knows > 0) summary.push(counts.knows + ' know them personally')

  return (
    <div className={`vouch-container vouch-${size}`}>
      {showCount && counts.total > 0 && (
        <span className="vouch-count" title="Vouches from neighbors. A vouch means someone trusts them. It doesn't guarantee they're safe, so use your own judgment too.">
          &#10022; {summary.join(' · ')}
        </span>
      )}
      {isSelf && showCount && counts.total === 0 && (
        <span className="vouch-count vouch-count-empty">No vouches yet</span>
      )}
      {showCount && trust && (
        <span className="trust-count" title="From the private 'How did it go?' answers after finished tasks. Only counted once both people answer.">
          &#10003; {trust.wentWell} of {trust.rated} finished {trust.rated === 1 ? 'task' : 'tasks'} went well
        </span>
      )}
      {justRemoved && !mine && (
        <span className="vouch-removed" role="status">
          Your vouch is removed. Is something wrong?{' '}
          <button type="button" className="link-button" onClick={() => navigate('/u/' + userId, { state: { safety: 'block' } })}>Block</button>
          {' · '}
          <button type="button" className="link-button" onClick={() => navigate('/u/' + userId, { state: { safety: 'report' } })}>Report</button>
        </span>
      )}

      {!isSelf && user?.id && mine && (
        <button type="button" className={`vouch-btn vouch-btn-${size} vouch-btn-done`} onClick={removeVouch} disabled={loading} aria-label={'Take back your vouch for ' + theirName}>
          {loading ? '...' : '✦ Vouched'}
        </button>
      )}
      {!isSelf && user?.id && !mine && eligible && (
        <button type="button" className={`vouch-btn vouch-btn-${size}`} onClick={helpedVouch} disabled={loading} aria-label={'Vouch for ' + theirName}>
          {loading ? '...' : '✦ Vouch'}
        </button>
      )}
      {!isSelf && user?.id && !mine && !eligible && allowPersonal && pending && (
        <span className="vouch-pending">
          Waiting for {theirName} to confirm ({HOW_LABELS[pending.how]?.toLowerCase()}).{' '}
          <button type="button" className="link-button" onClick={takeBackRequest} disabled={loading}>Take back</button>
        </span>
      )}
      {!isSelf && user?.id && !mine && !eligible && allowPersonal && !pending && !asking && (
        <button type="button" className={`vouch-btn vouch-btn-${size}`} onClick={() => setAsking(true)}>
          &#129309; I know them
        </button>
      )}

      {asking && (
        <form className="vouch-ask" onSubmit={sendPersonal} noValidate>
          <fieldset>
            <legend>How do you know {theirName}?</legend>
            {Object.entries(HOW_LABELS).map(([key, label]) => (
              <label key={key} className="group-radio">
                <input type="radio" name="vouch-how" value={key} checked={how === key} onChange={() => { setHow(key); setAskError('') }} />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="groups-note">{theirName} will be asked to confirm you know each other. It shows on their profile only after they say yes.</p>
          {askError && <p className="groups-error" role="alert">{askError}</p>}
          <div className="groups-actions">
            <button type="button" className="btn btn-outline" onClick={() => { setAsking(false); setHow(''); setAskError('') }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Sending...' : 'Send'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
