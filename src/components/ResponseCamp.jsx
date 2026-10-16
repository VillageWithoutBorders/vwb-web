import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Icon from './Icon'

// The Response Camp on an emergency event page.
// The camp chat opens by itself when the event is verified. Everyone signed up
// as a responder or coordinator is in it. Approved groups that cover the
// village are asked "Will your group take it on?" and a keeper answers here.

function day(iso) {
  return iso ? new Date(iso).toLocaleDateString([], { month: 'long', day: 'numeric' }) : ''
}

// part: 'chat' (the camp chat only), 'groups' (groups responding and the keeper question), or both.
export default function ResponseCamp({ eventId, verified, closed, refreshKey, part = 'all' }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const callFor = searchParams.get('call')
  const [camp, setCamp] = useState(null)
  const [groups, setGroups] = useState([])
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const callRef = useRef(null)

  async function load() {
    const [c, g] = await Promise.all([
      supabase.rpc('response_camp_info', { p_event: Number(eventId) }),
      supabase.rpc('event_groups', { p_event: Number(eventId) }),
    ])
    if (c.error) console.error('Failed to load the Response Camp:', c.error)
    if (g.error) console.error('Failed to load groups on this emergency:', g.error)
    setCamp((c.data && c.data[0]) || null)
    setGroups(g.data || [])
  }
  useEffect(() => { load() }, [eventId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a "Will your group take it on?" alert: bring the question into view.
  useEffect(() => {
    if (callFor && callRef.current) callRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [callFor, groups.length])

  async function answer(org, yes) {
    setBusy(org.org_id); setMsg('')
    const { data, error } = await supabase.rpc('answer_group_call', { p_event: Number(eventId), p_org: org.org_id, p_yes: yes })
    setBusy(null)
    if (error) { console.error('Failed to answer for the group:', error); setMsg("We couldn't save that. Try again."); return }
    if (data === 'responding') setMsg(org.name + ' is listed as responding. Its members were asked to sign up.')
    else if (data === 'declined') setMsg('Saved. ' + org.name + ' is not responding this time.')
    else if (data === 'closed') setMsg('This emergency is closed.')
    else if (data === 'notapproved') setMsg(org.name + ' needs approval to respond first.')
    else setMsg("We couldn't save that.")
    load()
  }

  if (!verified) {
    return (
      <section className="rc-box" aria-labelledby="rc-title">
        <h2 id="rc-title" className="rc-title"><Icon name="tent" /> Response Camp</h2>
        <p className="rc-note">A camp chat opens once this emergency is verified. Everyone who signs up to help joins it.</p>
      </section>
    )
  }

  const responding = groups.filter((g) => g.status === 'responding')
  const mine = groups.filter((g) => g.i_am_keeper)
  const campClosed = closed || (camp && !camp.camp_open)

  return (
    <section className="rc-box" aria-labelledby="rc-title">
      <h2 id="rc-title" className="rc-title"><Icon name="tent" /> {part === 'groups' ? 'Groups responding' : 'Response Camp' + (campClosed ? ', closed' : '')}</h2>

      {part !== 'groups' && (camp?.i_am_in && camp.board_id ? (
        <>
          <p className="rc-note">
            {campClosed
              ? 'This emergency is closed. You can read the camp chat until ' + day(camp.deletes_at) + '. Then it is deleted for good.'
              : (camp.member_count === 1 ? 'You are the first one here.' : camp.member_count + ' people helping are in the camp chat.') + ' Members only, not scrambled. Messages delete after 30 days.'}
          </p>
          <button type="button" className="btn btn-primary btn-full rc-btn" onClick={() => navigate('/campfire?board=' + camp.board_id)}>
            <Icon name="campfire" /> {campClosed ? 'Read the camp chat' : 'Open the camp chat'}
          </button>
        </>
      ) : campClosed ? (
        <p className="rc-note">This emergency is closed, so its camp chat is closed too.</p>
      ) : (
        <p className="rc-note">
          Everyone who taps I can help joins the camp chat{camp?.member_count ? ' (' + camp.member_count + ' so far)' : ''}. Neighbors who need help are not added. They check in on this page.
        </p>
      ))}

      {part === 'all' && <h3 className="rc-sub">Groups responding</h3>}
      {part !== 'chat' && (responding.length === 0
        ? <p className="rc-note">No group has taken this on yet.</p>
        : (
          <ul className="rc-groups">
            {responding.map((g) => (
              <li key={g.org_id}>
                <Link to={'/orgs/' + g.org_id} className="rc-group"><Icon name="tent" /> <span>{g.name}</span></Link>
              </li>
            ))}
          </ul>
        ))}

      {part !== 'chat' && !campClosed && mine.map((g) => {
        const asked = g.status === 'asked'
        const highlight = callFor === g.org_id
        return (
          <div key={g.org_id} ref={highlight ? callRef : null} className={'rc-call' + (highlight || asked ? ' rc-call-ask' : '')}>
            <p className="rc-call-q">
              {g.status === 'responding' ? g.name + ' is responding.'
                : g.status === 'declined' ? g.name + ' said not this time.'
                : 'Will ' + g.name + ' take it on?'}
            </p>
            <p className="rc-note">
              {g.status === 'responding' ? 'Members who have not signed up were asked to. You can step back if plans change.'
                : asked ? 'Your group covers this village. A yes lists your group here and asks your members to sign up.'
                : 'You keep this group. You can step in even if it was not asked.'}
            </p>
            <div className="rc-actions">
              {g.status !== 'responding' && (
                <button type="button" className="btn btn-primary rc-btn" disabled={busy === g.org_id} onClick={() => answer(g, true)}>
                  {busy === g.org_id ? 'Saving...' : 'Yes, we will take it on'}
                </button>
              )}
              {(g.status === 'responding' || asked) && (
                <button type="button" className="btn btn-outline rc-btn" disabled={busy === g.org_id} onClick={() => answer(g, false)}>
                  {g.status === 'responding' ? 'Step back' : 'Not this time'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {msg && <p className="rc-note" role="status">{msg}</p>}
    </section>
  )
}
