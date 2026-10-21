import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import SpotIcon from '../components/SpotIcon'
import { useAuth } from '../context/AuthContext'
import { useUnreadCount } from '../context/UnreadCountContext'
import { VILLAGE_SPOTS, LIFE_ART, FIRE_SIZE, FIRE_WORDS } from '../data/worldElements'
import SisterCampfireButton from '../components/SisterCampfireButton'
import VillageRooms from '../components/VillageRooms'
import '../village-scene.css'
import Icon from '../components/Icon'

// The Village page: one village as a little world. Every element on the
// hills is a button that goes to its own page. A plain list sits below for
// anyone who would rather tap a list. Names follow the VWB Vocabulary sheet.
// Route: /village/:id

export default function VillageScene() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { unreadCount } = useUnreadCount()

  const [village, setVillage] = useState(null)
  const [allVillages, setAllVillages] = useState([])
  const [loadError, setLoadError] = useState('')
  const [board, setBoard] = useState(null)
  const [chatUnread, setChatUnread] = useState(0)
  const [keepers, setKeepers] = useState(null)
  const [keeperNames, setKeeperNames] = useState([])
  const [isGuest, setIsGuest] = useState(false)
  const [sisters, setSisters] = useState([])
  const [sisterFires, setSisterFires] = useState([])
  const [rooms, setRooms] = useState([])
  const [orgs, setOrgs] = useState([])
  const [sheet, setSheet] = useState(null)
  const [bump, setBump] = useState(null)
  // A waiting ask from the founder to keep this village (vwb-founder-keeper.sql).
  const [keeperAsk, setKeeperAsk] = useState(null)
  const sheetRef = useRef(null)
  const lastFocus = useRef(null)

  useEffect(() => {
    if (!user) return
    let alive = true
    supabase.rpc('my_keeper_offers').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('[VillageScene] keeper asks failed:', error); return }
      setKeeperAsk((data || []).find((o) => o.village_id === id) || null)
    })
    return () => { alive = false }
  }, [user, id])

  // The village itself, and the others (for sister names).
  useEffect(() => {
    let alive = true
    setVillage(null); setLoadError('')
    supabase.rpc('village_network').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load villages:', error); setLoadError("We couldn't load this village. Check your connection and try again."); return }
      const rows = data || []
      setAllVillages(rows)
      const v = rows.find((r) => r.id === id)
      if (!v) { setLoadError("We couldn't find this village. It may have closed."); return }
      setVillage(v)
    })
    return () => { alive = false }
  }, [id])

  // The village chat and its unread count.
  useEffect(() => {
    let alive = true
    supabase.from('campfire_boards').select('id, name').eq('village_id', id).eq('archived', false).order('sort_order').limit(1).then(({ data: rows, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load the village chat:', error); return }
      const data = (rows || [])[0] || null
      setBoard(data)
      if (!data) return
      supabase.rpc('campfire_unread').then(({ data: u, error: uErr }) => {
        if (!alive) return
        if (uErr) { console.error('Failed to load unread village chats:', uErr); return }
        const row = (u || []).find((r) => r.board_id === data.id)
        setChatUnread(row ? Number(row.unread) : 0)
      })
    })
    return () => { alive = false }
  }, [id])

  // Members only: this village's Campfires and Sidechats I can see.
  function loadRooms() {
    supabase.rpc('village_rooms', { p_village: id }).then(({ data, error }) => {
      if (error) { console.error('Failed to load Campfires and Sidechats:', error); return }
      setRooms(data || [])
    })
  }
  useEffect(() => {
    if (!village || !village.is_mine) { setRooms([]); return }
    loadRooms()
  }, [village, id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The living scene: lit cottages, fire size, Keeper lantern (counts in steps only).
  const [life, setLife] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.rpc('village_scene_life', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      // Before the SQL file is run, the scene simply looks the way it always has.
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load village life:', error); return }
      setLife((Array.isArray(data) ? data[0] : data) || null)
    })
    return () => { alive = false }
  }, [id])

  // Members only: keepers and whether I came in as a guest.
  useEffect(() => {
    if (!village || !village.is_mine) { setKeepers(null); setIsGuest(false); return }
    let alive = true
    supabase.rpc('village_keepers_info', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load keepers:', error); return }
      const row = (data || [])[0] || null
      setKeepers(row)
      const ids = row ? [row.starter_id, ...(row.helper_ids || [])].filter(Boolean) : []
      if (!ids.length) { setKeeperNames([]); return }
      supabase.from('helper_profiles_public').select('user_id, display_name').in('user_id', ids).then(({ data: p, error: pErr }) => {
        if (!alive) return
        if (pErr) { console.error('Failed to load keeper names:', pErr); return }
        const byId = Object.fromEntries((p || []).map((r) => [r.user_id, r.display_name]))
        setKeeperNames(ids.map((k) => byId[k]).filter(Boolean))
      })
    })
    supabase.rpc('village_guest_ids', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load guests:', error); return }
      setIsGuest((data || []).some((g) => g.user_id === user.id))
    })
    return () => { alive = false }
  }, [village, id, user.id])

  // Sister villages and organizations working here.
  useEffect(() => {
    let alive = true
    supabase.rpc('village_sister_list').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load sister villages:', error); return }
      setSisters((data || []).filter((s) => s.village_a === id || s.village_b === id).map((s) => (s.village_a === id ? s.village_b : s.village_a)))
    })
    supabase.rpc('sister_campfires', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load Sister Campfires:', error); return }
      setSisterFires((data || []).filter((c) => !c.closed_at))
    })
    supabase.rpc('org_village_links').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load organizations working here:', error); return }
      const here = (data || []).filter((r) => r.village_id === id).map((r) => ({ id: r.org_id, name: r.org_name, kind: 'organization' }))
      setOrgs(here)
      if (!here.length) return
      // Which of these are emergency response Groups (tent) and which are organizations.
      supabase.from('organizations').select('id, kind').in('id', here.map((o) => o.id)).then(({ data: kinds, error: kErr }) => {
        if (!alive) return
        if (kErr) { console.error('Failed to load group kinds:', kErr); return }
        const k = Object.fromEntries((kinds || []).map((x) => [x.id, x.kind]))
        setOrgs(here.map((o) => ({ ...o, kind: k[o.id] || 'organization' })))
      })
    })
    return () => { alive = false }
  }, [id])

  // Sheet: Escape closes, focus goes in and comes back.
  useEffect(() => {
    if (!sheet) return
    const first = sheetRef.current && sheetRef.current.querySelector('button, a')
    if (first) first.focus()
    function onKey(e) { if (e.key === 'Escape') closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  function openSheet(s) { lastFocus.current = document.activeElement; setSheet(s) }
  function closeSheet() {
    setSheet(null)
    if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus()
  }

  const mine = !!(village && village.is_mine)
  const nameOf = (vid) => (allVillages.find((v) => v.id === vid) || {}).name || 'A village'

  function info(k) {
    switch (k) {
      case 'charter': return { sub: 'Our story, what we care about, and house rules' }
      case 'sisters': return { sub: sisters.length ? sisters.length + ' sister village' + (sisters.length === 1 ? '' : 's') : 'No sister villages yet' }
      case 'keeper': return { sub: keeperNames.length ? 'Looked after by ' + keeperNames.join(', ') : life && !life.has_keeper ? 'Keeper wanted: this village needs someone to look after it' : 'The neighbor who looks after this village' }
      case 'chat': return { sub: mine ? (chatUnread ? chatUnread + ' new since you last looked' : 'Say hello and share news') : 'Join this village to read its chat', badge: mine ? chatUnread : 0 }
      case 'campfires': {
        if (!mine) return { sub: life ? FIRE_WORDS[life.fire_level] || 'Join this village to sit at its Campfires' : 'Join this village to sit at its Campfires' }
        const f = rooms.filter((r) => r.kind === 'campfire'), inF = f.filter((r) => r.i_am_in).length
        const asks = f.reduce((n, r) => n + (r.asks_waiting || 0), 0)
        return { sub: f.length ? f.length + ' here' + (inF ? ', you are in ' + inF : '') + (asks ? ', ' + asks + ' asking to join' : '') : 'Start the first one', badge: asks }
      }
      case 'sidechats': {
        if (!mine) return { sub: 'Join this village first' }
        const s = rooms.filter((r) => r.kind === 'sidechat').length
        return { sub: s ? 'You are in ' + s : (keepers && keepers.i_am_keeper ? 'Start one for a few neighbors' : 'Small chats a keeper starts') }
      }
      case 'skillshare': return { sub: 'Help nearby: requests and offers' }
      case 'neighbors': return { sub: village && village.member_count ? village.member_count + ' neighbors live here' : 'A few neighbors so far' }
      case 'cottage': return { sub: 'Private chats with people you chose' }
      case 'me': return { sub: 'Your profile, vouches, and settings' }
      case 'messages': return { sub: unreadCount ? unreadCount + ' unread' : 'Requests and private messages', badge: unreadCount }
      case 'orgs': { const n = orgs.filter((o) => o.kind !== 'group').length; return { sub: n ? n + ' working here' : 'None working here yet' } }
      case 'groups': { const n = orgs.filter((o) => o.kind === 'group').length; return { sub: n ? n + ' emergency response group' + (n === 1 ? '' : 's') : 'Start a crew for when disaster hits' } }
      default: return { sub: '' }
    }
  }

  function tap(spot) {
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBump(spot.k); setTimeout(() => setBump(null), 450)
    }
    if (spot.soon) { openSheet({ k: spot.k }); return }
    switch (spot.k) {
      case 'chat':
        if (mine && board) navigate('/campfire?board=' + board.id)
        else if (!mine) navigate('/find-village?join=' + id)
        else openSheet({ k: 'chat' })
        return
      case 'charter': navigate('/village/' + id + '/charter'); return
      case 'skillshare': navigate('/skillshare'); return
      case 'cottage': navigate('/messages'); return
      case 'messages': navigate('/messages'); return
      case 'me': navigate('/me'); return
      default: openSheet({ k: spot.k })
    }
  }

  function sheetBody(k) {
    const spot = VILLAGE_SPOTS.find((s) => s.k === k)
    const title = <h2 id="vs-sheet-title"><span aria-hidden="true" className="vs-sheet-ic"><SpotIcon spot={spot} size={36} /></span> {spot.label}</h2>
    if (spot.soon) {
      return <>{title}<p>This part of the village is coming soon.</p></>
    }
    switch (k) {
      case 'sisters':
        return <>{title}
          {sisters.length === 0 && <p>This village has no sister villages yet. The keeper can ask another village from the Village Network map.</p>}
          {sisters.map((sid) => (
            <div key={sid} className="vs-sister">
              <button type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/village/' + sid) }}>
                <span aria-hidden="true"><Icon name="houses" /></span> {nameOf(sid)}<small>Sister village</small>
              </button>
              <SisterCampfireButton campfire={sisterFires.find((c) => c.village_a === sid || c.village_b === sid)} />
            </div>
          ))}
          <p className="vs-note">Members of a sister village can join this one as a guest.</p>
        </>
      case 'campfires':
      case 'sidechats':
        return <>{title}<VillageRooms villageId={id} kind={k === 'sidechats' ? 'sidechat' : 'campfire'} isMember={mine} isKeeper={!!(keepers && keepers.i_am_keeper)} onChanged={loadRooms} /></>
      case 'keeper':
        return <>{title}
          {!mine && <p>Join this village to see who looks after it.</p>}
          {mine && keeperNames.length === 0 && (life && !life.has_keeper
            ? <p>This village has no Keeper right now. If you would like to look after it, tell a Hope Ambassador or a VWB admin. They can ask you to be Keeper.</p>
            : <p>Loading the keeper...</p>)}
          {mine && keeperNames.map((n) => <div key={n} className="vs-item"><b>{n}</b><small>Keeper</small></div>)}
          {mine && keepers && keepers.i_am_keeper && <>
            <p className="vs-note">You are a keeper here. You post announcements in the village chat and can hand the role to another member.</p>
            <button type="button" className="btn btn-primary btn-full" onClick={() => { setSheet(null); navigate('/village/' + id + '/keeper') }}><Icon name="toolbox" /> Open keeper tools</button>
          </>}
        </>
      case 'chat':
        return <>{title}<p>We couldn't find this village's chat. Try again in a moment.</p></>
      case 'neighbors':
        return <>{title}
          <p>{info('neighbors').sub}.</p>
          {mine && board
            ? <><p className="vs-note">See who is here, vouch, or send a message request from the People button in the village chat.</p>
                <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/campfire?board=' + board.id)}>Open the village chat</button></>
            : <p className="vs-note">Join this village to see who lives here.</p>}
        </>
      case 'orgs':
        return <>{title}
          {orgs.filter((o) => o.kind !== 'group').length === 0 && <p>No organizations work in this village yet.</p>}
          {orgs.filter((o) => o.kind !== 'group').map((o) => (
            <button key={o.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/orgs/' + o.id) }}>
              <span aria-hidden="true"><Icon name="people" /></span> {o.name}<small>Organization</small>
            </button>
          ))}
        </>
      case 'groups': {
        const groups = orgs.filter((o) => o.kind === 'group')
        return <>{title}
          <p>Groups are crews that show up when disaster hits here: flooding, storms, mold, fires. They plan together ahead of time.</p>
          {groups.length === 0 && <p className="vs-note">No groups cover this village yet.</p>}
          {groups.map((o) => (
            <button key={o.id} type="button" className="vs-row" onClick={() => { setSheet(null); navigate('/orgs/' + o.id) }}>
              <span aria-hidden="true"><Icon name="tent" /></span> {o.name}<small>Emergency response group</small>
            </button>
          ))}
          <Link className="btn btn-outline btn-full" to={'/start-group?village=' + id}>Start a group for {village ? village.name : 'this village'}</Link>
        </>
      }
      default: return title
    }
  }

  if (loadError) {
    return <div className="vs-page"><div className="vs-top"><Link className="vs-crumb" to="/villages">Village Network</Link></div><p className="vs-error" role="alert">{loadError}</p></div>
  }
  if (!village) {
    return <div className="vs-page"><p className="vs-loading" role="status">Loading the village...</p></div>
  }


  return (
    <div className="vs-page">
      <nav className="vs-top" aria-label="Where you are">
        <Link className="vs-crumb" to="/villages">Village Network</Link>
        <span className="vs-sep" aria-hidden="true">&#8250;</span>
        <span className="vs-here" aria-current="page">{village.name}</span>
      </nav>

      <div className="vs-title">
        <h1>{village.name}</h1>
        <div className="vs-chips">
          {mine && !isGuest && <span className="vs-chip vs-chip-in">You are in</span>}
          {mine && isGuest && <span className="vs-chip vs-chip-guest">Guest</span>}
          {mine && keepers && keepers.i_am_keeper && <span className="vs-chip vs-chip-in">Keeper</span>}
          {!mine && <span className="vs-chip">Not joined yet</span>}
          <span className="vs-chip">{village.member_count ? village.member_count + ' neighbors' : 'Just starting'}</span>
          {village.towns && <span className="vs-chip">{village.towns}</span>}
        </div>
      </div>

      {keeperAsk && (
        <Link className="vs-ask" to={'/keeper-offer/' + keeperAsk.offer_id}>
          <b>{keeperAsk.asked_by_name} asked you to be Keeper of {village.name}</b>
          <small>Tap to say yes or no. Nothing changes until you answer.</small>
        </Link>
      )}

      <div className="vs-scene">
        <img className="vs-ground" src="/art/village-roads.webp" alt="" width="547" height="868" fetchpriority="high" />
        {VILLAGE_SPOTS.map((s) => {
          const i = info(s.k)
          return (
            <button key={s.k} type="button" data-spot={s.k}
              className={'vs-el' + (s.soon ? ' vs-soon' : '') + (s.k === 'campfires' ? ' vs-flame' + (life ? ' vs-fire-' + life.fire_level : '') : '') + (bump === s.k ? ' vs-bump' : '')}
              style={{ left: s.x + '%', top: s.y + '%', '--s': (s.s || 1) * (s.k === 'campfires' && life ? FIRE_SIZE[life.fire_level] || 1 : 1) }}
              aria-label={s.label + '. ' + i.sub}
              onClick={() => tap(s)}>
              <span className="vs-em" aria-hidden="true">
                {s.k === 'campfires' && life
                  ? <img className="vs-icon vs-life-fire" src={LIFE_ART.fire[life.fire_level] || LIFE_ART.fire[1]} alt="" width="96" height="96" draggable="false" />
                  : s.k === 'neighbors' && life
                    // Lit cottages fill the front row first.
                    ? <span className="vs-hamlet">
                        {[0, 1, 2, 3, 4, 5].map((n) => (
                          <img key={n} className={'vs-cot' + (5 - n < life.lit_cottages ? ' vs-cot-lit' : '')} src={5 - n < life.lit_cottages ? LIFE_ART.cottageLit : LIFE_ART.cottageDark} alt="" width="48" height="48" draggable="false" />
                        ))}
                      </span>
                    : <SpotIcon spot={s} />}
                {s.k === 'keeper' && life && life.has_keeper && <img className="vs-lantern" src={LIFE_ART.lantern} alt="" width="48" height="48" draggable="false" />}
                {s.k === 'keeper' && life && !life.has_keeper && <img className="vs-wanted" src={LIFE_ART.sign} alt="" width="48" height="48" draggable="false" />}
              </span>
              <span className="vs-lab">{s.k === 'keeper' && life && !life.has_keeper ? 'Keeper wanted' : s.short}</span>
              {i.badge > 0 && <span className="vs-badge" aria-hidden="true">{i.badge > 9 ? '9+' : i.badge}</span>}
            </button>
          )
        })}
        <div className="vs-fade" />
      </div>

      <p className="vs-hint">Tap anything in the village to go there.</p>

      <div className="vs-body">
        {!mine && <button type="button" className="btn btn-primary btn-full vs-big" onClick={() => navigate('/find-village?join=' + id)}>Join {village.name}</button>}
        {mine && keepers && keepers.i_am_keeper && <button type="button" data-tour="keeper-tools" className="btn btn-outline btn-full vs-big" onClick={() => navigate('/village/' + id + '/keeper')}><span aria-hidden="true"><Icon name="toolbox" /></span> Keeper tools</button>}
        <div className="vs-help">
          <button type="button" className="vs-big vs-ask" onClick={() => navigate('/ask')}>Ask for help</button>
          <button type="button" className="vs-big vs-offer" onClick={() => navigate('/post-offer')}>I can help</button>
        </div>
        <h2>Or pick from the list</h2>
        <div className="vs-list">
          {VILLAGE_SPOTS.map((s) => {
            const i = info(s.k)
            return (
              <button key={s.k} type="button" className={'vs-room' + (s.soon ? ' vs-soon' : '')} onClick={() => tap(s)}>
                <span className="vs-room-ic" aria-hidden="true"><SpotIcon spot={s} size={40} /></span>
                <span className="vs-room-text"><b>{s.label}{i.badge > 0 && <span className="vs-dot" aria-label="New" />}</b><small>{i.sub}</small></span>
                <span className="vs-go" aria-hidden="true">&#8250;</span>
              </button>
            )
          })}
        </div>
        <Link className="btn btn-outline btn-full vs-big" to="/community">Local help, events, and calendar</Link>
      </div>

      {sheet && (
        <div className="vs-shade" onClick={(e) => { if (e.target === e.currentTarget) closeSheet() }}>
          <div className="vs-sheet" role="dialog" aria-modal="true" aria-labelledby="vs-sheet-title" ref={sheetRef}>
            {sheetBody(sheet.k)}
            <button type="button" className="btn btn-outline btn-full" onClick={closeSheet}>Back to the village</button>
          </div>
        </div>
      )}
    </div>
  )
}
