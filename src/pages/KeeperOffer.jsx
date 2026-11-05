import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'
import VillageRiskDialog from '../components/VillageRiskDialog'
import { useT, t as tr } from '../utils/lang'

// Someone was asked to be Keeper of a village: by the founder, or by a local
// Hope Ambassador when the village has no active Keeper (vwb-roles-step5.sql).
// They say yes or no here. Saying yes joins the village chat first if
// they aren't in it, after the usual community chat warning.

export default function KeeperOffer() {
  const t = useT()
  const { id } = useParams()
  const { isAdmin } = useAuth()
  const [offer, setOffer] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warn, setWarn] = useState(false)
  const [done, setDone] = useState('')

  useEffect(() => {
    supabase.rpc('keeper_offer_info', { p_offer: Number(id) }).then(({ data, error: e }) => {
      if (e) { console.error('[KeeperOffer] load failed:', e); setError(tr("This didn't load. Try again.")); setOffer(null); return }
      setOffer((data || [])[0] || null)
    })
  }, [id])

  async function answer(yes, agreed = false) {
    setBusy(true); setError('')
    const { data, error: e } = await supabase.rpc('keeper_offer_answer', { p_offer: Number(id), p_yes: yes, p_agreed: agreed })
    setBusy(false)
    if (e) { console.error('[KeeperOffer] answer failed:', e); setError(e.message || tr("That didn't save. Try again.")); return }
    if (data === 'needagree') { setWarn(true); return }
    setWarn(false)
    setDone(data === 'ok' ? 'yes' : 'no')
  }

  if (offer === undefined) return <div className="become-admin"><p role="status">{t('Loading...')}</p></div>

  if (!offer) {
    return (
      <div className="become-admin">
        <BackLink fallback="/" fallbackLabel={t('Home')} />
        <h1>{t('Keeper ask')}</h1>
        <p>{error || t('This ask is not here. It may be for someone else.')}</p>
      </div>
    )
  }

  if (done === 'yes') {
    return (
      <div className="become-admin">
        <h1>{t('You keep {name} now', { name: offer.village_name })}</h1>
        <p>{t('Thank you. You can pin announcements in its village chat, name up to 2 helpers, and hand the village to someone else any time.')}</p>
        {offer.keeper_name && <p>{t('{name} is a helper now and can still post announcements.', { name: offer.keeper_name })}</p>}
        <Link className="btn btn-primary btn-full" to={'/village/' + offer.village_id}>{t('Open {name}', { name: offer.village_name })}</Link>
      </div>
    )
  }

  if (done === 'no' || offer.status !== 'waiting') {
    const said = done === 'no' || offer.status === 'no'
    return (
      <div className="become-admin">
        <BackLink fallback="/" fallbackLabel={t('Home')} />
        <h1>{t('Keeper of {name}', { name: offer.village_name })}</h1>
        <p>{said ? t('You said no. Nothing changed. Thank you for answering.')
          : offer.status === 'yes' ? t('You said yes. You keep this village.')
          : t('This ask was taken back. Nothing changed.')}</p>
        {offer.status === 'yes' && <Link className="btn btn-primary btn-full" to={'/village/' + offer.village_id}>{t('Open {name}', { name: offer.village_name })}</Link>}
      </div>
    )
  }

  return (
    <div className="become-admin">
      <BackLink fallback="/" fallbackLabel={t('Home')} />
      <h1>{t('{name} asked you to be Keeper of {village}', { name: offer.asked_by_name, village: offer.village_name })}</h1>
      <p>{t('A Keeper looks after a village chat. Nothing changes until you answer.')}</p>

      <section className="admin-role-box" aria-labelledby="keeperWhat">
        <h2 id="keeperWhat" className="admin-role-title">{t('If you say yes')}</h2>
        <ul className="admin-ready-list">
          {!offer.is_member && <li>{t('You join the {name} village chat.', { name: offer.village_name })}</li>}
          <li>{t('You can pin announcements and name up to 2 helpers.')}</li>
          {offer.keeper_name
            ? <li>{t('{name} keeps it now. They become a helper and can still post announcements.', { name: offer.keeper_name })}</li>
            : <li>{t('No one keeps it right now.')}</li>}
          {isAdmin && <li>{t('You can see the people in this village in Admin.')}</li>}
          <li>{t('You can hand the village to someone else any time.')}</li>
        </ul>
      </section>

      {offer.problem && <p className="form-error" role="alert">{t(offer.problem)}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <button type="button" className="btn btn-primary btn-full" disabled={busy || !!offer.problem} onClick={() => answer(true)}>{busy ? t('Saving...') : t('Yes, I will keep it')}</button>
      <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={() => answer(false)}>{t('No, thank you')}</button>

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
