import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { setReturnTo, clearReturnTo } from '../utils/returnTo'
import { useT } from '../utils/lang'

// Round E part 2 (Nov 10): where a group's invite link lands: /join/:token.
// Not signed in: the group's name and welcome line only if the group is public,
// then Log in or sign up, and they come straight back here.
// Signed in: Join (or Ask to join). New accounts skip the app tour and start
// with Quiet alerts (join_org_by_link does that), then land on the group.
export default function JoinOrgLink() {
  const { token } = useParams()
  const { user, loading: authLoading, refreshProfile, refreshOrganizations } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [preview, setPreview] = useState(null)
  const [state, setState] = useState('checking') // checking | ready | notfound | joining | asked | wait | error
  const okToken = /^[0-9a-f-]{36}$/i.test(token || '')

  useEffect(() => {
    if (authLoading) return
    if (!okToken) { setState('notfound'); return }
    let alive = true
    if (!user) {
      setReturnTo('/join/' + token)
      supabase.rpc('org_invite_public_preview', { p_token: token }).then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('Invite preview failed:', error)
        setPreview((Array.isArray(data) ? data[0] : data) || null)
        setState('ready')
      })
      return () => { alive = false }
    }
    clearReturnTo()
    supabase.rpc('org_invite_preview', { p_token: token }).then(({ data, error }) => {
      if (!alive) return
      if (error) { console.error('Invite preview failed:', error); setState('notfound'); return }
      const row = Array.isArray(data) ? data[0] : data
      if (!row) { setState('notfound'); return }
      if (row.i_am_member) { navigate('/orgs/' + row.org_id, { replace: true }); return }
      setPreview(row)
      setState('ready')
    })
    return () => { alive = false }
  }, [authLoading, user, token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function join() {
    setState('joining')
    const { data, error } = await supabase.rpc('join_org_by_link', { p_token: token })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) { console.error('Join by link failed:', error); setState('error'); return }
    await Promise.all([refreshProfile && refreshProfile(), refreshOrganizations && refreshOrganizations()])
    if (row.status === 'member') { navigate('/orgs/' + row.org_id + '?welcome=1', { replace: true }); return }
    if (row.status === 'missing') { setState('notfound'); return }
    setState(row.status) // asked | wait
  }

  const name = preview && preview.name
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Village Without Borders</h1>
          <p className="login-subtitle">{name ? t('You are invited to {name}', { name }) : t('You are invited to a group')}</p>
        </div>
        {state === 'checking' && <p className="groups-note" role="status">{t('Checking the link...')}</p>}
        {preview && preview.welcome && <p className="groups-card-desc">{preview.welcome}.</p>}

        {!user && state === 'ready' && <>
          <p className="groups-note">{t('Log in or make a free account to join. It takes a minute. You can set up the rest later.')}</p>
          <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/login')}>{t('Log in or sign up')}</button>
        </>}

        {state === 'notfound' && <>
          <p className="form-error" role="alert">{t("This link isn't working anymore. Ask the group for a new one.")}</p>
          <button type="button" className="btn btn-outline btn-full" onClick={() => navigate('/')}>{t('Go to the app')}</button>
        </>}

        {user && preview && (state === 'ready' || state === 'joining' || state === 'error') && <>
          <p className="groups-note">{Number(preview.member_count) === 1 ? t('1 member') : t('{n} members', { n: preview.member_count })}.{' '}
            {preview.joins_right_away ? t('Tap Join and you are in.') : t('The group’s leaders will see your name and decide.')}</p>
          {state === 'error' && <p className="form-error" role="alert">{t('Could not join. Try again, or ask the group for a new link.')}</p>}
          <button type="button" className="btn btn-primary btn-full" onClick={join} disabled={state === 'joining'}>
            {state === 'joining' ? t('Joining...') : preview.joins_right_away ? t('Join {name}', { name }) : t('Ask to join {name}', { name })}
          </button>
          <button type="button" className="btn btn-outline btn-full" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/')}>{t('Not now')}</button>
        </>}

        {(state === 'asked' || state === 'wait') && preview && <>
          <p className="groups-note" role="status">{state === 'asked'
            ? t('You asked to join {name}. You will get an alert when they add you.', { name })
            : t('You already asked to join {name} this week. They will see it.', { name })}</p>
          <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/orgs/' + preview.org_id)}>{t('See {name}', { name })}</button>
        </>}
      </div>
    </div>
  )
}
