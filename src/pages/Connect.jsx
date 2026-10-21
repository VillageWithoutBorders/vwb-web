import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { setReturnTo, clearReturnTo } from '../utils/returnTo'

// Where a member's QR code lands: /connect/:code (vwb-member-qr.sql).
// Signed out: nothing about the person is shown, not even a name. They sign
// up or log in and come straight back here (the sign-up steps, Guidelines and
// Find your village come first; see SetupGate in App.jsx).
// Signed in: the person's name and a Connect button. Connecting counts as a
// vouch, and a chat opens when you can both message.
export default function Connect() {
  const { code } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(null)
  const [state, setState] = useState('checking') // checking | ready | notfound | self | connecting | done | error
  const [done, setDone] = useState(null) // { result, chatId, otherId }

  useEffect(() => {
    if (authLoading) return
    if (!user) { setReturnTo('/connect/' + code); setState('ready'); return }
    clearReturnTo()
    let alive = true
    supabase.rpc('connect_code_preview', { p_code: code }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('connect_code_preview failed:', error); setState('error'); return }
      const row = Array.isArray(data) ? data[0] : data
      if (!row) { setState('notfound'); return }
      setPreview(row)
      setState(row.is_me ? 'self' : 'ready')
    })
    return () => { alive = false }
  }, [authLoading, user, code])

  async function connect() {
    setState('connecting')
    const { data, error } = await supabase.rpc('connect_by_code', { p_code: code })
    if (error) { console.error('connect_by_code failed:', error); setState('error'); return }
    const row = Array.isArray(data) ? data[0] : data
    if (!row || row.result === 'notfound') { setState('notfound'); return }
    if (row.result === 'self') { setState('self'); return }
    if (row.result === 'limit') { setDone({ result: 'limit' }); setState('done'); return }
    setDone({ result: row.result, chatId: row.chat_id, otherId: row.other_id })
    setState('done')
  }

  function go(path) {
    setReturnTo('/connect/' + code)
    navigate(path)
  }

  if (authLoading) return null
  const name = preview?.display_name || 'this neighbor'

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Village Without Borders</h1>
          <p className="login-subtitle">Neighbors helping neighbors</p>
        </div>

        {state === 'checking' && <p className="groups-note" role="status">Checking the code...</p>}

        {!user && state === 'ready' && (
          <div className="login-form">
            <h2>A neighbor wants to connect with you</h2>
            <p className="groups-note">Make a free account, then you will come right back here to connect. Accounts are for adults (18+).</p>
            <button type="button" className="btn btn-primary btn-full" onClick={() => go('/login?mode=signup')}>Make an account</button>
            <button type="button" className="btn btn-outline btn-full connect-gap" onClick={() => go('/login')}>I already have an account</button>
          </div>
        )}

        {user && state === 'notfound' && (
          <div className="login-form">
            <p className="form-error" role="alert">This code is not working. It may be an old one. Ask your neighbor to show their code again.</p>
            <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/', { replace: true })}>Go to the app</button>
          </div>
        )}

        {user && state === 'self' && (
          <div className="login-form">
            <p className="groups-note">This is your own code. Show it to a neighbor so they can scan it.</p>
            <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/my-code', { replace: true })}>See my code</button>
          </div>
        )}

        {user && preview && !preview.is_me && (state === 'ready' || state === 'connecting' || state === 'error') && (
          <div className="login-form">
            <p className="connect-letter" aria-hidden="true">{(name.trim().charAt(0) || '?').toUpperCase()}</p>
            <h2 className="connect-name">{name}</h2>
            {preview.already_connected
              ? <p className="groups-note">You are already connected.</p>
              : <p className="groups-note">Did you meet {name} in person? Connecting adds you to each other's Connections and counts as a vouch that you know each other.</p>}
            {state === 'error' && <p className="form-error" role="alert">Something went wrong. Check your connection and try again.</p>}
            <button type="button" className="btn btn-primary btn-full" onClick={connect} disabled={state === 'connecting'}>
              {state === 'connecting' ? 'Connecting...' : preview.already_connected ? 'Open our connection' : 'Yes, connect'}
            </button>
            <button type="button" className="btn btn-outline btn-full connect-gap" onClick={() => navigate('/', { replace: true })}>Not now</button>
          </div>
        )}

        {user && state === 'error' && !preview && (
          <div className="login-form">
            <p className="form-error" role="alert">We could not check this code. Check your connection and try again.</p>
            <button type="button" className="btn btn-outline btn-full" onClick={() => window.location.reload()}>Try again</button>
          </div>
        )}

        {state === 'done' && done && (
          <div className="login-form" role="status">
            {done.result === 'limit' && <p className="groups-note">You made a lot of connections today. Try again tomorrow.</p>}
            {done.result !== 'limit' && <h2>{done.result === 'already' ? 'You are connected' : 'You are connected!'}</h2>}
            {done.result !== 'limit' && done.chatId && <p className="groups-note">Say hi to {name}. Your chat is ready.</p>}
            {done.result !== 'limit' && !done.chatId && <p className="groups-note">You can message each other once one of you has been vouched for by someone else or finished a task with someone.</p>}
            {done.chatId
              ? <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/conversation/' + done.chatId, { replace: true })}>Say hi</button>
              : done.otherId && <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/u/' + done.otherId, { replace: true })}>See {name}'s profile</button>}
            <button type="button" className="btn btn-outline btn-full connect-gap" onClick={() => navigate('/connections', { replace: true })}>My connections</button>
          </div>
        )}
      </div>
    </div>
  )
}
