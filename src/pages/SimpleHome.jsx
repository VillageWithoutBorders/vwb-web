import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { supabase } from '../supabaseClient'
import { saveSimpleView } from '../utils/simpleView'
import Icon from '../components/Icon'
import { forTitle } from '../utils/forSomeone'
import OrgInvites from '../components/OrgInvites'
import VillageGuestInvites from '../components/VillageGuestInvites'
import { orgWords } from '../utils/roleWords'

// Simple view home: four big buttons, your village and groups, what's waiting, and the emergency button.
// Replaces the globe as the first screen when Simple view is on.

function hello() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const STATUS = {
  open: 'Waiting for a helper',
  accepted: 'A helper said yes',
}

export default function SimpleHome() {
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

  const first = (profile?.display_name || '').trim().split(/\s+/)[0]
  const waiting = unreadCount > 0 || (mine && mine.length > 0)

  return (
    <div className="sh-page">
      <h1 className="sh-hello">{hello()}{first ? ', ' + first : ''}.</h1>
      <p className="sh-sub">What would you like to do?</p>

      {done && (
        <div className="sh-done" role="status">
          <Icon name="check" size={32} />
          <span>{done}</span>
          <button type="button" className="sh-done-x" onClick={() => setDone('')}>OK</button>
        </div>
      )}

      <div className="sh-buttons" data-tour="simple-buttons">
        <button type="button" className="sh-big sh-big-ask" onClick={() => navigate('/ask?skip=1')}>
          <Icon name="raise-hand" size={44} />
          <span><b>Find Help</b><small>Tell neighbors what you need</small></span>
        </button>
        <button type="button" className="sh-big" onClick={() => navigate('/community/resources')}>
          <Icon name="heart-hands" size={44} />
          <span><b>Find food, rides, and more</b><small>Places near you that can help today</small></span>
        </button>
        <button type="button" className="sh-big" onClick={() => navigate('/skillshare')}>
          <Icon name="heart" size={44} />
          <span><b>Offer Help</b><small>See who needs a hand</small></span>
        </button>
        <button type="button" className="sh-big" onClick={() => navigate('/messages')}>
          <Icon name="envelope" size={44} />
          <span><b>My messages</b><small>{unreadCount > 0 ? unreadCount + ' new' : 'Talk with neighbors'}</small></span>
        </button>
      </div>

      {/* Your home village (Oct 22): one plain button straight to it. */}
      <button type="button" className="sh-row sh-village" onClick={() => navigate(profile?.home_village_id ? '/village/' + profile.home_village_id : '/find-village')}>
        <Icon name="houses" size={32} />
        <span><b>{profile?.home_village_id ? 'My village' : 'Find my village'}</b><small>{profile?.home_village_id ? 'Your neighbors and your village chat' : 'Neighbors near your zip code'}</small></span>
        <span className="sh-arrow" aria-hidden="true">&#8250;</span>
      </button>

      {/* Your groups and emergency crews (Oct 27): one plain button each, straight to it. */}
      {(organizations || []).length > 0 && (
        <section className="sh-groups" aria-labelledby="sh-groups-h">
          <h2 id="sh-groups-h">My groups</h2>
          {organizations.map((o) => {
            const crew = o.kind === 'group'
            const role = orgWords(o).roleLabel[o.role] || 'Member'
            return (
              <button key={o.id} type="button" className="sh-row" onClick={() => navigate('/orgs/' + o.id)}>
                <Icon name={crew ? 'tent' : 'people'} size={32} />
                <span><b>{o.name}</b><small>{(crew ? 'Emergency crew' : 'Group') + '. You are ' + (/^[aeiou]/i.test(role) ? 'an ' : 'a ') + role.toLowerCase() + '.'}</small></span>
                <span className="sh-arrow" aria-hidden="true">&#8250;</span>
              </button>
            )
          })}
        </section>
      )}

      <OrgInvites />
      <VillageGuestInvites />

      <section className="sh-wait" aria-labelledby="sh-wait-h">
        <h2 id="sh-wait-h">Waiting on you</h2>
        {mine === null && <p className="sh-note" role="status">Loading...</p>}
        {mine !== null && !waiting && <p className="sh-note">Nothing right now. All is quiet.</p>}
        {unreadCount > 0 && (
          <button type="button" className="sh-row" onClick={() => navigate('/messages')}>
            <Icon name="envelope" size={32} />
            <span>You have {unreadCount} new {unreadCount === 1 ? 'message' : 'messages'}</span>
            <span className="sh-arrow" aria-hidden="true">&#8250;</span>
          </button>
        )}
        {(mine || []).map((r) => (
          <button key={r.id} type="button" className="sh-row" onClick={() => navigate(r.status === 'open' ? '/tasks?tab=requests' : '/tasks?tab=active')}>
            <Icon name="raise-hand" size={32} />
            <span>
              <b>{forTitle(r, 'Your request')}</b>
              <small>{STATUS[r.status] || ''}</small>
            </span>
            <span className="sh-arrow" aria-hidden="true">&#8250;</span>
          </button>
        ))}
      </section>

      <button type="button" className="sh-emergency" onClick={() => navigate('/emergency')}>
        <Icon name="cat-emergency" size={40} />
        <span><b>Emergency</b><small>Flood, storm, fire, or outage. In danger? Call 911 first.</small></span>
      </button>

      {/* Settings, easy to find (Oct 27, Jade). */}
      <button type="button" className="sh-row sh-settings" onClick={() => navigate('/settings')}>
        <Icon name="gear" size={32} />
        <span><b>Settings</b><small>Text size, light or dark, and Simple view</small></span>
        <span className="sh-arrow" aria-hidden="true">&#8250;</span>
      </button>

      <button type="button" className="sh-everything" disabled={busy} onClick={showEverything}>
        {busy ? 'Switching...' : 'Show me everything'}
      </button>
      <p className="sh-note sh-center">This turns off Simple view. You can turn it back on in Settings.</p>
    </div>
  )
}
