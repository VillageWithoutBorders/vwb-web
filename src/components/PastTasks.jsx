import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loadMyTaskOverview, urgencyLabel } from '../utils/myTasks'
import Icon from './Icon'
import { useT, getLang } from '../utils/lang'

// Finished tasks, kept in your Profile. Tap one to see it, and vouch, on the Tasks page.
export default function PastTasks() {
  const t = useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    let alive = true
    loadMyTaskOverview(user?.id).then((d) => { if (alive) setRows(d.archived) })
      .catch((err) => { console.error('Failed to load past tasks:', err); if (alive) setRows([]) })
    return () => { alive = false }
  }, [user?.id])

  useEffect(() => {
    // Opened from Home with #past-tasks: scroll here once it has loaded.
    if (rows && window.location.hash === '#past-tasks') document.getElementById('past-tasks')?.scrollIntoView({ block: 'start' })
  }, [rows])

  const list = rows ? (all ? rows : rows.slice(0, 10)) : []

  return (
    <section id="past-tasks" className="home-tasks" aria-labelledby="past-tasks-h" style={{ marginTop: '1rem' }}>
      <div className="home-tasks-head"><h2 id="past-tasks-h"><Icon name="box" /> {t('Past tasks')}{rows ? ' (' + rows.length + ')' : ''}</h2></div>
      <p className="home-tasks-empty" style={{ marginTop: 0 }}>{t('Tasks move here once you have both said how it went. Only you can see this list.')}</p>
      {!rows && <p className="home-tasks-empty">{t('Loading...')}</p>}
      {rows && rows.length === 0 && <p className="home-tasks-empty">{t('Nothing finished yet.')}</p>}
      {list.length > 0 && (
        <ul className="home-tasks-list">
          {list.map((item) => (
            <li key={item.key}>
              <button type="button" className="home-task" onClick={() => navigate('/tasks?tab=archived')}>
                <span className="home-task-title">{item.title}</span>
                <span className="home-task-meta">
                  {item.role === 'helping' ? t('You helped {name}', { name: item.who }) : item.who ? t('Helped by {name}', { name: item.who }) : t('Your request')}
                  {' · '}{item.urgency ? t(urgencyLabel(item.urgency)) + ' · ' : ''}
                  {new Date(item.created_at).toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 10 && (
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px', marginTop: '0.5rem' }} onClick={() => setAll(!all)}>{all ? t('Show fewer') : t('Show all {n}', { n: rows.length })}</button>
      )}
    </section>
  )
}
