import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ROLE = { admin: 'Head', organizer: 'Organizer', member: 'Member' }

// The Organizations section of the Messages hub. Each organization a person
// belongs to, with only the tools their role in it allows. Heads and
// organizers get the dashboard and event posting; members get the page.
export default function HubOrganizations() {
  const { organizations } = useAuth()
  const navigate = useNavigate()
  const list = organizations || []

  return (
    <div className="cal-page" style={{ maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
      <p className="cal-sub" style={{ marginTop: 0 }}>Open your organization's page, dashboard, and events here. Its Campfire chats are under Cottage Chats &amp; Campfires.</p>
      {list.length === 0 && <p className="cal-empty">You are not in an organization yet.</p>}
      {list.map((o) => {
        const manages = o.role === 'admin' || o.role === 'organizer'
        return (
          <section key={o.id} className="cal-card" style={{ boxSizing: 'border-box', marginBottom: '0.75rem' }} aria-label={o.name}>
            <div className="cal-card-title">{o.name}</div>
            <div className="cal-card-meta" style={{ marginBottom: '0.5rem' }}>{ROLE[o.role] || 'Member'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => navigate('/orgs/' + o.id)}>Open page</button>
              {manages && <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => navigate('/orgs/' + o.id + '/dashboard')}>Dashboard</button>}
              {manages && <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => navigate('/calendar/new?org=' + o.id)}>Post an event</button>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
