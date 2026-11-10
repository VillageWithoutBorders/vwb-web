import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { supabase } from '../supabaseClient'
import { NEW_ACCOUNT_NOTE } from '../utils/newAccount'
import Messages from './Messages'
import Conversation from './Conversation'
import Icon from '../components/Icon'
import { useWideScreen } from '../hooks/useWideScreen'
import { useSimpleView } from '../utils/simpleView'
import { useT } from '../utils/lang'
import '../desktop-chats.css'

const Groups = lazy(() => import('./Groups'))
const Connections = lazy(() => import('./Connections'))
const HubVillages = lazy(() => import('../components/HubVillages'))
const HubOrganizations = lazy(() => import('../components/HubOrganizations'))
// Nov 7 (Jade): village chats and group chats open beside the list on a computer too.
const Campfire = lazy(() => import('./Campfire'))
const GroupBoard = lazy(() => import('./GroupBoard'))

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
  const { unreadCount, newBoards } = useUnreadCount()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [villageUnread, setVillageUnread] = useState(0)
  const simple = useSimpleView()
  const t = useT()

  // Simple view: just private messages and Cottage Chats.
  const tabs = simple ? [
    { key: 'messages', label: 'Private messages', badge: unreadCount },
    { key: 'cottage', label: 'Group chats' },
  ] : [
    { key: 'messages', label: 'Messages', badge: unreadCount },
    { key: 'villages', label: 'Village Square', badge: villageUnread },
    { key: 'cottage', label: 'Cottage Chats' },
    { key: 'campfires', label: 'Campfires' },
    { key: 'connections', label: 'Connections' },
    ...((organizations || []).length > 0 ? [{ key: 'orgs', label: 'Groups' }] : []),
    ...(isAdmin ? [{ key: 'admin', label: 'Admin' }] : []),
  ]
  // Older links said tab=chats: that is the Cottage Chats tab now.
  const asked = params.get('tab') === 'chats' ? 'cottage' : params.get('tab')
  const active = tabs.some((tb) => tb.key === asked) ? asked : 'messages'

  // Round D (Nov 10, Jade): three tabs instead of seven. People (private messages and
  // Connections), Places (Village Square, Cottage Chats, Campfires), Groups. Admin for admins.
  // Each kind of chat is still here, one tap further, so old ?tab= links keep working.
  const FAMILIES = simple ? null : [
    { key: 'people', label: 'People', parts: ['messages', 'connections'], badge: unreadCount },
    { key: 'places', label: 'Places', parts: ['villages', 'cottage', 'campfires'], badge: villageUnread + ((newBoards && newBoards.size) || 0) },
    ...((organizations || []).length > 0 ? [{ key: 'groups', label: 'Groups', parts: ['orgs'] }] : []),
    ...(isAdmin ? [{ key: 'admin', label: 'Admin', parts: ['admin'] }] : []),
  ]
  const family = FAMILIES ? (FAMILIES.find((f) => f.parts.includes(active)) || FAMILIES[0]) : null
  const partLabel = (k) => (tabs.find((tb) => tb.key === k) || {}).label || k
  const partBadge = (k) => (tabs.find((tb) => tb.key === k) || {}).badge || 0
  const goPart = (k) => setParams(k === 'messages' ? {} : { tab: k }, { replace: true })

  // Nov 1 (Jade): on a computer, Messages is side by side. The chat list stays on
  // the left and the chat you pick opens on the right (?c=<id>, so links work).
  // Phones and Simple view open a chat on its own page, as before.
  const wide = useWideScreen()
  // Nov 7 (Jade): every kind of chat works this way, not only private messages.
  // Village Square: ?tab=villages&open=<board id> ('square' means the main one).
  // Cottage Chats and Campfires: ?tab=cottage|campfires&open=<chat id>.
  const SPLIT_TABS = ['messages', 'villages', 'cottage', 'campfires']
  const split = wide && !simple && SPLIT_TABS.includes(active)
  const openId = params.get('c')
  const openBoard = params.get('open')
  function openOther(id, extra) { setParams({ tab: active, open: id, ...(extra || {}) }, { replace: true }) }
  function closeOther() { setParams({ tab: active }, { replace: true }) }
  const reportFor = params.get('report') === '1'
  function openChat(id, opts) { setParams(opts?.report ? { c: id, report: '1' } : { c: id }, { replace: true }) }
  function closeChat() { setParams({}, { replace: true }) }
  // A chat link on a phone (or a screen made narrow) opens the chat's own page.
  useEffect(() => {
    if (!split && openId && active === 'messages') navigate('/conversation/' + openId, { replace: true })
  }, [split, openId, active]) // eslint-disable-line react-hooks/exhaustive-deps
  // On a phone (or a screen made narrow, or Simple view) a village or group chat
  // link opens that chat's own page, as before.
  useEffect(() => {
    if (split || !openBoard) return
    if (active === 'villages') navigate('/village-square' + (openBoard === 'square' ? '' : '?board=' + encodeURIComponent(openBoard)), { replace: true })
    else if (active === 'cottage' || active === 'campfires') navigate('/groups/' + openBoard, { replace: true })
  }, [split, openBoard, active]) // eslint-disable-line react-hooks/exhaustive-deps
  // The report window opens once; take report=1 off the address after.
  useEffect(() => {
    if (split && reportFor && openId) setParams({ c: openId }, { replace: true })
  }, [split, reportFor, openId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    function load() {
      supabase.rpc('campfire_unread').then(({ data, error }) => {
        if (!alive || error) return
        setVillageUnread((data || []).reduce((n, r) => n + Number(r.unread || 0), 0))
      })
    }
    load()
    const timer = setInterval(load, 30000)
    return () => { alive = false; clearInterval(timer) }
  }, [user?.id])

  const chip = (on) => ({
    minHeight: '48px', padding: '0.35rem 0.6rem', borderRadius: '12px', lineHeight: 1.2, border: 'none', cursor: 'pointer',
    fontSize: '1rem', fontWeight: 600, background: on ? 'var(--accent)' : 'var(--surface-2)', color: on ? 'var(--on-accent)' : 'var(--text-soft)',
  })

  const head = (
      <div className="hub-head" style={{ maxWidth: '640px', margin: '0 auto', padding: '1rem 1rem 0', boxSizing: 'border-box' }}>
        <h1 style={{ margin: '0 0 0.25rem' }}>{t('Messages')}</h1>
        <p className="cal-sub" style={{ marginTop: 0 }}>{simple ? t('Talk with one neighbor, or with a few people you chose.') : t('Chats, villages, and neighbors, all in one place.')}</p>
        {/* Round D (Nov 10): the new-account note folds to one line, so chats show sooner. */}
        {established === false && (
          <details className="new-account-note hub-new-note">
            <summary>{t('New account: a few things open up soon')}</summary>
            <p>{t(NEW_ACCOUNT_NOTE)}</p>
          </details>
        )}
        {FAMILIES ? (<>
          <div role="tablist" aria-label={t('Where to connect')} className="hub-tabs hub-tabs-three">
            {FAMILIES.map((f) => (
              <button key={f.key} type="button" role="tab" id={'hub-tab-' + f.key} aria-selected={family.key === f.key} aria-controls="hub-panel" style={chip(family.key === f.key)}
                onClick={() => goPart(f.parts[0])}>
                {t(f.label)}{f.badge > 0 && <span className="hub-tab-count">{f.badge > 9 ? '9+' : f.badge}</span>}
              </button>
            ))}
          </div>
          {family.parts.length > 1 && (
            <div className="hub-subtabs" role="group" aria-label={t(family.label)}>
              {family.parts.map((k) => (
                <button key={k} type="button" className={'hub-subtab' + (active === k ? ' on' : '')} aria-pressed={active === k} onClick={() => goPart(k)}>
                  {t(partLabel(k))}{partBadge(k) > 0 && <span className="hub-tab-count">{partBadge(k) > 9 ? '9+' : partBadge(k)}</span>}
                </button>
              ))}
            </div>
          )}
        </>) : (
        <div role="tablist" aria-label={t('Where to connect')} className="hub-tabs">
          {tabs.map((tb) => (
            <button key={tb.key} type="button" role="tab" id={'hub-tab-' + tb.key} aria-selected={active === tb.key} aria-controls="hub-panel" style={chip(active === tb.key)}
              onClick={() => goPart(tb.key)}>
              {t(tb.label)}{tb.badge > 0 && <span className="hub-tab-count">{tb.badge > 9 ? '9+' : tb.badge}</span>}
            </button>
          ))}
        </div>
        )}
      </div>
  )

  if (split) {
    return (
      <div className="hub-split">
        <div className="hub-left">
          {head}
          <div role="tabpanel" id="hub-panel" aria-labelledby={'hub-tab-' + (family ? family.key : active)}>
            {active === 'messages' && <Messages embedded onOpen={openChat} selectedId={openId} />}
            <Suspense fallback={<p className="cal-empty" style={{ padding: '1rem' }}>{t('Loading...')}</p>}>
              {active === 'villages' && <HubVillages onOpen={(id) => openOther(id)} selectedId={openBoard} />}
              {active === 'cottage' && <Groups embedded show="cottage" onOpen={(id) => openOther(id)} selectedId={openBoard} />}
              {active === 'campfires' && <Groups embedded show="campfires" onOpen={(id) => openOther(id)} selectedId={openBoard} />}
            </Suspense>
          </div>
        </div>
        <section className="hub-right" aria-label={t('Open chat')}>
          {active === 'messages' && openId
            ? <Conversation key={openId} convoId={openId} pane openReport={reportFor} onClose={closeChat} />
            : active === 'villages' && openBoard
              ? <Suspense fallback={<p className="hub-pick">{t('Loading...')}</p>}><div className="hub-pane-fill"><Campfire key="square" pane /></div></Suspense>
              : (active === 'cottage' || active === 'campfires') && openBoard
                ? <Suspense fallback={<p className="hub-pick">{t('Loading...')}</p>}><div className="hub-pane-fill"><GroupBoard key={openBoard} pane boardId={openBoard} onOpen={(id) => openOther(id)} onClose={closeOther} /></div></Suspense>
                : (
                  <div className="hub-pick">
                    <Icon name="chat-bubble" size={40} />
                    <p>{t('Pick a chat on the left to read it here.')}</p>
                  </div>
                )}
        </section>
      </div>
    )
  }

  return (
    <div>
      {head}

      <div role="tabpanel" id="hub-panel" aria-labelledby={'hub-tab-' + (family ? family.key : active)}>
        {active === 'messages' && <Messages embedded />}
        <Suspense fallback={<p className="cal-empty" style={{ padding: '1rem' }}>{t('Loading...')}</p>}>
          {active === 'villages' && <HubVillages />}
          {active === 'cottage' && <Groups embedded show={simple ? 'all' : 'cottage'} />}
          {active === 'campfires' && <Groups embedded show="campfires" />}
          {active === 'connections' && <Connections embedded />}
          {active === 'orgs' && <HubOrganizations />}
        </Suspense>
        {active === 'admin' && isAdmin && (
          <div className="cal-page">
            <section className="cal-card" aria-label={t('Admin tools')}>
              <div className="cal-card-title">{t('Admin')}</div>
              <p className="cal-sub">{t('Reports, removals, appeals, and group approvals.')}</p>
              <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px' }} onClick={() => navigate('/admin')}>{t('Open admin tools')}</button>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
