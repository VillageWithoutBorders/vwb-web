import { useEffect, useState } from 'react'
import { NEW_ACCOUNT_NOTE } from '../utils/newAccount'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { setReturnTo, clearReturnTo } from '../utils/returnTo'

// Where a group's join link lands: /groups/join/:token.
// Logged out: nothing about the group is shown (not even its name). They
// log in or sign up, then come straight back here.
// Logged in: the group's name and size, and a Join button.
export default function JoinGroup() {
  const { token } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [preview, setPreview] = useState(null)
  const [state, setState] = useState('checking') // checking | ready | notfound | joining | error

  useEffect(() => {
    if (authLoading) return
    if (!user) { setReturnTo(location.pathname); setState('ready'); return }
    clearReturnTo()
    supabase.rpc('community_group_link_preview', { p_token: token }).then(({ data, error }) => {
      if (error) { console.error('Group link preview failed:', error); setState('notfound'); return }
      const row = Array.isArray(data) ? data[0] : data
      if (!row) { setState('notfound'); return }
      setPreview(row)
      setState('ready')
    })
  }, [authLoading, user, token])

  async function join() {
    setState('joining')
    const { data: groupId, error } = await supabase.rpc('join_community_group_by_link', { p_token: token })
    if (error && /New accounts can/i.test(error.message || '')) { setState('newaccount'); return }
    if (error || !groupId) { console.error('Join by link failed:', error); setState('error'); return }
    navigate('/groups/' + groupId, { replace: true })
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Village Without Borders</h1>
          <p className="login-subtitle">Join a chat</p>
        </div>

        {state === 'checking' && <p className="groups-note">Checking the link...</p>}

        {!user && state === 'ready' && (
          <>
            <p className="groups-note">Someone shared a private chat with you. Log in or make a free account to see it.</p>
            <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/login')}>Log in or sign up</button>
          </>
        )}

        {user && state === 'notfound' && (
          <>
            <p className="form-error" role="alert">This link isn't working anymore. Ask someone in the chat for a new one.</p>
            <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/groups')}>Go to my chats</button>
          </>
        )}

        {user && preview && (state === 'ready' || state === 'joining' || state === 'error' || state === 'newaccount') && (
          <>
            <h2 className="groups-card-title">{preview.name}</h2>
            {preview.description && <p className="groups-card-desc">{preview.description}</p>}
            <p className="groups-note">{preview.member_count} {Number(preview.member_count) === 1 ? 'member' : 'members'}. Its board is private to members. A member will need to let you in after you tap Join.</p>
            {state === 'error' && <p className="form-error" role="alert">Could not join. The link may have just been turned off. Try again, or ask for a new link.</p>}
            {state === 'newaccount' && <p className="form-error" role="alert">{NEW_ACCOUNT_NOTE} You can also ask someone in the group to invite you by name.</p>}
            <button type="button" className="btn btn-primary btn-full" onClick={join} disabled={state === 'joining'}>{state === 'joining' ? 'Joining...' : 'Ask to join'}</button>
            <button type="button" className="btn btn-outline btn-full" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/')}>Not now</button>
          </>
        )}
      </div>
    </div>
  )
}
