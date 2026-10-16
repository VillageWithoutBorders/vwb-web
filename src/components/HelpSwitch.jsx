import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// The three parts of the Help tab: what neighbors near you need (SkillShare),
// your own requests, offers, and tasks, and the resource library (Find help).
// Mine shows a count when neighbors offered to help and are waiting for your yes.
export default function HelpSwitch() {
  const { user } = useAuth()
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      const { data: reqs, error } = await supabase.from('help_requests').select('id').eq('requester_id', user.id).eq('status', 'open')
      if (error) { console.error('Failed to load your open requests:', error); return }
      const ids = (reqs || []).map((r) => r.id)
      if (!ids.length) { if (alive) setWaiting(0); return }
      const { count, error: cErr } = await supabase.from('skill_matches').select('id', { count: 'exact', head: true }).in('request_id', ids).is('accepted', null)
      if (cErr) { console.error('Failed to count offers to help:', cErr); return }
      if (alive) setWaiting(count || 0)
    })()
    return () => { alive = false }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <nav className="help-switch" aria-label="Help">
      <NavLink to="/skillshare" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>Near you</NavLink>
      <NavLink to={waiting ? '/tasks?tab=requests' : '/tasks'} className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')} aria-label={waiting ? 'Mine, ' + waiting + (waiting === 1 ? ' neighbor offered to help' : ' neighbors offered to help') : undefined}>
        Mine{waiting > 0 && <span className="help-switch-count" aria-hidden="true">{waiting > 9 ? '9+' : waiting}</span>}
      </NavLink>
      <NavLink to="/community/resources" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>Resources</NavLink>
    </nav>
  )
}
