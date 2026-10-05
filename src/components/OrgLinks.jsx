import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { CalendarEventList } from './CalendarParts'
import QrShare from './QrShare'

// Council links on an organization page.
// Everyone sees a council's list of locals (names only).
// Organizers also get a small sheet to ask, accept, decline, or end links.

const DEFAULT_LABEL = 'Community Connection'

// part: 'public' = the list and council events anyone can see (org page),
//       'manage' = the organizer's link controls (organization dashboard),
//       'all' = both.
export default function OrgLinks({ org, canManage, events, onChanged, part = 'all' }) {
  const label = org.affiliate_label || DEFAULT_LABEL
  const [locals, setLocals] = useState([])
  const [links, setLinks] = useState([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [confirmEnd, setConfirmEnd] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [councils, setCouncils] = useState([])
  const [labelText, setLabelText] = useState(org.affiliate_label || '')
  const [inviteNote, setInviteNote] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  async function load() {
    if (org.is_umbrella) {
      const { data, error } = await supabase.rpc('list_affiliates', { p_umbrella: org.id })
      if (error) console.error('Failed to load locals:', error)
      setLocals(data || [])
    } else {
      setLocals([])
    }
    if (canManage) {
      const { data, error } = await supabase.rpc('my_org_links', { p_org: org.id })
      if (error) console.error('Failed to load links:', error)
      setLinks(data || [])
    }
  }

  useEffect(() => { load() }, [org.id, org.is_umbrella, canManage]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canManage || org.is_umbrella) return
    supabase.from('organizations').select('id, name').eq('is_umbrella', true).eq('approved', true).neq('id', org.id).order('name')
      .then(({ data }) => setCouncils(data || []))
  }, [canManage, org.id, org.is_umbrella])

  useEffect(() => {
    if (!canManage || !org.is_umbrella) return
    const term = q.trim()
    if (term.length < 2) { setFound([]); return }
    let alive = true
    const t = setTimeout(async () => {
      const { data } = await supabase.from('organizations').select('id, name')
        .eq('approved', true).eq('is_umbrella', false).neq('id', org.id)
        .ilike('name', '%' + term.replace(/[%_,]/g, ' ') + '%').order('name').limit(8)
      if (alive) setFound(data || [])
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q, canManage, org.id, org.is_umbrella])

  async function run(key, fn, okText) {
    setBusy(key); setNote('')
    const { error } = await fn()
    setBusy('')
    if (error) {
      console.error('Link action failed:', error)
      setNote(error.message && error.code && error.code !== 'PGRST202' ? error.message : "We couldn't do that. Try again.")
      return false
    }
    setNote(okText)
    setConfirmEnd('')
    await load()
    if (onChanged) onChanged()
    return true
  }

  const ask = (umbrella, affiliate, okText) => run('ask-' + umbrella + affiliate, () => supabase.rpc('request_affiliation', { p_umbrella: umbrella, p_affiliate: affiliate }), okText)
  const answer = (l, accept) => run('ans-' + l.umbrella_id + l.affiliate_id, () => supabase.rpc('respond_affiliation', { p_umbrella: l.umbrella_id, p_affiliate: l.affiliate_id, p_accept: accept }), accept ? 'Linked.' : 'Request declined.')
  const end = (l, okText) => run('end-' + l.umbrella_id + l.affiliate_id, () => supabase.rpc('end_affiliation', { p_umbrella: l.umbrella_id, p_affiliate: l.affiliate_id }), okText)
  async function makeInvite(e) {
    e.preventDefault()
    setBusy('invite'); setNote(''); setCopied(false)
    const { data, error } = await supabase.rpc('create_council_invitation', { p_umbrella: org.id, p_note: inviteNote })
    setBusy('')
    if (error || typeof data !== 'string') {
      console.error('Failed to make invite link:', error)
      setNote(error && error.message && error.code && error.code !== 'PGRST202' ? error.message : "We couldn't make the link. Try again.")
      return
    }
    setInviteUrl(window.location.origin + '/join-org?token=' + data)
    setInviteNote('')
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
    } catch {
      setNote('Press and hold the link to copy it.')
    }
  }

  const saveLabel = (e) => { e.preventDefault(); run('label', () => supabase.rpc('set_affiliate_label', { p_org: org.id, p_label: labelText }), 'Saved.') }

  const localIds = new Set(locals.map((l) => l.id))
  const councilEvents = (events || [])
    .filter((e) => (localIds.has(e.organization_id) || e.organization_id === org.id) && e.status !== 'cancelled' && new Date(e.ends_at || e.starts_at).getTime() >= Date.now())
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  const linkedIds = new Set(links.map((l) => (org.is_umbrella ? l.affiliate_id : l.umbrella_id)))
  const showSheet = part !== 'public' && canManage && (org.is_umbrella || councils.length > 0 || links.length > 0)

  return (
    <>
      {part !== 'manage' && org.is_umbrella && (
        <section className="hub-section" aria-labelledby="org-locals">
          <div className="hub-section-head"><h2 id="org-locals">{label}</h2></div>
          {locals.length === 0 && <p className="hub-empty">No organizations are linked yet.</p>}
          {locals.map((l) => (
            <Link key={l.id} to={'/orgs/' + l.id} className="cal-card hub-resource">
              <span className="cal-card-title">{l.name}</span>
            </Link>
          ))}
        </section>
      )}

      {part !== 'manage' && org.is_umbrella && locals.length > 0 && (
        <section className="hub-section" aria-labelledby="org-council-events">
          <div className="hub-section-head"><h2 id="org-council-events">Coming up across the council</h2></div>
          <CalendarEventList events={councilEvents} emptyText="No upcoming events yet from linked organizations." />
        </section>
      )}

      {showSheet && (
        <section className="cal-box" aria-labelledby="org-links">
          <h2 id="org-links">{org.is_umbrella ? 'Your ' + label + ' list' : 'Link with a council'}</h2>
          <p className="cal-sub" style={{ marginBottom: '0.75rem' }}>
            {org.is_umbrella
              ? 'A link goes both ways. Both organizations say yes, and either can end it any time. A council cannot see your members or your private events.'
              : 'A link is a handshake, not a chain of command. Both organizations say yes, and either can end it any time. A council cannot see your members or your private events.'}
          </p>

          {links.map((l) => {
            const other = org.is_umbrella ? l.affiliate_name : l.umbrella_name
            const key = l.umbrella_id + l.affiliate_id
            const mineSide = org.is_umbrella ? 'umbrella' : 'affiliate'
            const needsMyAnswer = l.status === 'pending' && l.asked_by_side !== mineSide
            return (
              <div key={key} className="cal-card" style={{ marginBottom: '0.5rem' }}>
                <span className="cal-card-title">{other}</span>
                <span className="cal-card-meta">
                  {l.status === 'active' ? 'Linked' : needsMyAnswer ? 'Asked to link with you' : 'Waiting for them to answer'}
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
                    <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => setConfirmEnd(key)}>End link</button>
                  )}
                  {l.status === 'active' && confirmEnd === key && (
                    <>
                      <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => end(l, 'Link ended.')}>Yes, end the link</button>
                      <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => setConfirmEnd('')}>Keep it</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {org.is_umbrella && (
            <>
              <label htmlFor="org-link-search" className="cal-sub" style={{ display: 'block', marginTop: '0.75rem' }}>Invite a local organization by name</label>
              <div className="hub-search">
                <input id="org-link-search" type="text" autoComplete="off" placeholder="Start typing an organization name" value={q} onChange={(e) => { setQ(e.target.value); setNote('') }} />
              </div>
              {found.filter((f) => !linkedIds.has(f.id)).map((f) => (
                <div key={f.id} className="cal-card" style={{ marginTop: '0.5rem' }}>
                  <span className="cal-card-title">{f.name}</span>
                  <div className="cal-actions" style={{ marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} disabled={!!busy} onClick={async () => { if (await ask(org.id, f.id, 'Invite sent to ' + f.name + '.')) { setQ(''); setFound([]) } }}>Invite</button>
                  </div>
                </div>
              ))}
              {q.trim().length >= 2 && found.length === 0 && <p className="hub-empty">No organization with that name.</p>}

              <form onSubmit={makeInvite} style={{ marginTop: '1.25rem' }}>
                <p className="cal-sub" style={{ marginBottom: '0.25rem' }}>Is the organization not on VWB yet? Make a link and send it yourself. It works once.</p>
                <label htmlFor="org-invite-note" className="cal-sub" style={{ display: 'block' }}>Short note for them (optional)</label>
                <div className="hub-search">
                  <input id="org-invite-note" type="text" maxLength={500} placeholder="Welcome, we would love to have you" value={inviteNote} onChange={(e) => setInviteNote(e.target.value)} />
                  <button type="submit" className="btn btn-primary" disabled={!!busy}>{busy === 'invite' ? 'Making...' : 'Make link'}</button>
                </div>
              </form>
              {inviteUrl && (
                <div className="cal-card" style={{ marginTop: '0.5rem' }}>
                  <span className="cal-card-meta" style={{ wordBreak: 'break-all' }}>{inviteUrl}</span>
                  <div className="cal-actions" style={{ marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} onClick={copyInvite}>{copied ? 'Copied' : 'Copy link'}</button>
                  </div>
                  <QrShare url={inviteUrl} title="Invite link" hint="They scan this to open your invite on their phone." />
                </div>
              )}

              <form onSubmit={saveLabel} style={{ marginTop: '1rem' }}>
                <label htmlFor="org-link-label" className="cal-sub" style={{ display: 'block' }}>Name for your list (up to 40 letters)</label>
                <div className="hub-search">
                  <input id="org-link-label" type="text" maxLength={40} placeholder={DEFAULT_LABEL} value={labelText} onChange={(e) => setLabelText(e.target.value)} />
                  <button type="submit" className="btn btn-primary" disabled={!!busy}>Save</button>
                </div>
              </form>
            </>
          )}

          {!org.is_umbrella && councils.filter((c) => !linkedIds.has(c.id)).length > 0 && (
            <>
              <p className="cal-sub" style={{ marginTop: '0.75rem' }}>Councils you can ask to join</p>
              {councils.filter((c) => !linkedIds.has(c.id)).map((c) => (
                <div key={c.id} className="cal-card" style={{ marginTop: '0.5rem' }}>
                  <span className="cal-card-title">{c.name}</span>
                  <div className="cal-actions" style={{ marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} disabled={!!busy} onClick={() => ask(c.id, org.id, 'Request sent to ' + c.name + '.')}>Ask to join</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {note && <p className="hub-note" role="status">{note}</p>}
        </section>
      )}
    </>
  )
}
