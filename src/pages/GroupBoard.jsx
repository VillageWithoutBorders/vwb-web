import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import AvatarDisplay, { UserName } from '../components/AvatarDisplay'
import QrShare from '../components/QrShare'
import { useChatScroll } from '../hooks/useChatScroll'
import { sendGroupPost, decryptMany, getDeviceId, editGroupPost, fetchEditHistory } from '../lib/e2ee'
import { submitUserReport } from '../utils/submitUserReport'
import { useCampfireIds } from '../hooks/useCampfireIds'
import { useSidechatParents } from '../hooks/useSidechatParents'
import SidechatAdd from '../components/SidechatAdd'

// One group's board: its own private Campfire. Posts are end-to-end
// encrypted (see e2ee.js sendGroupPost), so only members can read them and
// VWB can't. No one is in charge: any member can invite, turn the join link
// on or off, and ask to remove someone, which takes a second member agreeing.
//
// A group started FOR an approved organization by its head has a steward.
// Everyone still posts, invites, and reads the same board. The steward also
// can't be removed by members, can remove someone alone, and is the only
// one who can change the join link. New people wait until a member other
// than the one who invited them lets them in (the steward's invites go
// straight in). All of this is enforced in the database (vwb-groups.sql).
const GROUP_WINDOW_MS = 5 * 60 * 1000
const POST_LIMIT = 300

const REMOVE_REASONS = [
  'Unsafe or threatening behavior',
  'Harassing or bullying members',
  'Scam, spam, or asking for money',
  'Fake or pretend account',
  'Not part of what this group is for',
  'Something else',
]

const REPORT_REASONS = [
  'Harassing me or making me feel unsafe',
  'Threatening or unsafe behavior',
  'Pretending to be someone else',
  'Asking for money or private information',
  'Something else',
]

export default function GroupBoard() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const campfires = useCampfireIds()
  const sidechatParents = useSidechatParents()
  const parentId = sidechatParents.get(id) || null
  const isSidechat = !!parentId
  const [parentName, setParentName] = useState('')
  const [sidechats, setSidechats] = useState([])
  useEffect(() => {
    if (!parentId) return
    let alive = true
    supabase.from('community_groups').select('name').eq('id', parentId).maybeSingle().then(({ data }) => { if (alive && data?.name) setParentName(data.name) })
    return () => { alive = false }
  }, [parentId])
  // Sidechats under this chat that you are in (empty if the database is not updated yet)
  useEffect(() => {
    let alive = true
    supabase.from('community_groups').select('id, name').eq('parent_group_id', id).order('name').then(({ data, error }) => {
      if (!alive || error) return
      setSidechats(data || [])
    })
    return () => { alive = false }
  }, [id])
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [waiting, setWaiting] = useState([])
  const [amWaiting, setAmWaiting] = useState(false)
  const [inviteUnlock, setInviteUnlock] = useState(null)
  const [editingPost, setEditingPost] = useState(null)
  const [postHistory, setPostHistory] = useState(null)
  const [orgName, setOrgName] = useState('')
  // Members who could take over as steward (the organization's head or
  // organizers). Only loaded for the steward.
  const [stewardCandidates, setStewardCandidates] = useState([])
  const [removals, setRemovals] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  // This person's own settings for this group. Only they can see or change them.
  const [mySettings, setMySettings] = useState({ alerts: 'all', muted_until: null, pinned: false, archived: false })
  const [settingsNote, setSettingsNote] = useState('')
  // Shared settings: requests waiting for a second member, and the change log.
  const [proposals, setProposals] = useState([])
  const [changes, setChanges] = useState([])
  const [nameDraft, setNameDraft] = useState(null)
  const [descDraft, setDescDraft] = useState(null)
  const [sharedNote, setSharedNote] = useState('')
  const [sharedBusy, setSharedBusy] = useState(false)
  const [posts, setPosts] = useState([])
  const [hiddenOlder, setHiddenOlder] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newPost, setNewPost] = useState('')
  const [sending, setSending] = useState(false)
  const [sendNote, setSendNote] = useState('')
  const focusFromLink = new URLSearchParams(location.search).get('focus')
  const [panelOpen, setPanelOpen] = useState(!!location.state?.justStarted || !!focusFromLink)
  // The decision an alert pointed at, e.g. 'proposal-disappear' or 'removal-<user id>'.
  const [focusKey, setFocusKey] = useState(focusFromLink || null)
  const [focusGone, setFocusGone] = useState(false)
  // The settings panel has two tabs: the group itself, and my own alerts.
  const [panelTab, setPanelTab] = useState('group')
  const [proposalsLoaded, setProposalsLoaded] = useState(false)
  const focusDone = useRef(false)
  const [focusReady, setFocusReady] = useState(true)
  const firstFocusRun = useRef(true)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [copied, setCopied] = useState(false)
  const [reportFor, setReportFor] = useState(null)
  const [removeFor, setRemoveFor] = useState(null)
  const [removeReason, setRemoveReason] = useState('')
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportState, setReportState] = useState('')
  const [includeEvidence, setIncludeEvidence] = useState(true)
  const pollRef = useRef(null)
  const membersRef = useRef([])
  const orgLoadedRef = useRef(false)

  const { containerRef, onScroll, showNew, jumpToNewest } = useChatScroll(posts, user?.id, !loading)

  useEffect(() => {
    loadAll()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  async function loadAll() {
    setLoading(true)
    if (pollRef.current) clearInterval(pollRef.current)
    const ok = await loadGroup()
    if (ok === true) {
      await loadPosts()
      pollRef.current = setInterval(() => { loadPosts(); loadGroup() }, 5000)
    } else if (ok === 'waiting') {
      // Check now and then whether a member has let them in.
      pollRef.current = setInterval(async () => { if ((await loadGroup()) === true) loadAll() }, 15000)
    }
    setLoading(false)
  }

  // Group details, members (with names), open removal requests, invites.
  async function loadGroup() {
    const { data: g, error: gErr } = await supabase
      .from('community_groups').select('id, name, description, join_token, steward_id, steward_offer_to, organization_id, announcement_only, disappear_after_mins').eq('id', id).maybeSingle()
    if (gErr) console.error('Failed to load group:', gErr)
    const { data: m, error: mErr } = await supabase
      .from('community_group_members').select('user_id, joined_at, status, added_by').eq('group_id', id)
    if (mErr) console.error('Failed to load group members:', mErr)
    const myRow = (m || []).find(x => x.user_id === user.id)
    if (g && myRow && myRow.status === 'waiting') { setGroup(g); setAmWaiting(true); return 'waiting' }
    setAmWaiting(false)
    if (!g || !myRow) { setGroup(null); return false }
    if (g.organization_id && !orgLoadedRef.current) {
      orgLoadedRef.current = true
      const { data: org, error: orgErr } = await supabase.from('organizations').select('name').eq('id', g.organization_id).maybeSingle()
      if (orgErr) console.error('Failed to load organization name:', orgErr)
      if (org?.name) setOrgName(org.name)
    }

    const ids = (m || []).map(x => x.user_id)
    const [{ data: people, error: pErr }, { data: r, error: rErr }, { data: inv, error: iErr }] = await Promise.all([
      supabase.from('helper_profiles_public').select('user_id, display_name, avatar_url').in('user_id', ids),
      supabase.rpc('community_group_removal_requests', { p_group: id }),
      supabase.from('community_group_invites').select('invitee_id').eq('group_id', id),
    ])
    if (pErr) console.error('Failed to load member names:', pErr)
    if (rErr) console.error('Failed to load removal requests:', rErr)
    if (iErr) console.error('Failed to load pending invites:', iErr)
    const byId = Object.fromEntries((people || []).map(p => [p.user_id, p]))
    const everyone = (m || []).map(x => ({
      userId: x.user_id,
      joinedAt: x.joined_at,
      status: x.status,
      addedBy: x.added_by,
      name: byId[x.user_id]?.display_name || 'Neighbor',
      avatar: byId[x.user_id]?.avatar_url || null,
    }))
    const list = everyone.filter(x => x.status === 'active')
      .sort((a, b) => (a.userId === user.id ? -1 : b.userId === user.id ? 1 : a.name.localeCompare(b.name)))
    const waitingList = everyone.filter(x => x.status === 'waiting').map(x => ({
      ...x,
      addedByName: x.addedBy ? (byId[x.addedBy]?.display_name || 'a member') : null,
    }))

    let inviteNames = []
    const inviteIds = (inv || []).map(x => x.invitee_id)
    if (inviteIds.length > 0) {
      const { data: invPeople, error: ipErr } = await supabase
        .from('helper_profiles_public').select('user_id, display_name').in('user_id', inviteIds)
      if (ipErr) console.error('Failed to load invited names:', ipErr)
      inviteNames = inviteIds.map(uid => ({ userId: uid, name: (invPeople || []).find(p => p.user_id === uid)?.display_name || 'Neighbor' }))
    }

    setGroup(g)
    if (g.steward_id === user.id) {
      const { data: cands, error: cErr } = await supabase.rpc('community_group_steward_candidates', { p_group: id })
      if (cErr) console.error('Failed to load who could be steward:', cErr)
      setStewardCandidates((cands || []).map(c => (typeof c === 'string' ? c : c.community_group_steward_candidates)))
    } else {
      setStewardCandidates([])
    }
    setMembers(list)
    setWaiting(waitingList)
    const { data: unlock } = await supabase.rpc('invite_unlock_date', { p_group: id })
    setInviteUnlock(unlock ? new Date(unlock) : null)
    membersRef.current = list
    setRemovals(r || [])
    setPendingInvites(inviteNames)
    return true
  }

  // Newest POST_LIMIT posts, opened on this device. Posts from before you
  // joined were never locked for you, so they're left out with a note.
  async function loadPosts() {
    const { data, error } = await supabase
      .from('community_group_posts').select('id, sender_id, created_at, edit_count')
      .eq('group_id', id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(POST_LIMIT)
    if (error) { console.error('Failed to load the board:', error); return }
    const rows = (data || []).reverse()
    const deviceId = await getDeviceId()
    let copies = []
    if (deviceId && rows.length > 0) {
      const { data: c, error: cErr } = await supabase
        .from('community_group_post_copies').select('post_id, ciphertext, nonce, version')
        .in('post_id', rows.map(p => p.id)).eq('user_id', user.id).eq('device_id', deviceId)
      if (cErr) console.error('Failed to load locked copies:', cErr)
      // Edited posts have several versions. Show the newest.
      const newest = new Map()
      for (const row of c || []) { const have = newest.get(row.post_id); if (!have || (row.version || 1) > (have.version || 1)) newest.set(row.post_id, row) }
      copies = Array.from(newest.values())
    }
    const senderOf = Object.fromEntries(rows.map(p => [p.id, p.sender_id]))
    const opened = await decryptMany(copies.map(c => ({ key: c.post_id, ciphertext: c.ciphertext, nonce: c.nonce, senderId: senderOf[c.post_id] })))

    const me = membersRef.current.find(x => x.userId === user.id)
    const joinedAt = me ? new Date(me.joinedAt) : null
    let older = false
    const visible = []
    for (const p of rows) {
      const text = opened.get(p.id)
      if (text == null && joinedAt && new Date(p.created_at) < joinedAt) { older = true; continue }
      visible.push({ ...p, text: text ?? "[This post can't be opened on this device]" })
    }
    setHiddenOlder(older)
    setPosts(visible)
  }

  async function send(e) {
    e.preventDefault()
    const text = newPost.trim()
    if (!text || sending) return
    setSending(true)
    setSendNote('')
    if (editingPost) {
      if (text === editingPost.text) { setEditingPost(null); setNewPost(''); setSending(false); return }
      const result = await editGroupPost({ postId: editingPost.id, senderId: user.id, memberIds: members.map(m => m.userId), text })
      setSending(false)
      if (result === 'edited') { setEditingPost(null); setNewPost(''); await loadPosts() }
      else if (result === 'not-allowed') { setSendNote('You can only edit your last post, within 15 minutes of sending it.'); setEditingPost(null); setNewPost('') }
      else setSendNote('Could not save your edit. Check your connection and try again.')
      return
    }
    const { status, missed } = await sendGroupPost({ groupId: id, senderId: user.id, memberIds: members.map(m => m.userId), text })
    setSending(false)
    if (status === 'sent') {
      setNewPost('')
      if (missed > 0) setSendNote(missed === 1 ? "1 member hasn't opened VWB since private boards started, so they can't read this post." : missed + " members haven't opened VWB since private boards started, so they can't read this post.")
      await loadPosts()
    } else if (status === 'not-ready') {
      setSendNote("This device can't lock posts yet. Close VWB, open it again, and try once more.")
    } else {
      setSendNote('Could not post. Check your connection and try again.')
    }
  }

  // Your newest post, if sent in the last 15 minutes. The database decides.
  const lastMinePostId = (() => {
    for (let i = posts.length - 1; i >= 0; i--) if (posts[i].sender_id === user.id) return posts[i].id
    return null
  })()
  function canEditPost(p) {
    return p.id === lastMinePostId && Date.now() - new Date(p.created_at).getTime() < 15 * 60 * 1000 && !String(p.text).startsWith("[This post can't")
  }
  async function showPostHistory(p) {
    const versions = await fetchEditHistory({ kind: 'post', itemId: p.id, userId: user.id, senderId: p.sender_id })
    setPostHistory({ post: p, versions })
  }

  async function deletePost(post) {
    if (!confirm('Delete this post for everyone?')) return
    const { error } = await supabase.from('community_group_posts').update({ deleted_at: new Date().toISOString() }).eq('id', post.id)
    if (error) { console.error('Failed to delete post:', error); alert('Could not delete this post. Try again.'); return }
    loadPosts()
  }

  // --- Members panel actions ---------------------------------------

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      // Only people you already know: talked with, vouched for or by, or
      // share a group or organization with. The database decides.
      const { data, error } = await supabase.rpc('search_people_to_invite', { p_group: id, p_query: q.replace(/[%_]/g, '') })
      if (error) { console.error('Member search failed:', error); return }
      const taken = new Set([...members.map(m => m.userId), ...pendingInvites.map(p => p.userId)])
      setResults((data || []).filter(p => !taken.has(p.user_id)))
    }, 300)
    return () => clearTimeout(t)
  }, [search, members, pendingInvites])

  // Load my settings for this group, and clear the "new post" alert for it
  // since I am here now.
  useEffect(() => {
    if (!id || !user?.id) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('community_group_user_settings').select('alerts, muted_until, pinned, archived')
        .eq('group_id', id).eq('user_id', user.id).maybeSingle()
      if (error) console.error('Failed to load your group settings:', error)
      if (!cancelled && data) setMySettings(data)
      const { error: readErr } = await supabase.from('notifications').update({ read: true })
        .eq('user_id', user.id).eq('type', 'group_post').eq('link', '/groups/' + id).eq('read', false)
      if (readErr) console.error('Failed to clear group alert:', readErr)
    })()
    return () => { cancelled = true }
  }, [id, user?.id])

  async function saveSetting(patch) {
    const next = { ...mySettings, ...patch }
    setMySettings(next)
    setSettingsNote('')
    const { error } = await supabase.from('community_group_user_settings').upsert(
      { group_id: id, user_id: user.id, alerts: next.alerts, muted_until: next.muted_until, pinned: next.pinned, archived: next.archived, updated_at: new Date().toISOString() },
      { onConflict: 'group_id,user_id' })
    if (error) {
      console.error('Failed to save group setting:', error)
      setMySettings(mySettings)
      setSettingsNote("We couldn't save that. Try again.")
    }
  }

  function muteFor(ms) {
    saveSetting({ muted_until: ms === null ? null : ms === Infinity ? '2099-01-01T00:00:00Z' : new Date(Date.now() + ms).toISOString() })
  }
  const mutedNow = !!mySettings.muted_until && new Date(mySettings.muted_until) > new Date()

  // An alert can point at one decision. Open the panel, scroll to it, and
  // light it up. If it was already answered or taken back, say so.
  useEffect(() => {
    if (!focusKey || focusDone.current || !group || loading || !focusReady) return
    const isRemoval = focusKey.startsWith('removal-') || focusKey.startsWith('waiting-')
    const ready = isRemoval ? members.length > 0 : panelOpen
    if (!ready) return
    if (!panelOpen) { setPanelTab('group'); setPanelOpen(true); return }
    if (panelTab !== 'group') { setPanelTab('group'); return }
    const el = document.getElementById('focus-' + focusKey)
    if (el) {
      focusDone.current = true
      setTimeout(() => { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus?.({ preventScroll: true }) }, 150)
      navigate(location.pathname, { replace: true })
    } else if (isRemoval || proposalsLoaded) {
      focusDone.current = true
      setFocusGone(true)
      navigate(location.pathname, { replace: true })
    }
  }, [focusKey, group, loading, focusReady, panelOpen, panelTab, members, removals, proposals]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping an alert while this group is already open does not reload the page,
  // so the first-load setup above never runs again. Pick up the new target here:
  // refresh what the alert is about, then open the panel and point at it.
  useEffect(() => {
    if (firstFocusRun.current) { firstFocusRun.current = false; return }
    const f = new URLSearchParams(location.search).get('focus')
    if (!f) return
    focusDone.current = false
    setFocusGone(false)
    setProposalsLoaded(false)
    setFocusReady(false)
    setFocusKey(f)
    setPanelTab('group')
    setPanelOpen(true)
    ;(async () => {
      await Promise.all([loadGroup(), loadShared()])
      setFocusReady(true)
    })()
  }, [location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once the panel is closed, the pointer has done its job.
  useEffect(() => { if (!panelOpen && focusDone.current) setFocusKey(null) }, [panelOpen])

  async function loadShared() {
    const [{ data: pr, error: pErr }, { data: ch, error: cErr }] = await Promise.all([
      supabase.from('community_group_proposals').select('kind, value, proposed_by, created_at').eq('group_id', id),
      supabase.from('community_group_changes').select('id, summary, created_at').eq('group_id', id).order('created_at', { ascending: false }).limit(6),
    ])
    if (pErr) console.error('Failed to load group requests:', pErr)
    if (cErr) console.error('Failed to load group changes:', cErr)
    setProposals(pr || [])
    setProposalsLoaded(true)
    setChanges(ch || [])
  }

  useEffect(() => {
    if (!panelOpen || !id) return
    loadShared()
  }, [panelOpen, id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function changeSetting(kind, value) {
    setSharedBusy(true); setSharedNote('')
    const { data, error } = await supabase.rpc('change_community_group_setting', { p_group: id, p_kind: kind, p_value: value })
    setSharedBusy(false)
    if (error) {
      console.error('Group setting change failed:', error)
      setSharedNote(error.message && error.code && error.code !== 'PGRST202' && error.message.length < 140 ? error.message : "We couldn't do that. Try again.")
      return
    }
    setSharedNote(data === 'asked' ? 'Asked. A different member has to agree before it changes.' : 'Done.')
    await loadShared()
    await loadGroup()
  }

  async function answerProposal(kind, accept) {
    setSharedBusy(true); setSharedNote('')
    const { error } = await supabase.rpc('answer_community_group_proposal', { p_group: id, p_kind: kind, p_accept: accept })
    setSharedBusy(false)
    if (error) { console.error('Answering group request failed:', error); setSharedNote(error.code === '42501' && error.message ? error.message : "We couldn't do that. Try again.") }
    await loadShared()
    await loadGroup()
  }

  async function cancelProposal(kind) {
    setSharedBusy(true); setSharedNote('')
    const { error } = await supabase.rpc('cancel_community_group_proposal', { p_group: id, p_kind: kind })
    setSharedBusy(false)
    if (error) { console.error('Taking back group request failed:', error); setSharedNote("We couldn't do that. Try again.") }
    await loadShared()
  }

  // The decision an alert pointed at gets an outline and a label.
  const focusStyle = (key) => focusKey === key
    ? { outline: '2px solid #4ecca3', background: 'rgba(78,204,163,0.12)', borderRadius: '8px', padding: '0.5rem', margin: '0.35rem 0' }
    : undefined
  const focusLabel = (key) => focusKey === key
    ? <span style={{ display: 'block', width: '100%', color: '#4ecca3', fontWeight: 700, fontSize: '0.8rem' }}>&#128073; This is the one you were asked about</span>
    : null

  const DISAPPEAR_CHOICES = [[0, 'Off (posts stay)'], [1440, '1 day'], [10080, '7 days'], [43200, '30 days']]

  async function invite(person) {
    const { error } = await supabase.rpc('invite_to_community_group', { p_group: id, p_invitee: person.user_id })
    if (error) { console.error('Invite failed:', error); alert(error.code === '42501' && error.message ? error.message : error.message?.includes("can't invite") ? "You can't invite this person." : 'Could not send the invite. Try again.'); return }
    setSearch('')
    setResults([])
    loadGroup()
  }

  async function takeBackInvite(userId) {
    const { error } = await supabase.from('community_group_invites').delete().eq('group_id', id).eq('invitee_id', userId)
    if (error) { console.error('Failed to take back invite:', error); alert('Could not take back the invite. Try again.'); return }
    loadGroup()
  }

  async function setLink(on) {
    const { error } = await supabase.rpc('set_community_group_link', { p_group: id, p_on: on })
    if (error) { console.error('Failed to change the join link:', error); alert('Could not change the link. Try again.'); return }
    setCopied(false)
    loadGroup()
  }

  const joinUrl = group?.join_token ? window.location.origin + '/groups/join/' + group.join_token : ''

  async function copyLink() {
    try { await navigator.clipboard.writeText(joinUrl); setCopied(true) } catch { setCopied(false); alert('Copy did not work. Press and hold the link to copy it.') }
  }

  // Opening a removal (or the steward removing alone) needs a reason from the
  // list. Agreeing to someone else's request doesn't: you see their reason.
  function askRemove(member) {
    const open = removals.find(r => r.target_id === member.userId)
    if (open && group?.steward_id !== user.id) {
      const why = open.reason ? ' Reason given: ' + open.reason + '.' : ''
      if (!confirm('Agree to remove ' + member.name + '?' + why + ' They will be removed from the group right away.')) return
      doRemove(member, null).then(r => { if (r && r.error) alert(r.error.code === '42501' && r.error.message ? r.error.message : 'Could not do that. Try again.') })
      return
    }
    setRemoveFor(member)
    setRemoveReason('')
    setRemoveError('')
  }

  async function doRemove(member, reason) {
    const { data, error } = await supabase.rpc('request_community_group_removal', { p_group: id, p_target: member.userId, p_reason: reason })
    if (error) { console.error('Removal request failed:', error); return { error } }
    if (data === 'removed') alert(member.name + ' was removed from the group.')
    loadGroup()
    return {}
  }

  async function submitRemove() {
    if (!removeReason) { setRemoveError('Pick a reason.'); return }
    setRemoveBusy(true)
    setRemoveError('')
    const { error } = await doRemove(removeFor, removeReason)
    setRemoveBusy(false)
    if (error) { setRemoveError(error.code === '42501' && error.message ? error.message : 'Could not do that. Try again.'); return }
    setRemoveFor(null)
  }

  async function letIn(person) {
    const { error } = await supabase.rpc('approve_community_group_member', { p_group: id, p_user: person.userId })
    if (error) { console.error('Approve failed:', error); alert(error.message?.includes('other than') ? 'Someone other than the person who invited them has to let them in.' : 'Could not let them in. Try again.'); return }
    loadGroup()
  }

  async function sayNo(person) {
    if (!confirm('Say no to ' + person.name + "? They won't join the group.")) return
    const { error } = await supabase.rpc('decline_community_group_member', { p_group: id, p_user: person.userId })
    if (error) { console.error('Decline failed:', error); alert('Could not do that. Try again.'); return }
    loadGroup()
  }

  // Steward handoff: the steward offers, the other person says yes or no.
  async function offerSteward(member) {
    const msg = member
      ? 'Ask ' + member.name + " to take over as steward? They'll need to say yes. Until then, you're still steward."
      : 'Take back your steward offer?'
    if (!confirm(msg)) return
    const { error } = await supabase.rpc('offer_community_group_steward', { p_group: id, p_user: member ? member.userId : null })
    if (error) { console.error('Steward offer failed:', error); alert('Could not do that. Try again.'); return }
    loadGroup()
  }

  async function answerSteward(accept) {
    if (accept && !confirm("Become this group's steward? You'll control the join link, you can remove someone on your own for safety, and members can't remove you.")) return
    const { error } = await supabase.rpc('answer_community_group_steward', { p_group: id, p_accept: accept })
    if (error) {
      console.error('Steward answer failed:', error)
      alert(error.message?.includes('head or one of its organizers')
        ? "Only the organization's head or one of its organizers can be steward. Ask the organization to make you an organizer first."
        : 'Could not do that. The offer may have been taken back.')
    }
    loadGroup()
  }

  async function withdrawRemoval(member) {
    const { error } = await supabase.from('community_group_removals').delete().eq('group_id', id).eq('target_id', member.userId).eq('requested_by', user.id)
    if (error) { console.error('Failed to take back removal request:', error); alert('Could not take it back. Try again.'); return }
    loadGroup()
  }

  async function leave() {
    const last = members.length === 1
    const stewardNote = group.steward_id === user.id && !last
      ? "You're the steward. If you leave, the group becomes an everyday group where everyone is equal. To pass the role on instead, use Make steward first (it's offered to the organization's head and organizers in the group). "
      : ''
    if (!confirm(last ? "You're the last member. Leaving deletes this group and its whole board. Leave?" : stewardNote + 'Leave ' + group.name + '? You can only come back if someone invites you again.')) return
    const { error } = await supabase.from('community_group_members').delete().eq('group_id', id).eq('user_id', user.id)
    if (error) { console.error('Failed to leave group:', error); alert('Could not leave the group. Try again.'); return }
    navigate('/groups', { replace: true })
  }

  // Same idea as reporting a private conversation: admins can't read the
  // board, so the reporter can attach what's on their own screen.
  async function sendReport() {
    if (!reportReason) { setReportState('Pick the closest reason.'); return }
    setReportState('sending')
    let details = reportDetails.trim()
    const theirs = posts.filter(p => p.sender_id === reportFor.userId).slice(-10)
    if (includeEvidence && theirs.length > 0) {
      details = (details ? details + '\n\n' : '') + '--- Their recent posts in the group, attached by the reporter ---\n' + theirs.map(p => p.text).join('\n')
    }
    const { error } = await submitUserReport({ reporterId: user.id, reportedUserId: reportFor.userId, source: 'group', reason: reportReason, details })
    setReportState(error ? 'Could not send your report. Try again.' : 'sent')
  }

  function closeReport() { setReportFor(null); setReportReason(''); setReportDetails(''); setReportState(''); setIncludeEvidence(true) }

  if (loading) return <div className="conversation-page group-page"><p className="groups-empty">Loading...</p></div>

  if (amWaiting && group) {
    return (
      <div className="conversation-page group-page">
        <div className="groups-page">
          <h1>{campfires.has(group.id) ? '\u{1F525} ' : ''}{group.name}</h1>
          <p className="groups-note">You're waiting to be let in. A member of the group will approve you soon. You'll see the board once they do.</p>
          <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/groups')}>Back to groups</button>
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="conversation-page group-page">
        <p className="groups-empty">This group isn't available. You may have left it, or it was removed.</p>
        <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/groups')}>Back to groups</button>
      </div>
    )
  }

  const iAmSteward = group.steward_id === user.id
  const canChangeLink = !group.steward_id || iAmSteward
  const nameOf = (uid) => members.find(m => m.userId === uid)?.name || 'Former member'
  const avatarOf = (uid) => members.find(m => m.userId === uid)?.avatar || null

  return (
    <div className="conversation-page group-page">
      <div className="convo-header">
        <button className="convo-back" onClick={() => navigate('/groups')} aria-label="Back to groups">&#8592;</button>
        <div className="convo-header-info">
          <h1>{campfires.has(group.id) ? '\u{1F525} ' : ''}{group.name}</h1>
          <p className="convo-context">{isSidechat ? 'Sidechat' + (parentName ? ' of ' + parentName : '') + ' · ' : (orgName ? 'For ' + orgName + ' · ' : '')}{members.length} {members.length === 1 ? 'member' : 'members'} · private board</p>
        </div>
        <button type="button" className="page-top-btn group-members-btn" onClick={() => setPanelOpen(true)} aria-haspopup="dialog">Settings{waiting.length > 0 ? ' (' + waiting.length + ' waiting)' : ''}</button>
      </div>

      {sidechats.length > 0 && (
        <nav aria-label="Sidechats" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 1rem', borderBottom: '1px solid #333' }}>
          <span className="cal-sub" style={{ alignSelf: 'center' }}>Sidechats:</span>
          {sidechats.map((s) => (
            <button key={s.id} type="button" className="btn btn-outline group-small-btn" onClick={() => navigate('/groups/' + s.id)}>{'\u21B3 '}{s.name}</button>
          ))}
        </nav>
      )}
      {isSidechat && parentId && (
        <nav aria-label="Back to the general chat" style={{ padding: '0.4rem 1rem', borderBottom: '1px solid #333' }}>
          <button type="button" className="group-post-delete" onClick={() => navigate('/groups/' + parentId)}>{'\u2190 '}Back to {parentName || 'the general chat'}</button>
        </nav>
      )}
      <div className="convo-messages" ref={containerRef} onScroll={onScroll} role="log" aria-live="polite" aria-label={group.name + ' board'}>
        <p className="group-lock-note">&#128274; Only members can read this board. Not even VWB can.</p>
        {group.steward_offer_to === user.id && (
          <div className="group-offer" role="status">
            <p><strong>{nameOf(group.steward_id)}</strong> asked you to take over as this group's steward.</p>
            <div className="groups-actions">
              <button type="button" className="btn btn-outline" onClick={() => answerSteward(false)}>No thanks</button>
              <button type="button" className="btn btn-primary" onClick={() => answerSteward(true)}>Become steward</button>
            </div>
          </div>
        )}
        {hiddenOlder && <p className="group-lock-note">Posts from before you joined were locked before you were here, so they can't be shown.</p>}
        {posts.length === 0 && <p className="convo-empty">No posts yet. Say hello!</p>}
        {posts.map((p, idx) => {
          const isMe = p.sender_id === user.id
          const prev = posts[idx - 1]
          const start = !prev || prev.sender_id !== p.sender_id || (new Date(p.created_at) - new Date(prev.created_at)) > GROUP_WINDOW_MS
          return (
            <div key={p.id} className={'group-post' + (isMe ? ' mine' : '')} style={{ marginTop: start ? '0.6rem' : '0.15rem' }}>
              {!isMe && <AvatarDisplay url={avatarOf(p.sender_id)} userId={p.sender_id} size={28} />}
              <div className={'chat-bubble ' + (isMe ? 'mine' : 'theirs')}>
                {!isMe && start && <p className="group-post-name">{nameOf(p.sender_id)}</p>}
                <p className="chat-body">{p.text}</p>
                <span className="chat-time">
                  {new Date(p.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {p.edit_count > 0 && <> · <button type="button" className="group-post-delete" onClick={() => showPostHistory(p)}>Edited</button></>}
                  {isMe && canEditPost(p) && <> · <button type="button" className="group-post-delete" onClick={() => { setEditingPost(p); setNewPost(p.text); setSendNote('') }}>Edit</button></>}
                  {isMe && <> · <button type="button" className="group-post-delete" onClick={() => deletePost(p)}>Delete</button></>}
                </span>
              </div>
              {isMe && <AvatarDisplay url={avatarOf(user.id)} userId={user.id} size={28} />}
            </div>
          )
        })}
        {showNew && <button type="button" className="group-new-btn" onClick={jumpToNewest}>New posts &#8595;</button>}
      </div>

      {sendNote && <p className="convo-send-error" role="status">{sendNote}</p>}
      {group.disappear_after_mins ? <p className="group-lock-note">&#9201; Posts here disappear after {group.disappear_after_mins / 1440} day{group.disappear_after_mins === 1440 ? '' : 's'}.</p> : null}
      {group.announcement_only && group.steward_id && !iAmSteward && <p className="group-lock-note">&#128226; Only the steward posts here. You can still read, and message people outside the group.</p>}
      {!(group.announcement_only && group.steward_id && !iAmSteward) && (
      <>
      {editingPost && (
        <p className="convo-editing" role="status">
          Editing your post. Everyone in this group can see what it said before.
          {' '}<button type="button" className="group-post-delete" onClick={() => { setEditingPost(null); setNewPost('') }}>Cancel</button>
        </p>
      )}
      <form className="convo-input-bar" onSubmit={send}>
        <label htmlFor="group-post" className="sr-only">Write a post</label>
        <input id="group-post" type="text" className="convo-input" value={newPost} onChange={e => setNewPost(e.target.value)} placeholder="Write to the group..." maxLength={2000} disabled={sending} autoComplete="off" />
        <button type="submit" className="convo-send" disabled={!newPost.trim() || sending}>{sending ? '...' : (editingPost ? 'Save' : 'Send')}</button>
      </form>
      </>
      )}

      {postHistory && (
        <>
          <button type="button" className="app-dialog-scrim" aria-label="Close" tabIndex={-1} onClick={() => setPostHistory(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="post-history-title" className="edit-history">
            <h3 id="post-history-title">Edit history</h3>
            {postHistory.versions.length === 0 && <p>The earlier versions can't be opened on this device.</p>}
            {postHistory.versions.map((v, i) => (
              <div key={v.version} className="edit-history-row">
                <strong>{i === postHistory.versions.length - 1 ? 'Now' : (i === 0 ? 'Original' : 'Edit ' + i)}</strong>
                <p>{v.text}</p>
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-full" onClick={() => setPostHistory(null)}>Close</button>
          </div>
        </>
      )}

      {panelOpen && (
        <>
          <button type="button" className="app-dialog-scrim" aria-label="Close" tabIndex={-1} onClick={() => setPanelOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="members-title" className="group-panel">
            <div className="group-panel-head">
              <h2 id="members-title">{group.name}</h2>
              <button type="button" className="group-panel-close" onClick={() => setPanelOpen(false)} aria-label="Close">&#10005;</button>
            </div>
            {group.description && <p className="groups-card-desc">{group.description}</p>}

            <div role="tablist" aria-label="Group settings" className="group-tabs">
              <button type="button" role="tab" id="tab-group" aria-selected={panelTab === 'group'} aria-controls="panel-group" tabIndex={panelTab === 'group' ? 0 : -1} className={'group-tab' + (panelTab === 'group' ? ' active' : '')} onClick={() => setPanelTab('group')}>Group</button>
              <button type="button" role="tab" id="tab-mine" aria-selected={panelTab === 'mine'} aria-controls="panel-mine" tabIndex={panelTab === 'mine' ? 0 : -1} className={'group-tab' + (panelTab === 'mine' ? ' active' : '')} onClick={() => setPanelTab('mine')}>My notifications</button>
            </div>

            {panelTab === 'mine' && (
            <div role="tabpanel" id="panel-mine" aria-labelledby="tab-mine">
            <h3 className="groups-section">Alerts from this group</h3>
            <p className="groups-note">Only you see these. Nobody else in the group is told.</p>
            <label htmlFor="group-alerts" className="groups-note">New post alerts</label>
            <select id="group-alerts" className="group-search" value={mySettings.alerts} onChange={e => saveSetting({ alerts: e.target.value })}>
              <option value="all">Tell me about new posts</option>
              <option value="off">No alerts from this group</option>
            </select>
            <label htmlFor="group-mute" className="groups-note">Quiet for a while</label>
            <select id="group-mute" className="group-search" value={mutedNow ? (mySettings.muted_until >= '2099' ? 'forever' : 'timed') : 'off'} onChange={e => {
              const v = e.target.value
              if (v === 'off') muteFor(null)
              else if (v === '1h') muteFor(60 * 60 * 1000)
              else if (v === '8h') muteFor(8 * 60 * 60 * 1000)
              else if (v === '1w') muteFor(7 * 24 * 60 * 60 * 1000)
              else if (v === 'forever') muteFor(Infinity)
            }}>
              {mutedNow && mySettings.muted_until < '2099' && <option value="timed">Quiet until {new Date(mySettings.muted_until).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</option>}
              <option value="off">Not quiet</option>
              <option value="1h">Quiet for 1 hour</option>
              <option value="8h">Quiet for 8 hours</option>
              <option value="1w">Quiet for 1 week</option>
              <option value="forever">Quiet until I turn it back on</option>
            </select>
            <div className="groups-actions">
              <button type="button" className="btn btn-outline group-small-btn" aria-pressed={mySettings.pinned} onClick={() => saveSetting({ pinned: !mySettings.pinned })}>{mySettings.pinned ? 'Pinned to top' : 'Pin to top'}</button>
              <button type="button" className="btn btn-outline group-small-btn" aria-pressed={mySettings.archived} onClick={() => saveSetting({ archived: !mySettings.archived })}>{mySettings.archived ? 'Archived (tap to bring back)' : 'Archive'}</button>
            </div>
            {settingsNote && <p className="groups-error" role="alert">{settingsNote}</p>}
            </div>
            )}

            {panelTab === 'group' && (
            <div role="tabpanel" id="panel-group" aria-labelledby="tab-group">
            {focusGone && <p className="groups-note" role="status">That request isn't open anymore. It was already answered or taken back.</p>}
            <h3 className="groups-section">Group settings</h3>
            <p className="groups-note">{group.steward_id
              ? (iAmSteward ? 'You are the steward, so you can change these right away. Everyone is told.' : 'Only the steward can change these. Everyone is told when they do.')
              : 'These change the group for everyone. You ask, and a different member has to agree. Everyone is told.'}</p>
            {(group.steward_id ? iAmSteward : true) && (
              <>
                <label htmlFor="group-name-edit" className="groups-note">Group name</label>
                <input id="group-name-edit" className="group-search" maxLength={80} value={nameDraft ?? group.name} onChange={e => setNameDraft(e.target.value)} />
                {nameDraft !== null && nameDraft.trim() && nameDraft.trim() !== group.name && (
                  <button type="button" className="btn btn-outline group-small-btn" disabled={sharedBusy} onClick={async () => { await changeSetting('name', nameDraft.trim()); setNameDraft(null) }}>{group.steward_id ? 'Save name' : 'Ask to change name'}</button>
                )}
                <label htmlFor="group-desc-edit" className="groups-note">Description</label>
                <textarea id="group-desc-edit" className="group-search" rows={2} maxLength={500} value={descDraft ?? (group.description || '')} onChange={e => setDescDraft(e.target.value)} />
                {descDraft !== null && descDraft.trim() !== (group.description || '') && (
                  <button type="button" className="btn btn-outline group-small-btn" disabled={sharedBusy} onClick={async () => { await changeSetting('description', descDraft.trim()); setDescDraft(null) }}>{group.steward_id ? 'Save description' : 'Ask to change description'}</button>
                )}
                <label htmlFor="group-disappear" className="groups-note">Posts disappear after</label>
                <select id="group-disappear" className="group-search" disabled={sharedBusy} value={group.disappear_after_mins || 0} onChange={e => {
                  const mins = Number(e.target.value)
                  if (mins > 0 && !confirm('Posts older than this will be removed for everyone, for good. Turn it on?')) return
                  changeSetting('disappear', String(mins))
                }}>
                  {DISAPPEAR_CHOICES.map(([mins, label]) => <option key={mins} value={mins}>{label}</option>)}
                </select>
                {group.steward_id && iAmSteward && (
                  <button type="button" className="btn btn-outline group-small-btn" aria-pressed={!!group.announcement_only} disabled={sharedBusy} onClick={() => changeSetting('announce', group.announcement_only ? 'off' : 'on')}>
                    {group.announcement_only ? 'Announcement-only is on (tap to turn off)' : 'Make announcement-only (only you post)'}
                  </button>
                )}
              </>
            )}
            {!group.steward_id || iAmSteward ? null : (
              <p className="groups-note">
                Name: {group.name}. {group.disappear_after_mins ? 'Posts disappear after ' + (group.disappear_after_mins / 1440) + ' day' + (group.disappear_after_mins === 1440 ? '' : 's') + '.' : 'Posts stay until someone deletes them.'}
                {group.announcement_only ? ' Only the steward posts here.' : ''}
              </p>
            )}
            {proposals.map(pr => {
              const who = members.find(m => m.userId === pr.proposed_by)?.name || 'A member'
              const mine = pr.proposed_by === user.id
              const what = pr.kind === 'name' ? 'rename the group to "' + pr.value + '"'
                : pr.kind === 'description' ? 'change the description'
                : (pr.value === '0' ? 'turn off disappearing posts' : 'make posts disappear after ' + (Number(pr.value) / 1440) + ' day' + (pr.value === '1440' ? '' : 's'))
              return (
                <div key={pr.kind} id={'focus-proposal-' + pr.kind} tabIndex={-1} className="group-member" style={{ flexWrap: 'wrap', ...focusStyle('proposal-' + pr.kind) }}>
                  {focusLabel('proposal-' + pr.kind)}
                  <span className="group-member-name">{mine ? 'You asked to ' : who + ' asked to '}{what}.{!mine ? ' Needs your answer.' : ''}</span>
                  {mine
                    ? <button type="button" className="btn btn-outline group-small-btn" disabled={sharedBusy} onClick={() => cancelProposal(pr.kind)}>Take back</button>
                    : <>
                        <button type="button" className="btn btn-primary group-small-btn" disabled={sharedBusy} onClick={() => answerProposal(pr.kind, true)}>Agree</button>
                        <button type="button" className="btn btn-outline group-small-btn" disabled={sharedBusy} onClick={() => answerProposal(pr.kind, false)}>No thanks</button>
                      </>}
                </div>
              )
            })}
            {sharedNote && <p className="groups-note" role="status">{sharedNote}</p>}
            {changes.length > 0 && (
              <>
                <p className="groups-note">Recent changes:</p>
                {changes.map(ch => <p key={ch.id} className="groups-note">{ch.summary} <span style={{ opacity: 0.7 }}>({new Date(ch.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })})</span></p>)}
              </>
            )}

            {waiting.length > 0 && (
              <>
                <h3 className="groups-section">Waiting to be let in ({waiting.length})</h3>
                <p className="groups-note">Any member can let someone in, except the person who invited them. That way it always takes two people.</p>
                {waiting.map(w => {
                  const blockedByMe = w.addedBy === user.id && !iAmSteward
                  return (
                    <div key={w.userId} id={'focus-waiting-' + w.userId} tabIndex={-1} className="group-member" style={{ flexWrap: 'wrap', ...focusStyle('waiting-' + w.userId) }}>
                      {focusLabel('waiting-' + w.userId)}
                      <AvatarDisplay url={w.avatar} userId={w.userId} size={32} />
                      <span className="group-member-name"><UserName userId={w.userId} name={w.name} /><span className="group-member-sub">{w.addedByName ? 'Invited by ' + (w.addedBy === user.id ? 'you' : w.addedByName) : 'Joined with the link'}</span></span>
                      <span className="group-member-actions">
                        {blockedByMe
                          ? <span className="groups-note group-inline-note">Another member will let them in</span>
                          : <button type="button" className="btn btn-primary group-small-btn" onClick={() => letIn(w)}>Let in</button>}
                        <button type="button" className="btn btn-outline group-small-btn" onClick={() => sayNo(w)}>Say no</button>
                      </span>
                    </div>
                  )
                })}
              </>
            )}

            {isSidechat && (
              <SidechatAdd groupId={id} orgId={group.organization_id} memberIds={new Set(members.map(m => m.userId))} isSteward={iAmSteward} onAdded={loadGroup} />
            )}
            {!isSidechat && (<>
            <h3 className="groups-section">Invite someone</h3>
            <label htmlFor="invite-search" className="sr-only">Search members by name</label>
            {inviteUnlock && inviteUnlock > new Date() ? (
              <p className="groups-note">You can invite people by name starting {inviteUnlock.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}. This keeps groups safe while you are new. You can share the join link now. A member will let people in.</p>
            ) : (<>
            <input id="invite-search" type="search" className="group-search" placeholder="Type a name" value={search} onChange={e => setSearch(e.target.value)} autoComplete="off" />
            {results.map(p => (
              <div key={p.user_id} className="group-member">
                <AvatarDisplay url={p.avatar_url} userId={p.user_id} size={32} />
                <span className="group-member-name"><UserName userId={p.user_id} name={p.display_name || 'Neighbor'} /></span>
                <button type="button" className="btn btn-primary group-small-btn" onClick={() => invite(p)}>Invite</button>
              </div>
            ))}
            {search.trim().length >= 2 && results.length === 0 && <p className="groups-note">No one found by that name. You can search people you have messaged, vouched for, or share a group or organization with.</p>}
            </>)}
            {pendingInvites.length > 0 && (
              <>
                <p className="groups-note">Invited, waiting to say yes:</p>
                {pendingInvites.map(p => (
                  <div key={p.userId} className="group-member">
                    <span className="group-member-name">{p.name}</span>
                    <button type="button" className="btn btn-outline group-small-btn" onClick={() => takeBackInvite(p.userId)}>Take back</button>
                  </div>
                ))}
              </>
            )}

            <h3 className="groups-section">Join link</h3>
            {group.join_token ? (
              <>
                <p className="groups-note">
                  People who use this link wait until a member lets them in. 
                  {canChangeLink ? (group.steward_id ? 'Only you, as steward, can turn it off or make a new one.' : 'Any member can turn it off or make a new one.') : 'Only the steward can turn it off or make a new one.'}
                </p>
                <p className="group-link">{joinUrl}</p>
                <QrShare url={joinUrl} title={group.name} hint="Your friend scans this, taps Join, and then waits for a member to let them in." />
                <div className="groups-actions">
                  <button type="button" className="btn btn-primary" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
                  {canChangeLink && <button type="button" className="btn btn-outline" onClick={() => setLink(true)}>New link</button>}
                  {canChangeLink && <button type="button" className="btn btn-outline" onClick={() => setLink(false)}>Turn off</button>}
                </div>
              </>
            ) : canChangeLink ? (
              <>
                <p className="groups-note">The join link is off. Turn it on to let people join by opening a link.</p>
                <button type="button" className="btn btn-outline btn-full" onClick={() => setLink(true)}>Turn on join link</button>
              </>
            ) : (
              <p className="groups-note">The join link is off. In this group, only the steward can turn it on. You can still invite people by name.</p>
            )}

            </>)}

            <h3 className="groups-section">Members ({members.length})</h3>
            <p className="groups-note">
              {group.steward_id
                ? 'Everyone here posts and invites the same way. ' + (iAmSteward ? 'As steward, you can remove someone on your own if it\'s needed for safety. ' : 'The steward can remove someone on their own for safety. ') + 'Other removals take two members: one asks, and a second agrees. The person isn\'t shown the request.'
                : 'Everyone here is equal. Removing someone takes two members: one asks, and a second agrees. The person isn\'t shown the request.'}
            </p>
            {iAmSteward && <p className="groups-note">To hand off the steward role, tap Make steward. It only shows for the organization's head and organizers who are in the group, and they have to say yes.</p>}
            {members.map(m => {
              const isMe = m.userId === user.id
              const isSteward = m.userId === group.steward_id
              const open = removals.find(r => r.target_id === m.userId)
              const mine = open && open.requested_by === user.id
              return (
                <div key={m.userId} id={'focus-removal-' + m.userId} tabIndex={-1} className="group-member" style={focusStyle('removal-' + m.userId)}>
                  {focusLabel('removal-' + m.userId)}
                  <AvatarDisplay url={m.avatar} userId={m.userId} size={32} />
                  <span className="group-member-name"><UserName userId={m.userId} name={m.name} />{isMe ? ' (you)' : ''}{isSteward ? <span className="group-steward-badge">Steward</span> : null}{group.steward_offer_to === m.userId ? <span className="group-member-sub">Asked to take over as steward</span> : null}{open && !isMe ? <span className="group-member-flag">{mine ? ' · you asked to remove' : ' · a member asked to remove'}</span> : null}{open && !isMe && open.reason ? <span className="group-member-sub">Reason: {open.reason}</span> : null}</span>
                  {!isMe && (
                    <span className="group-member-actions">
                      {isSteward
                        ? null
                        : mine && !iAmSteward
                          ? <button type="button" className="btn btn-outline group-small-btn" onClick={() => withdrawRemoval(m)}>Take back</button>
                          : <button type="button" className="btn btn-outline group-small-btn" onClick={() => askRemove(m)}>{iAmSteward ? 'Remove' : open ? 'Agree to remove' : 'Remove'}</button>}
                      {iAmSteward && (group.steward_offer_to === m.userId
                        ? <button type="button" className="btn btn-outline group-small-btn" onClick={() => offerSteward(null)}>Take back steward offer</button>
                        : stewardCandidates.includes(m.userId)
                          ? <button type="button" className="btn btn-outline group-small-btn" onClick={() => offerSteward(m)}>Make steward</button>
                          : null)}
                      <button type="button" className="btn btn-outline group-small-btn group-report-btn" onClick={() => { setPanelOpen(false); setReportFor(m) }}>Report</button>
                    </span>
                  )}
                </div>
              )
            })}

            <button type="button" className="btn btn-outline btn-full group-leave-btn" onClick={leave}>Leave group</button>
            </div>
            )}
          </div>
        </>
      )}

      {removeFor && (
        <>
          <button type="button" className="app-dialog-scrim" aria-label="Close" tabIndex={-1} onClick={() => setRemoveFor(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="group-remove-title" className="app-dialog">
            <h2 id="group-remove-title">Remove {removeFor.name}?</h2>
            <p className="groups-note">
              {group?.steward_id === user.id
                ? 'As steward, you can do this now. Pick the reason.'
                : 'A second member has to agree before it happens. They will see the reason you pick. ' + removeFor.name + " won't see this request."}
            </p>
            <fieldset className="group-fieldset">
              <legend>Why?</legend>
              {REMOVE_REASONS.map(r => (
                <label key={r} className="group-radio">
                  <input type="radio" name="group-remove-reason" value={r} checked={removeReason === r} onChange={() => { setRemoveReason(r); setRemoveError('') }} />
                  {r}
                </label>
              ))}
            </fieldset>
            {removeError && <p className="groups-error" role="alert">{removeError}</p>}
            <div className="groups-actions">
              <button type="button" className="btn btn-outline" onClick={() => setRemoveFor(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitRemove} disabled={removeBusy}>{removeBusy ? 'Sending...' : (group?.steward_id === user.id ? 'Remove now' : 'Ask to remove')}</button>
            </div>
          </div>
        </>
      )}

      {reportFor && (
        <>
          <button type="button" className="app-dialog-scrim" aria-label="Close" tabIndex={-1} onClick={closeReport} />
          <div role="dialog" aria-modal="true" aria-labelledby="group-report-title" className="app-dialog">
            {reportState === 'sent' ? (
              <>
                <h2 id="group-report-title">Thank you</h2>
                <p className="groups-note">An admin will look at this.</p>
                <button type="button" className="btn btn-outline btn-full" onClick={closeReport}>Done</button>
              </>
            ) : (
              <>
                <h2 id="group-report-title">Report {reportFor.name}</h2>
                <p className="groups-note">Only VWB admins see reports. The board is locked, so admins can't read it themselves.</p>
                <fieldset className="group-fieldset">
                  <legend>What happened?</legend>
                  {REPORT_REASONS.map(r => (
                    <label key={r} className="group-radio">
                      <input type="radio" name="group-report-reason" value={r} checked={reportReason === r} onChange={() => { setReportReason(r); setReportState('') }} />
                      {r}
                    </label>
                  ))}
                </fieldset>
                <label htmlFor="group-report-details" className="group-label">Anything else? (optional)</label>
                <textarea id="group-report-details" rows={3} maxLength={500} value={reportDetails} onChange={e => setReportDetails(e.target.value)} />
                <label className="group-radio">
                  <input type="checkbox" checked={includeEvidence} onChange={e => setIncludeEvidence(e.target.checked)} />
                  Attach their last few posts from my screen, so an admin has something to go on
                </label>
                {reportState && reportState !== 'sending' && <p className="groups-error" role="alert">{reportState}</p>}
                <div className="groups-actions">
                  <button type="button" className="btn btn-outline" onClick={closeReport}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={sendReport} disabled={reportState === 'sending'}>{reportState === 'sending' ? 'Sending...' : 'Send report'}</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
