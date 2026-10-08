import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { supabase } from '../supabaseClient'
import { NEW_ACCOUNT_NOTE } from '../utils/newAccount'
import Messages from './Messages'

const Groups = lazy(() => import('./Groups'))
const Connections = lazy(() => import('./Connections'))
const HubVillages = lazy(() => import('../components/HubVillages'))
const HubOrganizations = lazy(() => import('../components/HubOrganizations'))

// The Messages tab: one place for every way to talk to people. The screen is
// the same for everyone; sections appear only when the person can use them.
//   Messages         everyone signed in (private chats and message requests)
//   Villages         everyone signed in (Announcements and joined village chats)
//   Cottage Chats    everyone signed in (private chats made with chosen people,
//   & Campfires      plus the Campfire chats of organizations they belong to)
//   Connections      everyone signed in
//   Organizations    only people who belong to an organization
//   Admin            only VWB admins and the founder
// Each organization sets its own privacy; this screen never lists anyone's
// members or opens anyone's chats for them.
export default function ConnectHub() {
  const { user, isAdmin, organizations, established } = useAuth()
  const { unreadCount } = useUnreadCount()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [villageUnread, setVillageUnread] = useState(0)

  const tabs = [
    { key: 'messages', label: 'Messages', badge: unreadCount },
    { key: 'villages', label: 'Villages', badge: villageUnread },
    { key: 'chats', label: 'Cottage Chats & Campfires' },
    { key: 'connections', label: 'Connections' },
    ...((organizations || []).length > 0 ? [{ key: 'orgs', label: 'Organizations' }] : []),
    ...(isAdmin ? [{ key: 'admin', label: 'Admin' }] : []),
  ]
  const asked = params.get('tab')
  const active = tabs.some((t) => t.key === asked) ? asked : 'messages'

  useEffect(() => {
    let alive = true
    function load() {
      supabase.rpc('campfire_unread').then(({ data, error }) => {
        if (!alive || error) return
        setVillageUnread((data || []).reduce((n, r) => n + Number(r.unread || 0), 0))
      })
    }
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [user?.id])

  const chip = (on) => ({
    flex: '1 1 auto', minHeight: '44px', padding: '0.4rem 0.9rem', borderRadius: '22px', border: 'none', cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: 600, background: on ? '#4ecca3' : '#2a2a2a', color: on ? '#1a1a1a' : '#ccc',
  })

  return (
    <div>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1rem 1rem 0', boxSizing: 'border-box' }}>
        <h1 style={{ margin: '0 0 0.25rem' }}>Messages</h1>
        <p className="cal-sub" style={{ marginTop: 0 }}>Chats, villages, and neighbors, all in one place.</p>
        {established === false && <p className="new-account-note" role="status">{NEW_ACCOUNT_NOTE}</p>}
        <div role="tablist" aria-label="Where to connect" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.75rem 0' }}>
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" id={'hub-tab-' + t.key} aria-selected={active === t.key} aria-controls="hub-panel" style={chip(active === t.key)}
              onClick={() => setParams(t.key === 'messages' ? {} : { tab: t.key }, { replace: true })}>
              {t.label}{t.badge > 0 && <span style={{ marginLeft: '0.4rem', background: '#ff4444', color: '#fff', borderRadius: '9px', padding: '0 6px', fontSize: '0.75rem' }}>{t.badge > 9 ? '9+' : t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id="hub-panel" aria-labelledby={'hub-tab-' + active}>
        {active === 'messages' && <Messages embedded />}
        <Suspense fallback={<p className="cal-empty" style={{ padding: '1rem' }}>Loading...</p>}>
          {active === 'villages' && <HubVillages />}
          {active === 'chats' && <Groups embedded />}
          {active === 'connections' && <Connections embedded />}
          {active === 'orgs' && <HubOrganizations />}
        </Suspense>
        {active === 'admin' && isAdmin && (
          <div className="cal-page">
            <section className="cal-card" aria-label="Admin tools">
              <div className="cal-card-title">Admin</div>
              <p className="cal-sub">Reports, removals, appeals, and organization approvals.</p>
              <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/admin')}>Open admin tools</button>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
