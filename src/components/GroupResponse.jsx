import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

// "Ready to respond" on an emergency response Group's page.
// A group can exist without approval, but it is only called to emergencies
// after a Hope Ambassador or VWB admin outside the group says yes.

function day(iso) {
  return iso ? new Date(iso).toLocaleDateString([], { month: 'long', day: 'numeric' }) : ''
}

export default function GroupResponse({ orgId, orgName, isKeeper, villageCount, onChanged }) {
  const t = useT()
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [decideNote, setDecideNote] = useState('')

  async function load() {
    const { data, error } = await supabase.rpc('group_response_info', { p_org: orgId })
    if (error) console.error('Failed to load response status:', error)
    setInfo((data && data[0]) || { status: 'none' })
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function ask() {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('ask_group_response_approval', { p_org: orgId })
    setBusy(false)
    if (error) { console.error('Failed to ask for approval:', error); setMsg(t("We couldn't send that. Try again.")); return }
    if (data === 'asked' || data === 'already') setMsg(t('Sent. Hope Ambassadors and VWB admins will look at your crew.'))
    else if (data === 'approved') setMsg(t('Your crew is already approved.'))
    else setMsg(t("We couldn't send that right now."))
    load(); onChanged?.()
  }

  async function decide(yes) {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('decide_group_response', { p_org: orgId, p_approve: yes, p_note: decideNote.trim() || null })
    setBusy(false)
    if (error || !['approved', 'declined'].includes(data)) { console.error('Failed to decide:', error || data); setMsg(data === 'inside' ? t('You are in this crew, so someone else has to decide.') : data === 'notlocal' ? t("This group doesn't cover your villages. A Hope Ambassador there or a VWB admin can decide.") : t("We couldn't save that. Try again.")); return }
    setMsg(yes ? t('{name} can now be called to emergencies. The crew was told.', { name: orgName }) : t('Saved. The crew was told it is not approved yet.'))
    setDecideNote('')
    load(); onChanged?.()
  }

  if (!info) return <p role="status">{t('Loading...')}</p>
  const s = info.status

  return (
    <div>
      {s === 'approved' && <div className="vs-item gr-ok"><b>{t('Approved to respond')}</b><small>{t('Since {date}.', { date: day(info.decided_at) })} {t('When an emergency is verified in the villages this crew covers, its keepers are asked to help.')}</small></div>}
      {s === 'asked' && <div className="vs-item"><b>{t('Waiting for approval')}</b><small>{t('Asked {date}.', { date: day(info.asked_at) })} {t('A Hope Ambassador or VWB admin outside the crew will decide. You get an alert either way. Meanwhile, keep adding members and what you bring.')}</small></div>}
      {(s === 'none' || s === 'declined') && <div className="vs-item"><b>{t('Not called to emergencies yet')}</b><small>{t('{name} can meet, chat, and plan now. To be called when an emergency is verified nearby, a keeper asks for approval.', { name: orgName })}</small></div>}
      {s === 'declined' && isKeeper && info.note && <p className="vs-note">{t('Note from the reviewer: {note}', { note: info.note })}</p>}

      {isKeeper && (s === 'none' || s === 'declined') && <>
        <p className="vs-note">{villageCount ? t('Before you ask: pick the villages you cover (done), and have members list what they bring.') : t('Before you ask: pick the villages you cover, and have members list what they bring.')}</p>
        <button type="button" className="btn btn-primary btn-full" onClick={ask} disabled={busy}>{busy ? t('Sending...') : s === 'declined' ? t('Ask again') : t('Ask to be approved')}</button>
      </>}

      {info.i_can_decide && (s === 'asked' || s === 'approved') && (
        <section className="cal-box" aria-labelledby="gr-decide">
          <h3 id="gr-decide">{s === 'asked' ? t('You can decide') : t('Take back approval')}</h3>
          <p className="cal-sub">{t('You are a Hope Ambassador or VWB admin and not in this crew. Check that it is real and local before saying yes.')}</p>
          <label htmlFor="gr-note" className="gg-label">{t('Note to the crew (optional)')}</label>
          <textarea id="gr-note" rows={2} maxLength={300} value={decideNote} onChange={(e) => setDecideNote(e.target.value)} />
          {s === 'asked' && <button type="button" className="btn btn-primary btn-full" onClick={() => decide(true)} disabled={busy}>{t('Approve to respond')}</button>}
          <button type="button" className="btn btn-outline btn-full" onClick={() => decide(false)} disabled={busy}>{s === 'asked' ? t('Not yet') : t('Take back approval')}</button>
        </section>
      )}

      {msg && <p className="vs-note" role="status">{msg}</p>}

      {/* Past responses: left out until there is a list to show (Nov 3, flow map). */}
    </div>
  )
}
