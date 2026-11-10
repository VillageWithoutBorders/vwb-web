import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AppMenu from '../components/AppMenu'
import Icon from '../components/Icon'
import CornerRoom, { ROOM_READY } from '../components/CornerRoom'
import { useWideScreen } from '../hooks/useWideScreen'
import { useBackCloses } from '../hooks/useBackCloses'
import { useSimpleView } from '../utils/simpleView'
import { useT } from '../utils/lang'
import { openMyQr } from '../utils/qrSheet'
import ToolsSheet, { EMERGENCY, toolRows } from '../components/ToolsSheet'
import { useMyTools } from '../hooks/useMyTools'
import { useAdminInbox } from '../hooks/useAdminInbox'
import { useEmergenciesICanHelp } from '../hooks/useEmergenciesICanHelp'

// My Corner (/me): only the things that are yours and live nowhere else.
// Nov 10 (Jade), top to bottom:
//   0. Emergency, only for people with an Emergency role (Round A3: two taps was too slow)
//   1. Your card, with "My profile"
//   2. A nudge, only when someone says they know you and is waiting for your answer
//   3. Show my code to connect, Scan a code
//   4. Settings
//   5. Your roles, only with a role (on a computer it opens on the right side)
//   6. Your things: My story
//   7. About the app   8. Village Without Borders   9. Log out, alone
// Gone from here: Vouches and trust (on your profile), My cottage and Map of my villages
// (top bar), Edit my profile (the card), Cottage Chats and Campfires (Messages),
// Past tasks (your profile), My QR code (the Show my code button), Admin panel (Your roles).
export default function YourCorner() {
  const t = useT()
  const { user, profile, isAdmin, organizations } = useAuth()
  const [avatarFailed, setAvatarFailed] = useState(false)
  const simple = useSimpleView()
  // Your roles: the tools your roles give you (Admin, Ambassador, Organizer, crews, villages you keep).
  const tools = useMyTools()
  const { total: adminWaiting } = useAdminInbox()
  const [rolesOpen, setRolesOpen] = useState(false)
  const rolesBtn = useRef(null)
  const [scanOpen, setScanOpen] = useState(false)
  const scanBtn = useRef(null)
  // Your avatar from the avatar builder, or the same drawn avatar others see. The letter shows only if it can't load.
  const avatarSrc = profile?.avatar_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + (user?.id || 'default')
  const name = profile?.display_name || t('Neighbor')
  const letter = (name.trim().charAt(0) || '?').toUpperCase()
  const place = profile?.neighborhood || (profile?.zip_code ? t('Zip {zip}', { zip: profile.zip_code }) : '')

  // People who say they know you and are waiting for your answer (the same list your
  // profile shows). Only the count is read here. Nothing shows when there are none.
  const [knowsWaiting, setKnowsWaiting] = useState(0)
  useEffect(() => {
    if (!user?.id) return
    let alive = true
    supabase.from('vouch_requests').select('voucher_id', { count: 'exact', head: true }).eq('vouchee_id', user.id)
      .then(({ count, error }) => {
        if (error) { console.error('[YourCorner] vouch requests', error); return }
        if (alive) setKnowsWaiting(count || 0)
      })
    return () => { alive = false }
  }, [user?.id])

  // Nov 7 (Jade): on a computer, your cottage sits beside your corner.
  const wide = useWideScreen()
  const split = !simple && wide
  // People who can act in an emergency: VWB admins, Hope Ambassadors, and the Keepers and
  // Helpers of an emergency crew. Their Emergency button sits at the very top of the page,
  // so it leaves the Your roles list. Other role holders keep the row there.
  const emergencyRole = !!(isAdmin || profile?.is_hope_ambassador
    || (organizations || []).some((o) => o.kind === 'group' && (o.role === 'admin' || o.role === 'organizer')))
  const roleRows = emergencyRole ? toolRows(tools, adminWaiting) : [...toolRows(tools, adminWaiting), EMERGENCY]

  // Nov 10 (Jade): the Emergency button says at a glance whether anything is open.
  // Open: verified emergencies this person can act on (the same list as the banner).
  // To check: reported but not checked yet, in villages a Hope Ambassador or admin can check.
  const openNow = useEmergenciesICanHelp()
  const [toCheck, setToCheck] = useState(0)
  const checker = !!(isAdmin || profile?.is_hope_ambassador)
  useEffect(() => {
    if (!user?.id || !checker) return undefined
    let alive = true
    supabase.rpc('emergencies_i_can_check').then(({ data, error }) => {
      if (error) { console.error('[YourCorner] emergencies to check', error); return }
      if (alive) setToCheck((data || []).length)
    })
    return () => { alive = false }
  }, [user?.id, checker])
  const emNote = openNow.length > 0
    ? (openNow.length === 1 ? t('1 open near you') : t('{n} open near you', { n: openNow.length }))
    : t('None open now')
  const emCheck = toCheck > 0 ? (toCheck === 1 ? t('1 waiting for a check') : t('{n} waiting for a check', { n: toCheck })) : ''

  // Your things (Nov 10): one row. On a computer it sits on the right, under the room.
  const thingsList = (hid) => (
    <section className="corner-group" aria-labelledby={hid}>
      <h2 id={hid} className="corner-group-h">{t('Your things')}</h2>
      <nav aria-labelledby={hid} className="corner-list">
        <Link to="/trail" className="corner-item">
          <span aria-hidden="true"><Icon name="compass" /></span>
          <span className="corner-item-text">{t('My story')}<small>{t('Your story here, step by step')}</small></span>
          <span className="corner-arrow" aria-hidden="true">›</span>
        </Link>
      </nav>
    </section>
  )

  // Your roles. Phones: the tools, right on the page. Computers: one row that opens them
  // on the right side, so the page still fits one screen.
  const roles = tools.length > 0 && (split ? (
    <button type="button" className="corner-item corner-item-btn corner-roles-row" data-tour="top-tools" aria-haspopup="dialog" onClick={(e) => { rolesBtn.current = e.currentTarget; setRolesOpen(true) }}>
      <span aria-hidden="true"><Icon name="toolbox" /></span>
      {adminWaiting > 0
        ? <span className="corner-item-text">{t('Your roles')}<small>{t('{n} waiting in the Admin inbox', { n: adminWaiting })}</small></span>
        : t('Your roles')}
      <span className="corner-arrow" aria-hidden="true">›</span>
    </button>
  ) : (
    <section className="corner-group" aria-labelledby="corner-roles-h" data-tour="top-tools">
      <h2 id="corner-roles-h" className="corner-group-h">{t('Your roles')}</h2>
      <nav aria-labelledby="corner-roles-h" className="corner-list">
        {roleRows.map((r) => (
          <Link key={r.key} to={r.to} className="corner-item">
            <span aria-hidden="true"><Icon name={r.icon} /></span>
            {r.name || r.note
              ? <span className="corner-item-text">{t(r.label)}{r.name && <small>{r.name}</small>}{r.note && <small>{t(r.note, r.noteVars)}</small>}</span>
              : t(r.label)}
            <span className="corner-arrow" aria-hidden="true">›</span>
          </Link>
        ))}
      </nav>
    </section>
  ))

  const page = (
    <div className={'corner-page' + (split ? ' corner-page-full' : '')}>
      {/* Nov 8 (Jade): side by side, the title sits above both sides so their boxes line up. */}
      {!split && <h1 className="corner-title">{t('My Corner')}</h1>}

      {emergencyRole && (
        <Link to="/emergency" className={'corner-emergency' + (openNow.length || toCheck ? ' corner-emergency-live' : '')} data-tip={t('Emergency: see the emergencies that are open and help respond.')}>
          <Icon name="siren" size={28} />
          <span className="corner-emergency-text">
            <b>{t('Emergency')}</b>
            <small>{emNote}{emCheck ? '. ' + emCheck : ''}</small>
          </span>
          {openNow.length + toCheck > 0 && <span className="corner-emergency-count" aria-hidden="true">{openNow.length + toCheck > 9 ? '9+' : openNow.length + toCheck}</span>}
          <span className="corner-emergency-go" aria-hidden="true">›</span>
        </Link>
      )}

      <Link to="/profile" className="corner-card">
        {avatarFailed
          ? <span className="corner-letter" aria-hidden="true">{letter}</span>
          : <img className="corner-avatar" src={avatarSrc} alt="" width="120" height="120" onError={() => setAvatarFailed(true)} />}
        <span className="corner-who">
          <b>{name}</b>
          {place && <span>{place}</span>}
          {profile?.is_hope_ambassador && <span className="corner-chip">{t('Hope Ambassador')}</span>}
          <span className="corner-see">{t('My profile')} ›</span>
        </span>
      </Link>

      {knowsWaiting > 0 && (
        <Link to="/profile#vouches" className="corner-item corner-nudge">
          <span aria-hidden="true"><Icon name="handshake" /></span>
          <span className="corner-item-text">{knowsWaiting === 1 ? t('Someone says they know you. Is that right?') : t('{n} people say they know you. Is that right?', { n: knowsWaiting })}</span>
          <span className="corner-arrow" aria-hidden="true">›</span>
        </Link>
      )}

      {!split && !simple && ROOM_READY && (
        <section className="corner-room-preview" aria-labelledby="corner-room-h">
          <h2 id="corner-room-h" className="pp-cottage-h">{t('Inside your cottage')}</h2>
          <CornerRoom />
          <p className="pp-cottage-note">{t('Tap something in the room.')}</p>
        </section>
      )}

      <div className="corner-codes">
        <button type="button" className="btn btn-primary corner-code-btn" onClick={openMyQr}>
          <span aria-hidden="true"><Icon name="qr-code" /></span> {t('Show my code to connect')}
        </button>
        <button type="button" className="btn btn-outline corner-code-btn" aria-haspopup="dialog" onClick={(e) => { scanBtn.current = e.currentTarget; setScanOpen(true) }}>
          <span aria-hidden="true"><Icon name="phone" /></span> {t('Scan a code')}
        </button>
      </div>

      <Link to="/settings" className="corner-item corner-settings">
        <span aria-hidden="true"><Icon name="gear" /></span>
        <span className="corner-item-text">{t('Settings')}<small>{t('Language, text size, light or dark, Simple view, less motion')}</small></span>
        <span className="corner-arrow" aria-hidden="true">›</span>
      </Link>

      {roles}

      {!split && thingsList('corner-things')}

      {/* On a computer, About the app and Village Without Borders sit on the right. */}
      <AppMenu inline only={split ? ['logout'] : ['about', 'vwb', 'logout']} />
    </div>
  )

  const sheets = <>
    {rolesOpen && (
      <ToolsSheet id="corner-roles-title" title={t('Your roles')} rows={roleRows}
        onClose={(refocus) => { setRolesOpen(false); if (refocus && rolesBtn.current && rolesBtn.current.focus) rolesBtn.current.focus() }} />
    )}
    {scanOpen && <ScanHelp onClose={() => { setScanOpen(false); if (scanBtn.current && scanBtn.current.focus) scanBtn.current.focus() }} />}
  </>

  if (!split) return <>{page}{sheets}</>
  return (
    <>
    <h1 className="corner-title corner-title-wide">{t('My Corner')}</h1>
    <div className="corner-split">
      <div className="corner-split-main">{page}</div>
      <div className="corner-split-side">
      <aside className={'pp-cottage corner-room-panel' + (ROOM_READY ? '' : ' corner-room-plain')} aria-labelledby={ROOM_READY ? 'corner-room-side-h' : 'corner-things-side'}>
        {ROOM_READY && <>
          <h2 id="corner-room-side-h" className="pp-cottage-h">{t('Inside your cottage')}</h2>
          <CornerRoom />
          <p className="pp-cottage-note">{t('Each thing in the room opens part of your corner. Hold your mouse over one to see what it is.')}</p>
        </>}
        <div className="corner-room-things">{thingsList('corner-things-side')}</div>
      </aside>
      <div className="corner-side-menu"><AppMenu inline only={['about', 'vwb']} /></div>
      </div>
    </div>
    {sheets}
    </>
  )
}

// Scan a code (Nov 10, Jade). There is no scanner inside the app: a phone's own camera
// reads a neighbor's code and offers the link. This says so in three steps.
function ScanHelp({ onClose }) {
  const t = useT()
  const headRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (headRef.current) headRef.current.focus()
    function onKey(e) { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // The phone's Back button closes the pop-up.
  useBackCloses(closeRef)
  return (
    <div className="tools-shade qr-shade" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tools-sheet qr-sheet" role="dialog" aria-modal="true" aria-labelledby="scan-help-h">
        <div className="qr-sheet-top">
          <h2 id="scan-help-h" tabIndex={-1} ref={headRef}>{t('Scan a code')}</h2>
          <button type="button" className="btn btn-outline qr-sheet-close" onClick={onClose}>{t('Close')}</button>
        </div>
        <ol className="scan-steps">
          <li>{t('Open the camera on your phone.')}</li>
          <li>{t("Point it at your neighbor's code.")}</li>
          <li>{t('Tap the link that shows. It opens here and connects you.')}</li>
        </ol>
        <p className="mycode-lead">{t('Only scan the code of someone you have met.')}</p>
      </div>
    </div>
  )
}
