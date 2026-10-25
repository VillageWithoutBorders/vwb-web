import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import BackLink from '../components/BackLink'
import Icon from '../components/Icon'
import { NEW_ACCOUNT_NOTE, isNewAccountBlock } from '../utils/newAccount'

// Start an emergency response Group (tent icon). Route: /start-group
// Optional ?village=<id> picks that village as the first one the group covers.
// Rules live in the database (vwb-groups-emergency.sql): up to 3 per person,
// starts private, the starter is its Keeper.

export default function StartGroup() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const villageId = params.get('village')
  const { established, refreshOrganizations } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(null)
  const [villageName, setVillageName] = useState('')

  useEffect(() => {
    supabase.rpc('my_groups_started').then(({ data, error: err }) => {
      if (err) { console.error('Failed to count your groups:', err); return }
      setStarted(typeof data === 'number' ? data : 0)
    })
    if (villageId) {
      supabase.rpc('village_network').then(({ data, error: err }) => {
        if (err) { console.error('Failed to load villages:', err); return }
        const v = (data || []).find((x) => String(x.id) === String(villageId))
        if (v) setVillageName(v.name)
      })
    }
  }, [villageId])

  async function submit(e) {
    e.preventDefault()
    const n = name.trim()
    if (n.length < 3) { setError('Give your crew a name, at least 3 letters.'); document.getElementById('sg-name')?.focus(); return }
    setBusy(true); setError('')
    const { data: orgId, error: err } = await supabase.rpc('start_group', { p_name: n, p_description: description.trim() || null })
    if (err || !orgId) {
      setBusy(false)
      console.error('Failed to start group:', err)
      if (isNewAccountBlock(err)) setError(NEW_ACCOUNT_NOTE)
      else if (err?.code === 'P0001' || err?.code === '23505' || err?.code === '22001') setError(err.message)
      else setError("We couldn't start your crew. Check your connection and try again.")
      return
    }
    if (villageId) {
      const { error: vErr } = await supabase.rpc('set_org_villages', { p_org: orgId, p_villages: [villageId] })
      if (vErr) console.error('Failed to set the first village:', vErr)
    }
    if (refreshOrganizations) await refreshOrganizations()
    navigate('/orgs/' + orgId + '?new=1', { replace: true })
  }

  const full = started !== null && started >= 3

  return (
    <div className="cal-page hub-page">
      <BackLink fallback={villageId ? '/village/' + villageId : '/world?tab=orgs'} fallbackLabel={villageId ? 'Village' : 'World'} />
      <h1><Icon name="tent" /> Start an emergency crew</h1>
      <p className="cal-sub">An emergency crew shows up when disaster hits: flooding, storms, mold, a house fire. You plan together now, so you are ready when it counts.</p>

      <section className="cal-box" aria-labelledby="sg-how">
        <h2 id="sg-how" style={{ fontSize: '1.05rem', marginTop: 0 }}>How crews work</h2>
        <ul className="sg-list">
          <li><b>You are its Keeper.</b> You add members, and you can name Helpers to share the work.</li>
          <li><b>It starts private.</b> Only people with a VWB account can see it, and only its Keepers and Helpers add people.</li>
          <li><b>It gets a Campfire</b> for your crew to talk and plan.</li>
          <li><b>To be called to emergencies,</b> ask for approval from your crew page. A Hope Ambassador or VWB admin checks that the crew is real and local.</li>
        </ul>
      </section>

      {established === false ? (
        <p className="new-account-note" role="status">{NEW_ACCOUNT_NOTE}</p>
      ) : full ? (
        <p className="groups-note" role="status">You already started 3 crews, which is the most one person can start. You can make someone else a Keeper of one of them and step down, or you can join someone else's crew.</p>
      ) : (
        <form className="groups-card" onSubmit={submit} noValidate>
          <div className="form-field">
            <label htmlFor="sg-name">Crew name</label>
            <input id="sg-name" type="text" value={name} onChange={(e) => { setName(e.target.value); setError('') }} maxLength={80} autoComplete="off" required placeholder="Like: Ringgold Flood and Mold Crew" aria-invalid={!!error && name.trim().length < 3} aria-describedby={error ? 'sg-error' : undefined} />
          </div>
          <div className="form-field">
            <label htmlFor="sg-desc">What does your crew do? (optional)</label>
            <textarea id="sg-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} placeholder="Like: We tarp roofs, muck out flooded homes, and check on older neighbors after storms." />
          </div>
          {villageName && <p className="groups-note">Your crew will cover {villageName}. You can add more villages after it starts.</p>}
          {started !== null && <p className="groups-note">You can start up to 3 crews. You have started {started}.</p>}
          {error && <p id="sg-error" className="groups-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={busy} style={{ minHeight: 48 }}>{busy ? 'Starting...' : 'Start my crew'}</button>
        </form>
      )}
    </div>
  )
}
