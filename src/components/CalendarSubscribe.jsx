import { useState } from 'react'
import { useT } from '../utils/lang'

// Subscribe to a group's public events in a phone or computer calendar.
// Pass `choices` ([{ id, name }], id '' = Village Without Borders) to let the
// person pick which calendar to add. Pass `anchorId` so a button can jump here.
export default function CalendarSubscribe({ orgId: orgIdProp, orgName: orgNameProp = 'Village Without Borders', choices, anchorId }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [pick, setPick] = useState('')
  const chosen = choices ? (choices.find((c) => c.id === pick) || choices[0]) : null
  const orgId = chosen ? chosen.id : orgIdProp
  const orgName = chosen ? chosen.name : orgNameProp
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return null
  const url = base + '/functions/v1/calendar-feed' + (orgId ? '?org=' + encodeURIComponent(orgId) : '')
  const webcal = url.replace(/^https?:/, 'webcal:')
  const google = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      window.prompt(t('Copy this link:'), url)
    }
  }

  return (
    <section className="cal-box" id={anchorId} tabIndex={anchorId ? -1 : undefined} aria-labelledby="org-subscribe">
      <h2 id="org-subscribe">{t('Put {name} in your calendar', { name: orgName })}</h2>
      {choices && choices.length > 1 && (
        <label className="hub-org-desc" style={{ display: 'block', marginBottom: '0.75rem' }}>
          {t('Which calendar?')}
          <select value={chosen.id} onChange={(e) => { setPick(e.target.value); setCopied(false) }}
            style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16, marginTop: 4 }}>
            {choices.map((c) => <option key={c.id || 'vwb'} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <p className="hub-org-desc">{t('New events show up on your phone by themselves. Nothing to re-add.')}</p>
      <div className="cal-actions">
        <a className="btn btn-primary btn-full" href={google} target="_blank" rel="noopener noreferrer">{t('Add to Google Calendar')}</a>
        <a className="btn btn-outline btn-full" href={webcal}>{t('Add to iPhone or Apple Calendar')}</a>
        <button type="button" className="btn btn-outline btn-full" onClick={copy}>
          {copied ? t('Link copied') : t('Copy calendar link')}
        </button>
      </div>
      <details className="hub-org-desc">
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>{t('Having trouble? Other ways')} &#8250;</summary>
        <p><strong>{t('iPhone:')}</strong> {t('Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar. Paste the link.')}</p>
        <p><strong>{t('Outlook or others:')}</strong> {t('look for "Subscribe from web" or "Add by URL". Paste the link.')}</p>
      </details>
    </section>
  )
}
