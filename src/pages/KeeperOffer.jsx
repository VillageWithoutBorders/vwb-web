import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'
import VillageRiskDialog from '../components/VillageRiskDialog'

// Someone was asked to be Keeper of a village: by the founder, or by a local
// Hope Ambassador when the village has no active Keeper (vwb-roles-step5.sql).
// They say yes or no here. Saying yes joins the village chat first if
// they aren't in it, after the usual community chat warning.

export default function KeeperOffer() {
  const { id } = useParams()
  const { isAdmin } = useAuth()
  const [offer, setOffer] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warn, setWarn] = useState(false)
  const [done, setDone] = useState('')

  useEffect(() => {
    supabase.rpc('keeper_offer_info', { p_offer: Number(id) }).then(({ data, error: e }) => {
      if (e) { console.error('[KeeperOffer] load failed:', e); setError("This didn't load. Try again."); setOffer(null); return }
      setOffer((data || [])[0] || null)
    })
  }, [id])

  async function answer(yes, agreed = false) {
    setBusy(true); setError('')
    const { data, error: e } = await supabase.rpc('keeper_offer_answer', { p_offer: Number(id), p_yes: yes, p_agreed: agreed })
    setBusy(false)
    if (e) { console.error('[KeeperOffer] answer failed:', e); setError(e.message || "That didn't save. Try again."); return }
    if (data === 'needagree') { setWarn(true); return }
    setWarn(false)
    setDone(data === 'ok' ? 'yes' : 'no')
  }

  if (offer === undefined) return <div className="become-admin"><p role="status">Loading...</p></div>

  if (!offer) {
    return (
      <div className="become-admin">
        <BackLink fallback="/" fallbackLabel="Home" />
        <h1>Keeper ask</h1>
        <p>{error || 'This ask is not here. It may be for someone else.'}</p>
      </div>
    )
  }

  if (done === 'yes') {
    return (
      <div className="become-admin">
        <h1>You keep {offer.village_name} now</h1>
        <p>Thank you. You can pin announcements in its village chat, name up to 2 helpers, and hand the village to someone else any time.</p>
        {offer.keeper_name && <p>{offer.keeper_name} is a helper now and can still post announcements.</p>}
        <Link className="btn btn-primary btn-full" to={'/village/' + offer.village_id}>Open {offer.village_name}</Link>
      </div>
    )
  }

  if (done === 'no' || offer.status !== 'waiting') {
    const said = done === 'no' || offer.status === 'no'
    return (
      <div className="become-admin">
        <BackLink fallback="/" fallbackLabel="Home" />
        <h1>Keeper of {offer.village_name}</h1>
        <p>{said ? 'You said no. Nothing changed. Thank you for answering.'
          : offer.status === 'yes' ? 'You said yes. You keep this village.'
          : 'This ask was taken back. Nothing changed.'}</p>
        {offer.status === 'yes' && <Link className="btn btn-primary btn-full" to={'/village/' + offer.village_id}>Open {offer.village_name}</Link>}
      </div>
    )
  }

  return (
    <div className="become-admin">
      <BackLink fallback="/" fallbackLabel="Home" />
      <h1>{offer.asked_by_name} asked you to be Keeper of {offer.village_name}</h1>
      <p>A Keeper looks after a village chat. Nothing changes until you answer.</p>

      <section className="admin-role-box" aria-labelledby="keeperWhat">
        <h2 id="keeperWhat" className="admin-role-title">If you say yes</h2>
        <ul className="admin-ready-list">
          {!offer.is_member && <li>You join the {offer.village_name} village chat.</li>}
          <li>You can pin announcements and name up to 2 helpers.</li>
          {offer.keeper_name
            ? <li>{offer.keeper_name} keeps it now. They become a helper and can still post announcements.</li>
            : <li>No one keeps it right now.</li>}
          {isAdmin && <li>You can see the people in this village in Admin.</li>}
          <li>You can hand the village to someone else any time.</li>
        </ul>
      </section>

      {offer.problem && <p className="form-error" role="alert">{offer.problem}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <button type="button" className="btn btn-primary btn-full" disabled={busy || !!offer.problem} onClick={() => answer(true)}>{busy ? 'Saving...' : 'Yes, I will keep it'}</button>
      <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={() => answer(false)}>No, thank you</button>

      {warn && (
        <VillageRiskDialog
          villageName={offer.village_name}
          busy={busy}
          error={error}
          onAgree={() => answer(true, true)}
          onCancel={() => setWarn(false)}
        />
      )}
    </div>
  )
}
