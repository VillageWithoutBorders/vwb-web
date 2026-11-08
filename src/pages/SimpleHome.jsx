import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { supabase } from '../supabaseClient'
import { saveSimpleView } from '../utils/simpleView'
import { startPath, setupWaiting } from '../utils/startPath'
import Icon from '../components/Icon'
import OrgInvites from '../components/OrgInvites'
import VillageGuestInvites from '../components/VillageGuestInvites'
import { orgWords } from '../utils/roleWords'
import { useT, t as tr } from '../utils/lang'

// Simple view home: four big buttons, your village and groups, what's waiting, and the emergency button.
// Replaces the globe as the first screen when Simple view is on.

function hello() {
  const h = new Date().getHours()
  return tr(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
}

const STATUS = {
  open: 'Waiting for a helper',
  accepted: 'A helper said yes',
}

export default function SimpleHome() {
  const t = useT()
  const { user, profile, refreshProfile, organizations } = useAuth()
  const { unreadCount } = useUnreadCount()
  const navigate = useNavigate()
  const location = useLocation()
  // A note from the page before, like "Your request has been posted."
  const [done, setDone] = useState(location.state?.message || '')
  const [mine, setMine] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    let alive = true
    supabase.from('help_requests')
      .select('id, skill_needed, status, created_at, for_name')
      .eq('requester_id', user.id)
      .in('status', ['open', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { console.error('Failed to load your requests:', error); setMine([]); return }
        setMine(data || [])
      })
    return () => { alive = false }
  }, [user])

  async function showEverything() {
    setBusy(true)
    await saveSimpleView(false)
    if (refreshProfile) await refreshProfile()
    setBusy(false)
    navigate('/')
    window.scrollTo(0, 0)
  }

  // Quick start (Nov 1): Full setup waits here until they want it, or say not now.
  const [setupHidden, setSetupHidden] = useState(false)
  const offerSetup = startPath(user) === 'quick' && setupWaiting(profile) && !setupHidden
  async function notNow() {
    setSetupHidden(true)
    const { error } = await supabase.rpc('set_my_setup_done')
    if (error) { console.error('Failed to hide setup:', error); return }
    if (refreshProfile) refreshProfile()
  }

  // "Anything you can share?" (Nov 7). Hidden on this phone once they say not now.
  const shareKey = 'vwb_share_nudge_off_' + (user?.id || '')
  const [shareOff, setShareOff] = useState(() => { try { return localStorage.getItem(shareKey) === '1' } catch { return false } })
  const askShare = !!user && !!profile && Array.isArray(profile.skills) && profile.skills.length === 0 && !shareOff
  function shareNotNow() {
    setShareOff(true)
    try { localStorage.setItem(shareKey, '1') } catch { /* private window: it just shows again next visit */ }
  }

  const first = (profile?.display_name || '').trim().split(/\s+/)[0]
  const waiting = unreadCount > 0 || (mine && mine.length > 0)

  const hasVillage = !!profile?.home_village_id
  const villageRow = (
    <button type="button" className={'sh-row sh-village' + (hasVillage ? '' : ' sh-start')} onClick={() => navigate(hasVillage ? '/village/' + profile.home_village_id : '/find-village')}>
      <Icon name="houses" size={32} />
      <span><b>{t(hasVillage ? 'My village' : 'Start here: find your village')}</b><small>{t(hasVillage ? 'Your neighbors and your village chat' : 'Meet neighbors near your zip code')}</small></span>
      <span className="sh-arrow" aria-hidden="true">&#8250;</span>
    </button>
  )

  return (
    <div className="sh-page">
      <h1 className="sh-hello">{hello()}{first ? ', ' + first : ''}.</h1>
      <p className="sh-sub">{t('What would you like to do?')}</p>

      {done && (
        <div className="sh-done" role="status">
          <Icon name="check" size={32} />
          <span>{done}</span>
          <button type="button" className="sh-done-x" onClick={() => setDone('')}>{t('OK')}</button>
        </div>
      )}

      {!hasVillage && villageRow}

      <div className="sh-buttons" data-tour="simple-buttons">
        <button type="button" className="sh-big sh-big-ask" onClick={() => navigate('/ask?skip=1')}>
          <Icon name="raise-hand" size={44} />
          <span><b>{t('Ask for Help')}</b><small>{t('Tell neighbors what you need. No shame in asking.')}</small></span>
        </button>
        <button type="button" className="sh-big" onClick={() => navigate('/community/resources')}>
          <Icon name="heart-hands" size={44} />
          <span><b>{t('Find food, rides, and more')}</b><small>{t('Places near you that can help today')}</small></span>
        </button>
        <button type="button" className="sh-big" onClick={() => navigate('/skillshare')}>
          <Icon name="heart" size={44} />
          <span><b>{t('Offer Help')}</b><small>{t('See who needs a hand')}</small></span>
        </button>
        <button type="button" className="sh-big" onClick={() => navigate('/messages')}>
          <Icon name="envelope" size={44} />
          <span><b>{t('My messages')}</b><small>{unreadCount > 0 ? t('{n} new', { n: unreadCount }) : t('Talk with neighbors')}</small></span>
        </button>
      </div>

      {/* Nov 7 (Jade): two columns on a computer that each stack on their own, so a tall
          box on one side never leaves a gap on the other. On a phone these wrappers
          step aside and everything shows in the usual order (see .sh-cols in index.css). */}
      <div className="sh-cols">
      <div className="sh-col">
      {/* Your home village (Oct 22): one plain button straight to it.
          No village yet (Nov 3, flow map): it moves to the top as the first step. */}
      {hasVillage && villageRow}

      {/* Events and offers (Nov 3, flow map): Simple view had no way to the Calendar
          or to offer something of your own. */}
      <button type="button" className="sh-row sh-events" onClick={() => navigate('/calendar')}>
        <Icon name="calendar" size={32} />
        <span><b>{t('Events near me')}</b><small>{t('Things to join, and shifts to help with')}</small></span>
        <span className="sh-arrow" aria-hidden="true">&#8250;</span>
      </button>
      <button type="button" className="sh-row sh-share" onClick={() => navigate('/post-offer')}>
        <Icon name="gift" size={32} />
        <span><b>{t('Share something I have')}</b><small>{t('A ride, a tool, your time, or a skill')}</small></span>
        <span className="sh-arrow" aria-hidden="true">&#8250;</span>
      </button>

      <section className="sh-wait" aria-labelledby="sh-wait-h">
        <h2 id="sh-wait-h">{t('Waiting on you')}</h2>
        {mine === null && <p className="sh-note" role="status">{t('Loading...')}</p>}
        {mine !== null && !waiting && <p className="sh-note">{t('Nothing right now. All is quiet.')}</p>}
        {unreadCount > 0 && (
          <button type="button" className="sh-row" onClick={() => navigate('/messages')}>
            <Icon name="envelope" size={32} />
            <span>{t(unreadCount === 1 ? 'You have 1 new message' : 'You have {n} new messages', { n: unreadCount })}</span>
            <span className="sh-arrow" aria-hidden="true">&#8250;</span>
          </button>
        )}
        {(mine || []).map((r) => (
          <button key={r.id} type="button" className="sh-row" onClick={() => navigate(r.status === 'open' ? '/tasks?tab=requests' : '/tasks?tab=active')}>
            <Icon name="raise-hand" size={32} />
            <span>
              <b>{r.for_name ? t('{skill} for {name}', { skill: t(r.skill_needed || 'Help request'), name: r.for_name.trim() }) : t(r.skill_needed || 'Your request')}</b>
              <small>{STATUS[r.status] ? t(STATUS[r.status]) : ''}</small>
            </span>
            <span className="sh-arrow" aria-hidden="true">&#8250;</span>
          </button>
        ))}
      </section>

      {/* Settings, easy to find (Oct 27, Jade). */}
      <button type="button" className="sh-row sh-settings" onClick={() => navigate('/settings')}>
        <Icon name="gear" size={32} />
        <span><b>{t('Settings')}</b><small>{t('Language, text size, light or dark, and Simple view')}</small></span>
        <span className="sh-arrow" aria-hidden="true">&#8250;</span>
      </button>

      </div>
      <div className="sh-col">
      {/* Your groups and emergency crews (Oct 27): one plain button each, straight to it. */}
      {(organizations || []).length > 0 && (
        <section className="sh-groups" aria-labelledby="sh-groups-h">
          <h2 id="sh-groups-h">{t('My groups')}</h2>
          {organizations.map((o) => {
            const crew = o.kind === 'group'
            const role = orgWords(o).roleLabel[o.role] || 'Member'
            return (
              <button key={o.id} type="button" className="sh-row" onClick={() => navigate('/orgs/' + o.id)}>
                <Icon name={crew ? 'tent' : 'people'} size={32} />
                <span><b>{o.name}</b><small>{t(crew ? 'Emergency crew' : 'Group') + '. ' + t(/^[aeiou]/i.test(role) ? 'You are an {role}.' : 'You are a {role}.', { role: t(role).toLowerCase() })}</small></span>
                <span className="sh-arrow" aria-hidden="true">&#8250;</span>
              </button>
            )
          })}
        </section>
      )}

      <OrgInvites />
      <VillageGuestInvites />

      <button type="button" className="sh-emergency" onClick={() => navigate('/emergency')}>
        <Icon name="cat-emergency" size={40} />
        <span><b>{t('Emergency')}</b><small>{t('Flood, storm, fire, or outage. In danger? Call 911 first.')}</small></span>
      </button>

      {/* Nov 7 (Jade): asking and offering side by side. People who have not picked
          anything they can share yet get one gentle nudge, until they pick or say not now. */}
      {askShare && (
        <section className="sh-setup" aria-labelledby="sh-share-h">
          <h2 id="sh-share-h">{t('Anything you can share?')}</h2>
          <button type="button" className="sh-row" onClick={() => navigate('/setup?step=skills&only=skills')}>
            <Icon name="heart-hands" size={32} />
            <span><b>{t('Pick what I can share')}</b><small>{t('Even listening counts.')}</small></span>
            <span className="sh-arrow" aria-hidden="true">&#8250;</span>
          </button>
          <button type="button" className="link-button sh-setup-no" onClick={shareNotNow}>{t('Not now')}</button>
        </section>
      )}

      {offerSetup && (
        <section className="sh-setup" aria-labelledby="sh-setup-h">
          <h2 id="sh-setup-h">{t('Want to set up more?')}</h2>
          <button type="button" className="sh-row" onClick={() => navigate('/setup')}>
            <Icon name="cottage" size={32} />
            <span><b>{t('Make your avatar and cottage')}</b><small>{t('About 10 minutes. This turns on the full app.')}</small></span>
            <span className="sh-arrow" aria-hidden="true">&#8250;</span>
          </button>
          <button type="button" className="link-button sh-setup-no" onClick={notNow}>{t('Not now')}</button>
        </section>
      )}

      </div>
      </div>

      <button type="button" className="sh-everything" disabled={busy} onClick={showEverything}>
        {t(busy ? 'Switching...' : 'Show me everything')}
      </button>
      <p className="sh-note sh-center">{t('This turns off Simple view. You can turn it back on in Settings.')}</p>
    </div>
  )
}
