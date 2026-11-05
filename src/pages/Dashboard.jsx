import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { peekReturnTo } from '../utils/returnTo'
import PushBanner from '../components/PushBanner'
import InstallBanner from '../components/InstallBanner'
import RecoveryNudge from '../components/RecoveryNudge'
import AmbassadorBanner from '../components/AmbassadorBanner'
import { NeedsYou, YourPlaces, ComingUp } from '../components/TodayParts'
import Icon from '../components/Icon'
import NearbyNeedTiles from '../components/NearbyNeedTiles'
import OrgInvites from '../components/OrgInvites'
import VillageGuestInvites from '../components/VillageGuestInvites'
import QuickActions from '../components/QuickActions'
import ZipCard from '../components/ZipCard'
import { useT } from '../utils/lang'

function VillageAsk() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Only ask people who have not answered yet.
  if (!profile || profile.village_opt_in !== null && profile.village_opt_in !== undefined) return null

  async function answer(yes) {
    setSaving(true); setError('')
    const { error: err } = await supabase.from('helper_profiles').update({ village_opt_in: yes }).eq('user_id', profile.user_id)
    if (err) { console.error('[VillageAsk]', err); setError(t('Could not save that. Try again.')); setSaving(false); return }
    await refreshProfile()
    setSaving(false)
    if (yes && !profile.zip_code) { navigate('/profile'); return }
    // Yes opens the list of village chats near them. They read the warning and join from there.
    if (yes) navigate('/find-village')
  }

  return (
    <div className="village-ask" role="region" aria-label={t('Local village chat')}>
      <p className="village-ask-title"><span aria-hidden="true" style={{ verticalAlign: "middle" }}><Icon name="houses" /></span> {t('Join a village chat?')}</p>
      <p className="village-ask-text">{t('Village chats are for neighbors in your area. We use your zip code to find them. You can join more than one, and you can leave any time from your Profile.')}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="village-ask-buttons">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => answer(true)}>{t('Yes, join')}</button>
        <button type="button" className="btn btn-outline" disabled={saving} onClick={() => answer(false)}>{t('No thanks')}</button>
      </div>
    </div>
  )
}

// Oct 22: Today lives under your cottage map (embedded). /today opens /cottage#today.
export default function Dashboard({ embedded = false }) {
  const { profile, isAdmin, established } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const t = useT()
  const displayName = profile?.display_name || t('Neighbor')
  const successMessage = location.state?.message
  const [waiting, setWaiting] = useState(null)

  // Coming back from "confirm your email" after tapping Sign up on an event:
  // send them to that event instead of leaving them on the home screen.
  useEffect(() => {
    const back = peekReturnTo()
    if (back) navigate(back, { replace: true })
  }, [navigate])

  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // The Dashboard is your "today" page (Oct 22): what needs you, your shortcuts,
  // your places, what's coming up, and one setup reminder. Asking for and giving
  // help live in the Help tab (your requests and tasks are under Help > Mine).
  return (
    <div className="dashboard">
      {successMessage && (
        <p className="form-success" role="status" style={{ marginBottom: '1rem' }}>
          {successMessage}
        </p>
      )}
      <div className="welcome-section">
        {embedded ? <h2>{t(hello)}, {displayName}</h2> : <h1>{t(hello)}, {displayName}</h1>}
        {/* Oct 28: under the cottage map, "all caught up" is said once, by Needs you. */}
        {!(embedded && waiting === 0) && <p className="welcome-sub" role="status">
          {waiting === null ? t('Here is your day.') : waiting === 0 ? t("You're all caught up.") : waiting === 1 ? t('1 thing needs you today.') : t('{n} things need you today.', { n: waiting })}
        </p>}
        {profile?.is_hope_ambassador && <p className="today-role"><Icon name="star" size={20} /> {t('Hope Ambassador')}</p>}
      </div>

      <ZipCard />

      {established === false && (
        <section className="new-here" aria-labelledby="new-here-h">
          <h2 id="new-here-h"><Icon name="sprout" /> {t("You're new here")}</h2>
          <p>{t('Right now you can ask for help, offer to help on requests, join your village, and reply to anyone who messages you.')}</p>
          <p>{t('Once a neighbor vouches for you, or you finish a task with someone, you can also message people first, post offers, and start chats and emergency crews. It keeps VWB safe from fake accounts.')}</p>
        </section>
      )}

      <NeedsYou onCount={setWaiting}>
        <OrgInvites />
        <VillageGuestInvites />
        {(profile?.is_hope_ambassador || isAdmin) && <NearbyNeedTiles />}
      </NeedsYou>

      {/* Oct 28 (Jade): Quick buttons stay, with "Change these buttons", so nothing is lost.
          They now start with only the ones the top and bottom bars don't already have. */}
      <QuickActions />

      {/* Oct 28 (Jade): under the cottage map, Your places is left out. Every place in it is
          already on the map, in the top and bottom bars, or in My Tools. */}
      {!embedded && <YourPlaces />}

      {/* Nov 1 (Jade): under the cottage map, Coming up and Emergency are slim bars. */}
      <ComingUp slim={embedded} />

      {/* One setup reminder at a time: only the first one that has something to say shows. */}
      <div className="today-setup">
        <VillageAsk />
        <PushBanner />
        <RecoveryNudge />
        <InstallBanner />
        <AmbassadorBanner />
      </div>

      {embedded ? (
        <button type="button" data-tour="emergency" className="today-slim today-slim-warn" onClick={() => navigate('/emergency')}>
          <Icon name="cat-emergency" size={28} />
          <span className="today-slim-text"><b>{t('Emergency Response')}</b><small>{t('Floods, storms, fires, outages')}</small></span>
          <span className="today-slim-go" aria-hidden="true">&#8250;</span>
        </button>
      ) : (
      <button data-tour="emergency" onClick={() => navigate('/emergency')} style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", marginTop: "1.25rem", padding: "1rem 1.25rem", borderRadius: "12px", border: "2px solid var(--warn)", background: "linear-gradient(135deg, var(--warn-bg), var(--warn-bg))", cursor: "pointer", textAlign: "left" }}>
        <span aria-hidden="true" style={{ flexShrink: 0, display: "flex" }}><Icon name="cat-emergency" size={40} /></span>
        <div>
          <span style={{ display: "block", color: "var(--gold)", fontWeight: 700, fontSize: "1rem" }}>{t('Emergency Response')}</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>{t('Floods, storms, fires, and outages that hit many neighbors')}</span>
        </div>
      </button>
      )}
    </div>
  )
}
