import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'
import VillagePeople from '../components/VillagePeople'
import VillageRooms from '../components/VillageRooms'
import SisterVillages from '../components/SisterVillages'
import { UserName } from '../components/AvatarDisplay'
import { useDashTab, NeedsYou, DashTabs, DashPanel } from '../components/DashShell'
import Icon from '../components/Icon'
import RoleLog from '../components/RoleLog'
import PlaceReports, { usePlaceReportCount } from '../components/PlaceReports'
import { useT, t as tr, getLang } from '../utils/lang'

// Keeper tools for one neighborhood village. Same layout as Organizer tools:
// Needs-you card on top, then four tabs: People, Chats, Sisters, Keeper role.
// Keepers (the starter and up to 2 helpers) see this. The database checks
// every action too, so a hidden button is never the only protection.
// Route: /village/:id/keeper

const TABS = [
  { k: 'people', em: '\u{1F44B}', label: 'People' },
  { k: 'chats', em: '\u{1F525}', label: 'Chats' },
  { k: 'sisters', em: '\u{1F309}', label: 'Sisters' },
  { k: 'role', em: '\u{1F5DD}️', label: 'Keeper role' },
]

export default function KeeperDashboard() {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useDashTab(TABS)
  const reportCount = usePlaceReportCount('village', id)

  const [village, setVillage] = useState(null)
  const [villages, setVillages] = useState([])
  const [loadError, setLoadError] = useState('')
  const [keepers, setKeepers] = useState(null)
  const [keeperNames, setKeeperNames] = useState({})
  const [board, setBoard] = useState(null)
  const [newMembers, setNewMembers] = useState([])
  const [removals, setRemovals] = useState([])
  const [rooms, setRooms] = useState([])
  const [sisterState, setSisterState] = useState([])
  const [sisters, setSisters] = useState([])
  const [orgs, setOrgs] = useState([])
  const [removing, setRemoving] = useState(null)
  const [orgNote, setOrgNote] = useState('')
  const [showPeople, setShowPeople] = useState(false)
  const [ready, setReady] = useState(false)

  const loadKeepers = useCallback(async () => {
    const { data, error } = await supabase.rpc('village_keepers_info', { p_village: id })
    if (error) { console.error('Failed to load keepers:', error); setKeepers({}); return }
    const row = (Array.isArray(data) ? data[0] : data) || {}
    setKeepers(row)
    const ids = [row.starter_id, ...(row.helper_ids || [])].filter(Boolean)
    if (!ids.length) return
    const { data: p, error: pErr } = await supabase.from('helper_profiles_public').select('user_id, display_name').in('user_id', ids)
    if (pErr) { console.error('Failed to load keeper names:', pErr); return }
    setKeeperNames(Object.fromEntries((p || []).map((r) => [r.user_id, r.display_name])))
  }, [id])

  const loadRemovals = useCallback(async () => {
    const { data, error } = await supabase.rpc('village_removal_requests', { p_village: id })
    if (error) { console.error('Failed to load removal requests:', error); return }
    setRemovals(data || [])
  }, [id])

  const loadRooms = useCallback(async () => {
    const { data, error } = await supabase.rpc('village_rooms', { p_village: id })
    if (error) { console.error('Failed to load Campfires:', error); return }
    setRooms(data || [])
  }, [id])

  const loadSisters = useCallback(async () => {
    const [st, list] = await Promise.all([
      supabase.rpc('village_sister_state', { p_village: id }),
      supabase.rpc('village_sister_list'),
    ])
    if (st.error) console.error('Failed to load sister asks:', st.error)
    if (list.error) console.error('Failed to load sister villages:', list.error)
    setSisterState(st.data || [])
    setSisters(list.data || [])
  }, [id])

  const loadOrgs = useCallback(async () => {
    const { data, error } = await supabase.rpc('org_village_links')
    if (error) { console.error('Failed to load organizations working here:', error); return }
    setOrgs((data || []).filter((r) => r.village_id === id).map((r) => ({ id: r.org_id, name: r.org_name })))
  }, [id])

  useEffect(() => {
    let alive = true
    setReady(false); setLoadError('')
    supabase.rpc('village_network').then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load villages:', error); setLoadError(tr("We couldn't load this village. Check your connection and try again.")); return }
      setVillages(data || [])
      const v = (data || []).find((r) => r.id === id)
      if (!v) { setLoadError(tr("We couldn't find this village. It may have closed.")); return }
      setVillage(v)
    })
    supabase.from('campfire_boards').select('id, name').eq('village_id', id).eq('archived', false).order('sort_order').limit(1).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load the village chat:', error); return }
      setBoard((data || [])[0] || null)
    })
    supabase.rpc('village_new_members', { p_village: id }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Failed to load new members:', error); return }
      setNewMembers(data || [])
    })
    Promise.all([loadKeepers(), loadRemovals(), loadRooms(), loadSisters(), loadOrgs()]).then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [id, loadKeepers, loadRemovals, loadRooms, loadSisters, loadOrgs])

  async function confirmRemoveOrg() {
    if (!removing) return
    const { error } = await supabase.rpc('remove_org_from_village', { p_org: removing.id, p_village: id })
    if (error) { console.error('Failed to remove organization from village:', error); setOrgNote(tr("We couldn't remove them. Try again.")); return }
    setOrgNote(tr('{name} was removed from this neighborhood.', { name: removing.name }))
    setRemoving(null)
    loadOrgs()
  }

  if (loadError) {
    return <div className="cal-page hub-page dash-page"><BackLink fallback="/world" fallbackLabel={t('World')} /><p className="cal-empty" role="alert">{loadError}</p></div>
  }
  if (!village || !keepers) {
    return <div className="cal-page hub-page dash-page"><p className="cal-empty" role="status">{t('Loading keeper tools...')}</p></div>
  }
  if (!keepers.i_am_keeper) {
    return (
      <div className="cal-page hub-page dash-page">
        <BackLink fallback={'/village/' + id} fallbackLabel={village.name} />
        <p className="cal-empty">{t('Keeper tools are only for the neighbors who look after {name}.', { name: village.name })}</p>
        <Link className="btn btn-outline btn-full" style={{ minHeight: 48 }} to={'/village/' + id}>{t('Back to {name}', { name: village.name })}</Link>
      </div>
    )
  }

  const isStarter = !!keepers.i_am_starter
  const helperIds = keepers.helper_ids || []
  const secondNeeded = removals.filter((r) => r.requested_by !== user.id)
  const fireAsks = rooms.filter((r) => r.i_started && r.asks_waiting > 0)
  const fireAskCount = fireAsks.reduce((n, r) => n + r.asks_waiting, 0)
  const checkIns = rooms.filter((r) => r.check_in_waiting)
  const sisterAsks = sisterState.filter((s) => s.status === 'asked' && !s.asked_by_us)
  const campfires = rooms
  const mySisterCount = sisters.filter((s) => s.village_a === id || s.village_b === id).length

  const needs = !ready ? null : [
    reportCount && { k: 'reports', tab: 'people', target: 'pr-sec', em: '\u{1F6A9}', text: reportCount === 1 ? t('Someone in your village was reported') : t('{n} reports in your village', { n: reportCount }) },
    secondNeeded.length && { k: 'remove', tab: 'people', target: 'kd-remove-sec', em: '⚠️', text: secondNeeded.length === 1 ? t('A removal request needs a second member') : t('{n} removal requests need a second member', { n: secondNeeded.length }) },
    fireAskCount && { k: 'fires', tab: 'chats', em: '\u{1F525}', text: fireAskCount === 1 ? t('Someone asked to join your Campfire') : t('{n} people asked to join your Campfires', { n: fireAskCount }) },
    checkIns.length && { k: 'checkin', tab: 'chats', em: '\u{1F44B}', text: t('A Campfire is asking if you are still taking part') },
    isStarter && sisterAsks.length && { k: 'sisters', tab: 'sisters', em: '\u{1F309}', text: sisterAsks.length === 1 ? t('{name} asked to be Sister Villages', { name: sisterAsks[0].other_name }) : t('{n} villages asked to be sisters', { n: sisterAsks.length }) },
    newMembers.length && { k: 'new', tab: 'people', target: 'kd-new-sec', to: board ? '/village-square?board=' + board.id : undefined, em: '\u{1F331}', text: newMembers.length === 1 ? t('{name} just joined. Say hello?', { name: newMembers[0].display_name || t('A neighbor') }) : t('{n} neighbors just joined. Say hello?', { n: newMembers.length }) },
  ].filter(Boolean)

  const go = (em, label, onClick) => (
    <button type="button" className="dash-shortcut" onClick={onClick}><span aria-hidden="true"><Icon name={em} /></span>{label}</button>
  )

  return (
    <div className="cal-page hub-page dash-page">
      <BackLink fallback={'/village/' + id} fallbackLabel={village.name} />
      <div className="dash-head">
        <span className="dash-head-icon" aria-hidden="true"><Icon name="toolbox" /></span>
        <h1>{village.name}</h1>
      </div>
      <p className="dash-sub">{t('Keeper tools')}{isStarter ? ' · ' + t('You keep this village') : ' · ' + t('You are a helper')}</p>

      <NeedsYou items={needs} onGo={setTab} calm={t('All is quiet in the village. Nothing is waiting on you.')} />

      <div className="dash-stats">
        <button type="button" className="dash-stat" onClick={() => setTab('people')}><b>{village.member_count || 0}</b><small>{t('Neighbors')}</small></button>
        <button type="button" className="dash-stat" onClick={() => setTab('chats')}><b>{campfires.length}</b><small>{t('Campfires')}</small></button>
        <button type="button" className="dash-stat" onClick={() => setTab('sisters')}><b>{mySisterCount}</b><small>{t('Sister villages')}</small></button>
      </div>

      <DashTabs tabs={TABS.map((x) => ({ ...x, label: t(x.label) }))} tab={tab} setTab={setTab}
        dots={{ people: secondNeeded.length > 0, chats: fireAskCount > 0 || checkIns.length > 0, sisters: isStarter && sisterAsks.length > 0 }} />

      {tab === 'people' && (
        <DashPanel k="people">
          <PlaceReports kind="village" placeId={id} />
          {secondNeeded.length > 0 && (
            <section className="hub-section" id="kd-remove-sec" aria-labelledby="kd-remove">
              <div className="hub-section-head"><h2 id="kd-remove">{t('Removal requests')}</h2></div>
              <p className="hub-org-desc">{t('A neighbor asked to remove someone. It takes two more members agreeing. Open the people list to agree or leave it.')}</p>
              {secondNeeded.map((r) => (
                <div key={r.target_id} className="dash-row">
                  <div className="dash-row-main"><strong>{r.target_name || t('A neighbor')}</strong><small>{t(r.reason)}</small></div>
                </div>
              ))}
            </section>
          )}

          <section className="hub-section" id="kd-new-sec" aria-labelledby="kd-new">
            <div className="hub-section-head"><h2 id="kd-new">{t('New neighbors')}</h2></div>
            {newMembers.length === 0 && <p className="hub-empty">{t('No one new lately.')}</p>}
            {newMembers.map((m) => (
              <div key={m.user_id} className="dash-row">
                <div className="dash-row-main"><strong><UserName userId={m.user_id} name={m.display_name} /></strong><small>{t('Joined {date}', { date: new Date(m.joined_at).toLocaleDateString(getLang() === 'es' ? 'es-US' : undefined) })}</small></div>
              </div>
            ))}
            {newMembers.length > 0 && board && (<>
              <p className="hub-org-desc">{t('A short hello in the village chat goes a long way.')}</p>
              <button type="button" className="btn btn-primary btn-full" style={{ minHeight: 48 }} onClick={() => navigate('/village-square?board=' + board.id)}>{t('Say hello in the village chat')}</button>
            </>)}
          </section>

          <section className="hub-section" aria-labelledby="kd-all">
            <div className="hub-section-head"><h2 id="kd-all">{t('Everyone ({n})', { n: village.member_count || 0 })}</h2></div>
            <p className="hub-org-desc">{t('See who is here, vouch, invite a guest, name helpers, or ask to remove someone.')}</p>
            <button type="button" className="btn btn-primary btn-full" style={{ minHeight: 48 }} onClick={() => setShowPeople(true)}>{t('Open the people list')}</button>
          </section>
        </DashPanel>
      )}

      {tab === 'chats' && (
        <DashPanel k="chats">
          <section className="hub-section" aria-labelledby="kd-chat">
            <div className="hub-section-head"><h2 id="kd-chat"><Icon name="chat-bubble" /> {t('Village chat')}</h2></div>
            <p className="hub-org-desc">{t('Everyone in the village. As a keeper you can pin announcements here.')}</p>
            <div className="dash-shortcuts">
              {go('\u{1F4E3}', t('Open the village chat'), () => navigate(board ? '/village-square?board=' + board.id : '/village/' + id))}
            </div>
          </section>
          <section className="hub-section" aria-labelledby="kd-fires">
            <div className="hub-section-head"><h2 id="kd-fires"><Icon name="campfire" /> {t('Campfires')}</h2></div>
            <VillageRooms villageId={id} isMember isKeeper onChanged={loadRooms} />
          </section>
        </DashPanel>
      )}

      {tab === 'sisters' && (
        <DashPanel k="sisters">
          <section className="hub-section">
            <SisterVillages village={village} villages={villages} sisters={sisters} isKeeper={isStarter}
              joinOptions={[]} onPick={(vid) => navigate('/village/' + vid)} onChanged={loadSisters} />
            {!isStarter && <p className="hub-org-desc">{t("Only the village's main keeper asks or answers Sister Villages.")}</p>}
          </section>

          <section className="hub-section" aria-labelledby="kd-orgs">
            <div className="hub-section-head"><h2 id="kd-orgs"><Icon name="people" /> {t('Groups working here')}</h2></div>
            <p className="hub-org-desc">{t("Groups pick the neighborhoods they work in. You can remove one that doesn't belong.")}</p>
            {orgs.length === 0 && <p className="hub-empty">{t('None yet.')}</p>}
            {orgs.map((o) => (
              <div key={o.id} className="dash-row">
                <div className="dash-row-main"><Link to={'/orgs/' + o.id}><strong>{o.name}</strong></Link></div>
                {removing?.id === o.id
                  ? <div className="dash-btns">
                      <button type="button" className="btn btn-primary" onClick={confirmRemoveOrg}>{t('Yes, remove')}</button>
                      <button type="button" className="btn btn-outline" onClick={() => setRemoving(null)}>{t('Keep')}</button>
                    </div>
                  : <button type="button" className="btn btn-outline group-small-btn" onClick={() => { setOrgNote(''); setRemoving(o) }}>{t('Remove')}</button>}
              </div>
            ))}
            {orgNote && <p className="dash-note" role="status">{orgNote}</p>}
          </section>
        </DashPanel>
      )}

      {tab === 'role' && (
        <DashPanel k="role">
          <section className="hub-section" aria-labelledby="kd-who">
            <div className="hub-section-head"><h2 id="kd-who">{t('Who looks after {name}', { name: village.name })}</h2></div>
            {keepers.starter_id && (
              <div className="dash-row"><div className="dash-row-main"><strong><UserName userId={keepers.starter_id} name={keeperNames[keepers.starter_id] || t('Keeper')} /></strong><small>{t('Keeper')}{keepers.starter_id === user.id ? ' ' + t('(you)') : ''}</small></div></div>
            )}
            {helperIds.map((h) => (
              <div key={h} className="dash-row"><div className="dash-row-main"><strong><UserName userId={h} name={keeperNames[h] || t('Helper')} /></strong><small>{t('Helper')}{h === user.id ? ' ' + t('(you)') : ''}</small></div></div>
            ))}
          </section>
          <section className="hub-section" aria-labelledby="kd-what">
            <div className="hub-section-head"><h2 id="kd-what">{t('What keepers do')}</h2></div>
            <ul className="hub-org-desc" style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
              <li>{t('Pin announcements in the village chat')}</li>
              <li>{t('Start Campfires and pick who is in')}</li>
              <li>{t('Answer Sister Village asks')}</li>
              <li>{t("Remove a group that doesn't belong")}</li>
            </ul>
            <p className="hub-org-desc">{t("If a Keeper or Helper doesn't open VWB for 60 days, VWB asks if they are still taking part. With no answer in 14 days, the role passes on, so the village is never left without someone.")}</p>
            {isStarter && <p className="hub-org-desc">{t('You can name up to 2 helpers or hand the village to another member. Open the people list and tap a name.')}</p>}
            <div className="dash-shortcuts">
              {isStarter && go('\u{1F5DD}️', t('Helpers and hand off'), () => setShowPeople(true))}
              {go('\u{1FAA7}', t('Community Guidelines'), () => navigate('/terms'))}
            </div>
          </section>
          <RoleLog kind="village" placeId={id} />
        </DashPanel>
      )}

      {showPeople && (
        <VillagePeople villageId={id} villageName={village.name} myId={user.id} isAdmin={isAdmin}
          requests={removals} onRequestsChange={loadRemovals}
          onKeeperChange={loadKeepers} onClose={() => setShowPeople(false)} onLeave={null} showRoleLog={false} />
      )}
    </div>
  )
}
