import { useEffect, useState } from 'react'
import { NEW_ACCOUNT_NOTE } from '../utils/newAccount'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// Groups: private circles anyone can start. No roles, no one in charge.
// Every group has its own board (its own Campfire), end-to-end encrypted.
// See vwb-groups.sql for the rules the database enforces.
export default function Groups() {
  const { user, organizations, established } = useAuth()
  // Organizations this person heads or is an organizer (trusted liaison)
  // for. They can start a group for one of them and be its steward.
  const orgsIHead = (organizations || []).filter(o => o.role === 'admin' || o.role === 'organizer')
  const navigate = useNavigate()
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
      supabase.from('community_group_members').select('group_id, status, community_groups (id, name, description, steward_id)').eq('user_id', user.id),
      supabase.from('community_group_invites').select('group_id, invited_by, created_at, community_groups (id, name, description)').eq('invitee_id', user.id),
    ])
    if (mineErr) console.error('Failed to load your groups:', mineErr)
    if (invErr) console.error('Failed to load your group invites:', invErr)
    if (mineErr || invErr) setLoadError("We couldn't load your groups. Check your connection and try again.")

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
      names = Object.fromEntries((people || []).map(p => [p.user_id, p.display_name || 'A neighbor']))
    }
    setInvites(inviteRows.map(i => ({ ...i.community_groups, invitedBy: names[i.invited_by] || 'A neighbor' })))
    setLoading(false)
  }

  async function startGroup(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setStartError('Give your group a name.'); return }
    setBusy('start')
    setStartError('')
    const { data: newId, error } = await supabase.rpc('create_community_group', { p_name: trimmed, p_description: description.trim() || null, p_organization: forOrg || null })
    setBusy(null)
    if (error || !newId) {
      console.error('Failed to start group:', error)
      setStartError(/New accounts can/i.test(error?.message || '') ? NEW_ACCOUNT_NOTE : 'Could not start your group. Try again.')
      return
    }
    navigate('/groups/' + newId, { state: { justStarted: true } })
  }

  async function accept(groupId) {
    setBusy(groupId)
    const { error } = await supabase.rpc('accept_community_group_invite', { p_group: groupId })
    setBusy(null)
    if (error) { console.error('Failed to accept invite:', error); alert('Could not join this group. Try again.'); return }
    navigate('/groups/' + groupId)
  }

  async function decline(groupId) {
    setBusy(groupId)
    const { error } = await supabase.from('community_group_invites').delete().eq('group_id', groupId).eq('invitee_id', user.id)
    setBusy(null)
    if (error) { console.error('Failed to decline invite:', error); alert('Could not decline. Try again.'); return }
    setInvites(list => list.filter(i => i.id !== groupId))
  }

  return (
    <div className="groups-page">
      <div className="groups-head">
        <div>
          <h1>Groups</h1>
          <p className="groups-sub">Private circles with their own board. Everyone in a group is equal.</p>
        </div>
      </div>

      {!showStart ? (
        established === false ? (
          <p className="new-account-note" role="status">{NEW_ACCOUNT_NOTE} A member can still invite you to their group.</p>
        ) : <button type="button" className="btn btn-primary btn-full groups-start-btn" onClick={() => setShowStart(true)}>
          + Start a group
        </button>
      ) : (
        <form className="groups-card" onSubmit={startGroup} noValidate>
          <h2 className="groups-card-title">Start a group</h2>
          <div className="form-field">
            <label htmlFor="group-name">Group name</label>
            <input id="group-name" type="text" value={name} onChange={e => { setName(e.target.value); setStartError('') }} maxLength={80} autoComplete="off" required aria-invalid={!!startError} aria-describedby={startError ? 'group-start-error' : undefined} />
          </div>
          <div className="form-field">
            <label htmlFor="group-desc">What's it for? (optional)</label>
            <textarea id="group-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={500} />
          </div>
          {orgsIHead.length > 0 && (
            <div className="form-field">
              <label htmlFor="group-org">Is this group for an organization you lead or organize for?</label>
              <select id="group-org" value={forOrg} onChange={e => setForOrg(e.target.value)}>
                <option value="">No, it's an everyday group</option>
                {orgsIHead.map(o => <option key={o.id} value={o.id}>Yes, for {o.name}</option>)}
              </select>
              {forOrg && <p className="groups-note">You'll be the group's steward. You can remove someone on your own for safety, you control the join link, and members can't remove you. New people wait until a member other than the one who invited them lets them in.</p>}
            </div>
          )}
          <p className="groups-note">Only people you invite can see the group or its board. You can invite people once it's started.</p>
          {startError && <p id="group-start-error" className="groups-error" role="alert">{startError}</p>}
          <div className="groups-actions">
            <button type="button" className="btn btn-outline" onClick={() => { setShowStart(false); setStartError('') }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy === 'start'}>{busy === 'start' ? 'Starting...' : 'Start group'}</button>
          </div>
        </form>
      )}

      {loading && <p className="groups-empty">Loading...</p>}
      {!loading && loadError && <p className="groups-error" role="alert">{loadError}</p>}

      {!loading && invites.length > 0 && (
        <section aria-labelledby="invites-heading">
          <h2 id="invites-heading" className="groups-section">Invites</h2>
          {invites.map(inv => (
            <div key={inv.id} className="groups-card">
              <p className="groups-card-title">{inv.name}</p>
              {inv.description && <p className="groups-card-desc">{inv.description}</p>}
              <p className="groups-note">{inv.invitedBy} invited you.</p>
              <div className="groups-actions">
                <button type="button" className="btn btn-outline" disabled={busy === inv.id} onClick={() => decline(inv.id)}>No thanks</button>
                <button type="button" className="btn btn-primary" disabled={busy === inv.id} onClick={() => accept(inv.id)}>Join</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!loading && waitingGroups.length > 0 && (
        <section aria-labelledby="waiting-heading">
          <h2 id="waiting-heading" className="groups-section">Waiting to be let in</h2>
          {waitingGroups.map(g => (
            <div key={g.id} className="groups-card">
              <p className="groups-card-title">{g.name}</p>
              <p className="groups-note">A member will let you in soon. You'll see the board once they do.</p>
            </div>
          ))}
        </section>
      )}

      {!loading && (
        <section aria-labelledby="mygroups-heading">
          <h2 id="mygroups-heading" className="groups-section">Your groups</h2>
          {groups.length === 0 && <p className="groups-empty">You're not in any groups yet. Start one, or ask a friend to invite you.</p>}
          {groups.filter(g => !g.archived).map(g => (
            <button key={g.id} type="button" className="groups-row" onClick={() => navigate('/groups/' + g.id)}>
              <span className="groups-row-name">{g.pinned ? '\u{1F4CC} ' : ''}{g.name}{g.steward_id === user.id ? <span className="group-steward-badge">Steward</span> : null}</span>
              <span className="groups-row-meta">{g.quiet ? 'Quiet \u00b7 ' : ''}{g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}</span>
            </button>
          ))}
          {groups.some(g => g.archived) && (
            <>
              <button type="button" className="btn btn-outline" aria-expanded={showArchived} onClick={() => setShowArchived(v => !v)}>
                {showArchived ? 'Hide archived groups' : 'Archived groups (' + groups.filter(g => g.archived).length + ')'}
              </button>
              {showArchived && groups.filter(g => g.archived).map(g => (
                <button key={g.id} type="button" className="groups-row" onClick={() => navigate('/groups/' + g.id)}>
                  <span className="groups-row-name">{g.name}</span>
                  <span className="groups-row-meta">Archived</span>
                </button>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  )
}
