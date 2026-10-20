import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'

// Asking to become an admin for your village (vwb-admin-recruiting.sql).
// You can ask for a village that has no admin yet (vwb-roles-step5.sql).
// Shows what is ready and what isn't, then the request form.

const PROMISES = [
  'I will only look at what I need to help someone.',
  'I will never try to read private chats or messages.',
  "I will keep people's information to myself.",
  'I will ask another admin when I am not sure.',
  'I will step down if I can no longer take part.',
]

export default function BecomeAdmin() {
  const { profile, isAdmin } = useAuth()
  const [checks, setChecks] = useState(null)
  const [villages, setVillages] = useState(null)
  const [waiting, setWaiting] = useState(false)
  const [village, setVillage] = useState('')
  const [why, setWhy] = useState('')
  const [time, setTime] = useState('')
  const [agreed, setAgreed] = useState(PROMISES.map(() => false))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!profile?.user_id) return
    supabase.rpc('admin_ready_check').then(({ data, error: e }) => {
      if (e) { console.error('[BecomeAdmin] ready check failed:', e); setChecks([]); return }
      setChecks(data || [])
    })
    supabase.rpc('villages_needing_admin').then(({ data, error: e }) => {
      if (e) { console.error('[BecomeAdmin] villages failed:', e); setVillages([]); return }
      setVillages(data || [])
      if (data?.length === 1) setVillage(data[0].village_id)
    })
    supabase.from('admin_applications').select('id').eq('user_id', profile.user_id).in('status', ['pending', 'invited']).limit(1)
      .then(({ data, error: e }) => {
        if (e) { console.error('[BecomeAdmin] status failed:', e); return }
        setWaiting((data || []).length > 0)
      })
  }, [profile?.user_id])

  const ready = checks && checks.length > 0 && checks.every((c) => c.ok)

  async function send(e) {
    e.preventDefault()
    setError('')
    if (!village) { setError('Pick your village.'); return }
    if (why.trim().length < 20) { setError('Say a little more about why (a sentence or two).'); return }
    if (!agreed.every(Boolean)) { setError('Check each promise to go on.'); return }
    setBusy(true)
    const { error: e2 } = await supabase.rpc('admin_apply', { p_village: village, p_why: why.trim(), p_time: time.trim(), p_agree: true })
    setBusy(false)
    if (e2) { console.error('[BecomeAdmin] apply failed:', e2); setError(e2.message || "That didn't send. Try again."); return }
    setSent(true)
  }

  if (isAdmin) {
    return (
      <div className="become-admin">
        <BackLink fallback="/profile" fallbackLabel="Profile" />
        <h1>You are already an admin</h1>
        <p><Link to="/admin">Open admin tools</Link></p>
      </div>
    )
  }

  return (
    <div className="become-admin">
      <BackLink fallback="/profile" fallbackLabel="Profile" />
      <h1>Become an admin for your village</h1>
      <p>Admins look after their village: they answer reports, welcome new people, and step in when someone needs help or safety. Every new admin starts with 30 days of learning, with a mentor admin beside them.</p>
      <p><Link to="/admin-guide">Read the Admin Guide</Link> to see what the work is like before you ask.</p>

      <section className="admin-role-box" aria-labelledby="readyTitle">
        <h2 id="readyTitle" className="admin-role-title">Are you ready to ask?</h2>
        {checks === null ? <p role="status">Checking...</p> : (
          <ul className="admin-ready-list">
            {checks.map((c) => (
              <li key={c.item} className={c.ok ? 'ok' : 'no'}><strong>{c.ok ? 'Yes' : 'Not yet'}:</strong> {c.label} ({c.detail})</li>
            ))}
          </ul>
        )}
        {checks && !ready && <p>Keep helping your neighbors. When every line says Yes, you can ask here.</p>}
      </section>

      {sent || waiting ? (
        <p className="admin-scope-note" role="status">Your request is waiting. Admins will look at it soon, and you'll get an alert when they decide. Thank you for offering.</p>
      ) : villages === null ? <p role="status">Loading...</p> : villages.length === 0 ? (
        <p className="admin-scope-note">Every village you belong to already has a local admin. Thank you for offering. You can keep helping as a Hope Ambassador.</p>
      ) : ready && (
        <form onSubmit={send} noValidate>
          <label>
            Which village would you look after?
            <select value={village} onChange={(e) => setVillage(e.target.value)}>
              <option value="">Pick one</option>
              {villages.map((v) => <option key={v.village_id} value={v.village_id}>{v.village_name + ((v.admin_count || 0) >= 1 ? ' (has 1 admin, needs a second)' : ' (no admin yet)')}</option>)}
            </select>
          </label>
          <label>
            Why do you want to do this?
            <textarea rows={4} maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} />
          </label>
          <label>
            How much time can you give? (for example, "an hour most evenings")
            <input type="text" maxLength={200} autoComplete="off" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <fieldset className="admin-village-set">
            <legend>Admin promises</legend>
            <p>These come from the <Link to="/admin-guide#promises">Admin Guide</Link>.</p>
            {PROMISES.map((p, i) => (
              <label key={p} className="promise">
                <input type="checkbox" checked={agreed[i]} onChange={() => setAgreed((a) => a.map((x, j) => (j === i ? !x : x)))} />
                <span>{p}</span>
              </label>
            ))}
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Sending...' : 'Send my request'}</button>
          <p>The founder, or two admins, will decide. Your first 30 days you'll cover your village only, with a mentor.</p>
        </form>
      )}
    </div>
  )
}
