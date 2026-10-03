import { useState } from 'react'

// Subscribe to a group's public events in a phone or computer calendar.
export default function CalendarSubscribe({ orgId, orgName = 'Village Without Borders' }) {
  const [copied, setCopied] = useState(false)
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return null
  const url = base + '/functions/v1/calendar-feed' + (orgId ? '?org=' + encodeURIComponent(orgId) : '')
  const webcal = url.replace(/^https?:/, 'webcal:')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  return (
    <section className="cal-box" aria-labelledby="org-subscribe">
      <h2 id="org-subscribe">Put {orgName} in your calendar</h2>
      <p className="hub-org-desc">New events show up on your phone by themselves. Nothing to re-add.</p>
      <div className="cal-actions">
        <a className="btn btn-primary btn-full" href={webcal}>Add to my calendar</a>
        <button type="button" className="btn btn-outline btn-full" onClick={copy}>
          {copied ? 'Link copied' : 'Copy calendar link'}
        </button>
      </div>
      <details className="hub-org-desc">
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>Does the button not work?</summary>
        <p><strong>Google Calendar:</strong> open calendar.google.com on a computer. Next to "Other calendars" choose + then "From URL". Paste the link.</p>
        <p><strong>iPhone:</strong> Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar. Paste the link.</p>
      </details>
    </section>
  )
}
