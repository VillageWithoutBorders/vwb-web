import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Peer connections between organizations, and Campfires (organizing chats) built on them.
// Shown on the organization dashboard to Heads and organizers.
// Connecting is a handshake: one side asks, the other says yes. Either side
// can end it. Organizing chats hold the Heads and organizers of every group in
// the chat; the database keeps that list up to date.

function friendly(error, fallback) {
  const msg = error?.message || ''
  return msg && msg.length < 140 && error?.code && error.code !== 'PGRST202' ? msg : fallback
}

export default function OrgConnections({ orgId, orgName }) {
  const navigate = useNavigate()
  const [links, setLinks] = useState([])
  const [ready, setReady] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [confirmEnd, setConfirmEnd] = useState('')
  const [chatName, setChatName] = useState('')
  const [picked, setPicked] = useState([])
  const [chatNote, setChatNote] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_org_connections', { p_org: orgId })
    if (error) console.error('Failed to load connections:', error)
    setLinks(data || [])
    setReady(true)
  }, [orgId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setFound([]); setSearched(false); return }
    let alive = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_orgs_to_connect', { p_org: orgId, p_query: term })
      if (!alive) return
      if (error) { console.error('Organization search failed:', error); setNote("Couldn't search right now. Try again."); return }
      setFound(data || [])
      setSearched(true)
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q, orgId])

  async function run(key, fn, okText) {
    setBusy(key); setNote('')
    const { error } = await fn()
    setBusy('')
    if (error) {
      console.error('Connection action failed:', error)
      setNote(friendly(error, "We couldn't do that. Try again."))
      return false
    }
    setNote(okText)
    setConfirmEnd('')
    await load()
    return true
  }

  const ask = (o) => run('ask' + o.id, () => supabase.rpc('request_org_connection', { p_org: orgId, p_other: o.id }), 'Request sent to ' + o.name + '.')
    .then((ok) => { if (ok) { setQ(''); setFound([]); setSearched(false) } })
  const answer = (l, accept) => run('ans' + l.other_id, () => supabase.rpc('respond_org_connection', { p_org: orgId, p_other: l.other_id, p_accept: accept }), accept ? 'Connected with ' + l.other_name + '.' : 'Request declined.')
  const end = (l, okText) => run('end' + l.other_id, () => supabase.rpc('end_org_connection', { p_org: orgId, p_other: l.other_id }), okText)

  async function startChat(e) {
    e.preventDefault()
    const name = chatName.trim()
    if (!name) { setChatNote('Give the chat a name.'); return }
    if (picked.length === 0) { setChatNote('Pick at least one connected group.'); return }
    setBusy('chat'); setChatNote('')
    const { data, error } = await supabase.rpc('start_coalition_chat', { p_org: orgId, p_name: name.slice(0, 80), p_others: picked })
    setBusy('')
    if (error || !data) {
      console.error('Failed to start Campfire:', error)
      setChatNote(friendly(error, 'Could not start the chat. Try again.'))
      return
    }
    navigate('/groups/' + data, { state: { justStarted: true } })
  }

  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const active = links.filter((l) => l.status === 'active')

  return (
    <>
      <section className="cal-box" aria-labelledby="oc-connections">
        <h2 id="oc-connections">Connect with other groups</h2>
        <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
          Find another group on VWB and ask to connect. Both groups say yes, and either can end it any time. Connected groups can start a Campfire together. They never see your members or your private events.
        </p>

        {links.map((l) => {
          const key = 'l' + l.other_id
          const needsMyAnswer = l.status === 'pending' && !l.asked_by_me
          return (
            <div key={key} className="cal-card" style={{ marginBottom: '0.5rem' }}>
              <span className="cal-card-title">{l.other_name}</span>
              <span className="cal-card-meta">
                {l.status === 'active' ? 'Connected' : needsMyAnswer ? 'Asked to connect with you' : 'Waiting for them to answer'}
              </span>
              <div className="cal-actions" style={{ marginTop: '0.5rem' }}>
                {needsMyAnswer && (
                  <>
                    <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => answer(l, true)}>Accept</button>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => answer(l, false)}>Decline</button>
                  </>
                )}
                {l.status === 'pending' && !needsMyAnswer && (
                  <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => end(l, 'Request withdrawn.')}>Withdraw request</button>
                )}
                {l.status === 'active' && confirmEnd !== key && (
                  <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => setConfirmEnd(key)}>End connection</button>
                )}
                {l.status === 'active' && confirmEnd === key && (
                  <>
                    <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => end(l, 'Connection ended.')}>Yes, end it</button>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => setConfirmEnd('')}>Keep it</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
        {ready && links.length === 0 && <p className="hub-empty">No connections yet. Search for a group below.</p>}

        <label htmlFor="oc-search" className="cal-sub" style={{ display: 'block', marginTop: '0.75rem' }}>Find a group by name</label>
        <div className="hub-search">
          <input id="oc-search" type="text" autoComplete="off" placeholder="Start typing a group name" value={q} onChange={(e) => { setQ(e.target.value); setNote('') }} />
        </div>
        {found.map((o) => (
          <div key={o.id} className="cal-card" style={{ marginTop: '0.5rem' }}>
            <span className="cal-card-title">{o.name}</span>
            {o.link_status === 'active' && <span className="cal-card-meta">Already connected</span>}
            {o.link_status === 'pending' && <span className="cal-card-meta">Request already open. Check your list above.</span>}
            {!o.link_status && (
              <div className="cal-actions" style={{ marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => ask(o)}>Ask to connect</button>
              </div>
            )}
          </div>
        ))}
        {searched && found.length === 0 && <p className="hub-empty">No group with that name. They may not be on VWB yet, or they keep their page private.</p>}
        {note && <p className="hub-note" role="status">{note}</p>}
      </section>

      {active.length > 0 && (
        <section className="cal-box" aria-labelledby="oc-chat">
          <h2 id="oc-chat">Start a Campfire</h2>
          <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
            A Campfire is a private, encrypted chat for the Heads and organizers of {orgName || 'your group'} and the groups you pick. When someone becomes an organizer they are added, and when they stop, they are removed.
          </p>
          <form onSubmit={startChat} noValidate>
            <label htmlFor="oc-chat-name" className="cal-sub" style={{ display: 'block' }}>Name for the Campfire</label>
            <input id="oc-chat-name" type="text" maxLength={80} autoComplete="off" value={chatName} placeholder="For example, Fall food drive" onChange={(e) => { setChatName(e.target.value); setChatNote('') }} style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, fontSize: 16, margin: '0.25rem 0 0.75rem' }} />
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 0.75rem' }}>
              <legend className="cal-sub">Groups to include</legend>
              {active.map((l) => (
                <label key={l.other_id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44 }}>
                  <input type="checkbox" checked={picked.includes(l.other_id)} onChange={() => { togglePick(l.other_id); setChatNote('') }} style={{ width: 22, height: 22 }} />
                  <span>{l.other_name}</span>
                </label>
              ))}
            </fieldset>
            {chatNote && <p role="alert" className="groups-error">{chatNote}</p>}
            <button type="submit" className="btn btn-primary btn-full" style={{ minHeight: '48px' }} disabled={busy === 'chat'}>{busy === 'chat' ? 'Starting...' : 'Start a Campfire'}</button>
          </form>
        </section>
      )}
    </>
  )
}
