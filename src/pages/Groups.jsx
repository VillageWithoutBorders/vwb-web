import '../desktop-groups.css'
import { useEffect, useState } from 'react'
import { NEW_ACCOUNT_NOTE } from '../utils/newAccount'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { useCampfireIds } from '../hooks/useCampfireIds'
import { useSidechatParents } from '../hooks/useSidechatParents'
import Icon from '../components/Icon'
import { tell } from '../components/AdminDialog'
import { isSimpleView } from '../utils/simpleView'
import { useT } from '../utils/lang'
import { useUnreadCount } from '../context/UnreadCountContext'

// Groups: private circles anyone can start. No roles, no one in charge.
// Every group has its own board (its own Campfire), end-to-end encrypted.
// See vwb-groups.sql for the rules the database enforces.
// show: 'all' (the /groups page), 'cottage' or 'campfires' (the Messages tabs, Oct 22).
// Nov 7 (Jade): onOpen (computers, inside Messages) opens a chat beside the list
// instead of on its own page; selectedId marks the open one.
export default function Groups({ embedded = false, show: showProp = 'all', onOpen, selectedId }) {
  // On its own page, /groups?show=cottage or ?show=campfires picks the list (the cottage map uses these).
  const [params] = useSearchParams()
  const asked = params.get('show')
  const show = embedded ? showProp : asked === 'cottage' || asked === 'campfires' ? asked : 'all'
  const t = useT()
  // Nov 10 (Jade): boards with a post you have not read yet (it used to be an alert).
  const { newBoards } = useUnreadCount()
  const { user, organizations, established } = useAuth()
  // Organizations this person heads or is an organizer (trusted liaison)
  // for. They can start a group for one of them and be its steward.
  const orgsIHead = (organizations || []).filter(o => o.role === 'admin' || o.role === 'organizer')
  const navigate = useNavigate()
  const openGroup = (gid, state) => (onOpen ? onOpen(gid) : navigate('/groups/' + gid, state ? { state } : undefined))
  const campfires = useCampfireIds()
  const sidechatParents = useSidechatParents()
  const [groups, setGroups] = useState([])
  const [waitingGroups, setWaitingGroups] = useState([])
  const [forOrg, setForOrg] = useState('')
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showStart, setShowStart] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startError, setStartError] = useState('')
  const [busy, setBusy] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoadError('')
    const [{ data: mine, error: mineErr }, { data: inv, error: invErr }] = await Promise.all([
      supabase.from('community_group_members').select('group_id, status, community_groups (id, name, description, steward_id, village_kind)').eq('user_id', user.id),
      supabase.from('community_group_invites').select('group_id, invited_by, created_at, community_groups (id, name, description)').eq('invitee_id', user.id),
    ])
    if (mineErr) console.error('Failed to load your groups:', mineErr)
    if (invErr) console.error('Failed to load your group invites:', invErr)
    if (mineErr || invErr) setLoadError(t("We couldn't load your groups. Check your connection and try again."))

    const myGroups = (mine || []).filter(m => m.status !== 'waiting').map(m => m.community_groups).filter(Boolean)
    setWaitingGroups((mine || []).filter(m => m.status === 'waiting').map(m => m.community_groups).filter(Boolean))
    // Member counts, in one query for all groups.
    if (myGroups.length > 0) {
      const { data: counts, error: countErr } = await supabase
        .from('community_group_members').select('group_id').eq('status', 'active').in('group_id', myGroups.map(g => g.id))
      if (countErr) console.error('Failed to count group members:', countErr)
      const tally = {}
      for (const c of counts || []) tally[c.group_id] = (tally[c.group_id] || 0) + 1
      myGroups.forEach(g => { g.memberCount = tally[g.id] || 1 })
    }
    // My own settings for each group: pinned first, archived tucked away, muted marked.
    if (myGroups.length > 0) {
      const { data: setRows, error: setErr } = await supabase
        .from('community_group_user_settings').select('group_id, pinned, archived, muted_until, alerts')
        .eq('user_id', user.id).in('group_id', myGroups.map(g => g.id))
      if (setErr) console.error('Failed to load your group settings:', setErr)
      const bySetting = Object.fromEntries((setRows || []).map(r => [r.group_id, r]))
      myGroups.forEach(g => {
        const r = bySetting[g.id]
        g.pinned = !!r?.pinned
        g.archived = !!r?.archived
        g.quiet = !!r && (r.alerts === 'off' || (!!r.muted_until && new Date(r.muted_until) > new Date()))
      })
    }
    myGroups.sort((a, b) => (b.pinned - a.pinned) || a.name.localeCompare(b.name))
    setGroups(myGroups)

    const inviteRows = (inv || []).filter(i => i.community_groups)
    const inviterIds = Array.from(new Set(inviteRows.map(i => i.invited_by).filter(Boolean)))
    let names = {}
    if (inviterIds.length > 0) {
      const { data: people, error: peopleErr } = await supabase
        .from('helper_profiles_public').select('user_id, display_name').in('user_id', inviterIds)
      if (peopleErr) console.error('Failed to load who invited you:', peopleErr)
      names = Object.fromEntries((people || []).map(p => [p.user_id, p.display_name || t('A neighbor')]))
    }
    setInvites(inviteRows.map(i => ({ ...i.community_groups, invitedBy: names[i.invited_by] || t('A neighbor') })))
    setLoading(false)
  }

  async function startGroup(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setStartError(t('Give your chat a name.')); return }
    setBusy('start')
    setStartError('')
    const { data: newId, error } = await supabase.rpc('create_community_group', { p_name: trimmed, p_description: description.trim() || null, p_organization: forOrg || null })
    setBusy(null)
    if (error || !newId) {
      console.error('Failed to start group:', error)
      setStartError(/New accounts can/i.test(error?.message || '') ? t(NEW_ACCOUNT_NOTE) : t('Could not start your chat. Try again.'))
      return
    }
    openGroup(newId, { justStarted: true })
  }

  async function accept(groupId) {
    setBusy(groupId)
    const { error } = await supabase.rpc('accept_community_group_invite', { p_group: groupId })
    setBusy(null)
    if (error) { console.error('Failed to accept invite:', error); tell(t('Could not join this group. Try again.'), { tone: 'error' }); return }
    openGroup(groupId)
  }

  async function decline(groupId) {
    setBusy(groupId)
    const { error } = await supabase.from('community_group_invites').delete().eq('group_id', groupId).eq('invitee_id', user.id)
    setBusy(null)
    if (error) { console.error('Failed to decline invite:', error); tell(t('Could not decline. Try again.'), { tone: 'error' }); return }
    setInvites(list => list.filter(i => i.id !== groupId))
  }

  // Is this chat a Campfire (organization, village, or picked by a keeper)? Else a Cottage Chat.
  const isFire = (g) => campfires.has(g.id) || g.village_kind === 'sidechat'
  const fits = (g) => show === 'all' || (show === 'campfires') === isFire(g)
  // Smaller Campfires sit directly under the chat they belong to.
  const activeGroups = groups.filter(g => !g.archived)
  const activeIds = new Set(activeGroups.map(g => g.id))
  const kidsOf = {}
  const rootGroups = []
  for (const g of activeGroups) {
    const parent = sidechatParents.get(g.id)
    if (parent && activeIds.has(parent)) (kidsOf[parent] = kidsOf[parent] || []).push(g)
    else rootGroups.push(g)
  }
  const orderedGroups = rootGroups.flatMap(g => [{ g, nested: false }, ...(kidsOf[g.id] || []).map(k => ({ g: k, nested: true }))]).filter(({ g }) => fits(g))
  const archivedGroups = groups.filter(g => g.archived && fits(g))

  return (
    // Nov 7 (Jade): as its own page on a computer, starting and invites on the left, your chats on the right.
    <div className={'groups-page' + (embedded ? '' : ' groups-full')}>
      <div className="groups-head">
        <div>
          {!embedded && <h1>{show === 'campfires' ? t('Your Campfires') : show === 'cottage' ? t('Your Cottage Chats') : t('Your group chats')}</h1>}
          {isSimpleView()
            ? <p className="groups-sub">{t('Chats with a few people you chose. Only the people in a chat can read it.')}</p>
            : <p className="groups-sub"><Icon name="cottage" /> {t("Cottage Chat: take a seat, let it out. You're safe here.")} <Icon name="campfire" /> {t('Campfire: gather round and let your voices be heard.')}</p>}
        </div>
      </div>

      {show === 'campfires' ? (
        <p className="groups-sub">{t('Campfires start in a village or a group. Open your village map and tap Campfires.')}</p>
      ) : !showStart ? (
        established === false ? (
          <p className="new-account-note" role="status">{t(NEW_ACCOUNT_NOTE)} {t('A member can still invite you to their Cottage Chat.')}</p>
        ) : <button type="button" className="btn btn-primary btn-full groups-start-btn" onClick={() => setShowStart(true)}>
          + {t('Start a Cottage Chat')}
        </button>
      ) : (
        <form className="groups-card" onSubmit={startGroup} noValidate>
          <h2 className="groups-card-title">{forOrg ? t('Start a Campfire') : t('Start a Cottage Chat')}</h2>
          <div className="form-field">
            <label htmlFor="group-name">{t('Chat name')}</label>
            <input id="group-name" type="text" value={name} onChange={e => { setName(e.target.value); setStartError('') }} maxLength={80} autoComplete="off" required aria-invalid={!!startError} aria-describedby={startError ? 'group-start-error' : undefined} />
          </div>
          <div className="form-field">
            <label htmlFor="group-desc">{t("What's it for? (optional)")}</label>
            <textarea id="group-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={500} />
          </div>
          {orgsIHead.length > 0 && (
            <div className="form-field">
              <label htmlFor="group-org">{t('Is this a Campfire for a group you lead or organize for?')}</label>
              <select id="group-org" value={forOrg} onChange={e => setForOrg(e.target.value)}>
                <option value="">{t("No, it's a Cottage Chat with people I choose")}</option>
                {orgsIHead.map(o => <option key={o.id} value={o.id}>{t('Yes, a Campfire for {name}', { name: o.name })}</option>)}
              </select>
              {forOrg && <p className="groups-note">{t("You'll be the group's steward. You can remove someone on your own for safety, you control the join link, and members can't remove you. New people wait until a member other than the one who invited them lets them in.")}</p>}
            </div>
          )}
          <p className="groups-note">{t("Only people you invite can see this chat or its board. You can invite people once it's started.")}</p>
          {startError && <p id="group-start-error" className="groups-error" role="alert">{startError}</p>}
          <div className="groups-actions">
            <button type="button" className="btn btn-outline" onClick={() => { setShowStart(false); setStartError('') }}>{t('Cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={busy === 'start'}>{busy === 'start' ? t('Starting...') : (forOrg ? t('Start Campfire') : t('Start Cottage Chat'))}</button>
          </div>
        </form>
      )}

      {loading && <p className="groups-empty">{t('Loading...')}</p>}
      {!loading && loadError && <p className="groups-error" role="alert">{loadError}</p>}

      {!loading && invites.length > 0 && (
        <section aria-labelledby="invites-heading">
          <h2 id="invites-heading" className="groups-section">{t('Invites')}</h2>
          {invites.map(inv => (
            <div key={inv.id} className="groups-card">
              <p className="groups-card-title">{inv.name}</p>
              {inv.description && <p className="groups-card-desc">{inv.description}</p>}
              <p className="groups-note">{t('{name} invited you.', { name: inv.invitedBy })}</p>
              <div className="groups-actions">
                <button type="button" className="btn btn-outline" disabled={busy === inv.id} onClick={() => decline(inv.id)}>{t('No thanks')}</button>
                <button type="button" className="btn btn-primary" disabled={busy === inv.id} onClick={() => accept(inv.id)}>{t('Join')}</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!loading && waitingGroups.length > 0 && (
        <section aria-labelledby="waiting-heading">
          <h2 id="waiting-heading" className="groups-section">{t('Waiting to be let in')}</h2>
          {waitingGroups.map(g => (
            <div key={g.id} className="groups-card">
              <p className="groups-card-title">{g.name}</p>
              <p className="groups-note">{t("A member will let you in soon. You'll see the board once they do.")}</p>
            </div>
          ))}
        </section>
      )}

      {!loading && (
        <section className="groups-mine" aria-labelledby="mygroups-heading">
          <h2 id="mygroups-heading" className="groups-section">{!embedded ? t('Your chats') : show === 'campfires' ? t('Your Campfires') : show === 'cottage' ? t('Your Cottage Chats') : t('Your chats')}</h2>
          {orderedGroups.length === 0 && <p className="groups-empty">{show === 'campfires' ? t("You're not at any Campfires yet.") : t("You're not in any chats yet. Start a Cottage Chat, or ask a friend to invite you.")}</p>}
          {orderedGroups.map(({ g, nested }) => (
            <button key={g.id} type="button" className={'groups-row' + (selectedId === g.id ? ' hub-row-on' : '')} aria-current={selectedId === g.id ? 'true' : undefined} style={nested ? { marginLeft: '1.25rem', width: 'calc(100% - 1.25rem)' } : undefined} onClick={() => openGroup(g.id)}>
              <span className="groups-row-name">{nested ? '\u21B3 ' : ''}{g.pinned ? <><Icon name="pushpin" />{' '}</> : ''}{campfires.has(g.id) ? <><Icon name="campfire" />{' '}</> : g.village_kind === 'sidechat' ? <><Icon name="campfire" />{' '}</> : ''}{g.name}{g.steward_id === user.id ? <span className="group-steward-badge">{t('Steward')}</span> : null}</span>
              <span className="groups-row-meta">{newBoards.has(String(g.id)) && <><b className="groups-new">{t('New posts')}</b>{' \u00b7 '}</>}{g.village_kind === 'sidechat' ? t('Picked by the keeper') + ' \u00b7 ' : ''}{g.quiet ? t('Quiet') + ' \u00b7 ' : ''}{g.memberCount === 1 ? t('1 member') : t('{n} members', { n: g.memberCount })}</span>
            </button>
          ))}
          {archivedGroups.length > 0 && (
            <>
              <button type="button" className="btn btn-outline" aria-expanded={showArchived} onClick={() => setShowArchived(v => !v)}>
                {showArchived ? t('Hide archived chats') : t('Archived chats ({n})', { n: archivedGroups.length })}
              </button>
              {showArchived && archivedGroups.map(g => (
                <button key={g.id} type="button" className={'groups-row' + (selectedId === g.id ? ' hub-row-on' : '')} onClick={() => openGroup(g.id)}>
                  <span className="groups-row-name">{campfires.has(g.id) ? <><Icon name="campfire" />{' '}</> : g.village_kind === 'sidechat' ? <><Icon name="campfire" />{' '}</> : ''}{g.name}</span>
                  <span className="groups-row-meta">{t('Archived')}</span>
                </button>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  )
}
