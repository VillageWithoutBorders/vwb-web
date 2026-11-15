import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { useT, getLang } from '../utils/lang'
import Icon from '../components/Icon'

// Nov 13 (Jade): What's new. VWB's own news about the app: what just changed and
// what is coming. Every post can send an alert and an email to everyone
// (vwb-whats-new.sql, send-news-email). VWB admins and the founder post here.
// These are kept, unlike Announcements chat posts, because they are VWB's own notes.

const EMPTY = { kind: 'new', title: '', body: '', link: '', title_es: '', body_es: '', tell: true }

function words(n) {
  const es = getLang() === 'es'
  return { title: (es && n.title_es) || n.title, body: (es && n.body_es) || n.body }
}

export default function WhatsNew() {
  const t = useT()
  const { isAdmin } = useAuth()
  const location = useLocation()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('new')
  const [form, setForm] = useState(null) // null = closed; { id?, ...fields }
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [counts, setCounts] = useState({})
  const [asking, setAsking] = useState(null) // { id, what: 'here' | 'remove' }

  async function load() {
    setError('')
    const { data, error: err } = await supabase.from('app_news')
      .select('id, kind, title, body, title_es, body_es, link, created_at, here_at, told_at')
      .order('created_at', { ascending: false }).limit(100)
    setLoading(false)
    if (err) {
      console.error('Failed to load What’s new:', err)
      setError(t('We couldn’t load the news. Check your connection and try again.'))
      return
    }
    setItems(data || [])
    if (isAdmin) {
      const { data: c, error: cErr } = await supabase.rpc('app_news_email_counts')
      if (cErr) { console.error('Failed to load email counts:', cErr); return }
      const map = {}
      for (const r of c || []) map[r.news_id] = r
      setCounts(map)
    }
  }
  useEffect(() => { load() }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // An alert opens /whats-new#news-<id>: show the right tab, then scroll to the post.
  useEffect(() => {
    const id = (location.hash || '').replace('#news-', '')
    if (!id || !items.length) return
    const it = items.find((x) => x.id === id)
    if (!it) return
    setTab(it.kind)
    setTimeout(() => {
      const el = document.getElementById('news-' + id)
      if (el) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }) }
    }, 50)
  }, [location.hash, items])

  const shown = items.filter((x) => x.kind === tab)
  const newCount = items.filter((x) => x.kind === 'new').length
  const soonCount = items.filter((x) => x.kind === 'soon').length

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function save(e) {
    e.preventDefault()
    if (busy) return
    const title = form.title.trim(), body = form.body.trim(), link = form.link.trim()
    if (!title) { setNote(t('Add a short title.')); return }
    if (!body) { setNote(t('Add a few words about it.')); return }
    if (link && !/^\/[A-Za-z0-9/_?=&#.%-]*$/.test(link)) { setNote(t('The page link must start with / like /settings')); return }
    setBusy(true); setNote('')
    const args = { p_kind: form.kind, p_title: title, p_body: body, p_link: link || null, p_title_es: form.title_es.trim() || null, p_body_es: form.body_es.trim() || null }
    const { error: err } = form.id
      ? await supabase.rpc('update_app_news', { p_id: form.id, ...args })
      : await supabase.rpc('post_app_news', { ...args, p_tell: !!form.tell })
    setBusy(false)
    if (err) {
      console.error('Failed to save news:', err)
      setNote(t('We couldn’t save that. Try again.'))
      return
    }
    setTab(form.kind)
    setForm(null)
    setNote(form.id ? t('Saved.') : form.tell ? t('Posted. Everyone gets an alert, and the emails are on their way.') : t('Posted. No alert or email was sent.'))
    await load()
  }

  async function arrived(n, tell) {
    if (busy) return
    setAsking(null)
    setBusy(true); setNote('')
    const { error: err } = await supabase.rpc('app_news_is_here', { p_id: n.id, p_tell: tell })
    setBusy(false)
    if (err) { console.error('Failed to move news:', err); setNote(t('We couldn’t save that. Try again.')); return }
    setTab('new')
    setNote(tell ? t('Moved to New. Everyone gets an alert and email.') : t('Moved to New.'))
    await load()
  }

  async function remove(n) {
    if (busy) return
    setAsking(null)
    setBusy(true); setNote('')
    const { error: err } = await supabase.rpc('hide_app_news', { p_id: n.id })
    setBusy(false)
    if (err) { console.error('Failed to remove news:', err); setNote(t('We couldn’t save that. Try again.')); return }
    setNote(t('Removed.'))
    await load()
  }

  const date = (s) => new Date(s).toLocaleDateString(getLang() === 'es' ? 'es' : undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="cal-page wn-page">
      <div className="cal-head">
        <div>
          <h1>{t('What’s new')}</h1>
          <p className="cal-sub">{t('What just changed in VWB, and what is coming next.')}</p>
        </div>
        {isAdmin && !form && (
          <button type="button" className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, kind: tab }); setNote('') }}>
            {t('+ Post news')}
          </button>
        )}
      </div>

      {form && (
        <form className="cal-box wn-form" onSubmit={save} noValidate>
          <h2>{form.id ? t('Change this post') : t('Post news')}</h2>
          <fieldset className="wn-kind">
            <legend>{t('What kind?')}</legend>
            <label><input type="radio" name="wn-kind" checked={form.kind === 'new'} onChange={() => set('kind', 'new')} /> {t('New now')}</label>
            <label><input type="radio" name="wn-kind" checked={form.kind === 'soon'} onChange={() => set('kind', 'soon')} /> {t('Coming soon')}</label>
          </fieldset>
          <div className="form-field">
            <label htmlFor="wn-title">{t('Title')}</label>
            <input id="wn-title" type="text" maxLength={100} value={form.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="wn-body">{t('What to know')}</label>
            <textarea id="wn-body" rows={6} maxLength={1500} value={form.body} onChange={(e) => set('body', e.target.value)} style={{ width: '100%', fontSize: '1rem', fontFamily: 'inherit' }} />
            <small className="cal-sub">{t('Short sentences. Start a new line for each idea.')}</small>
          </div>
          <div className="form-field">
            <label htmlFor="wn-link">{t('Page to open (optional)')}</label>
            <input id="wn-link" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" maxLength={200} placeholder="/settings" value={form.link} onChange={(e) => set('link', e.target.value)} />
          </div>
          <details className="wn-es">
            <summary>{t('Spanish (optional)')}</summary>
            <div className="form-field">
              <label htmlFor="wn-title-es">{t('Title in Spanish')}</label>
              <input id="wn-title-es" type="text" lang="es" maxLength={100} value={form.title_es} onChange={(e) => set('title_es', e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="wn-body-es">{t('What to know, in Spanish')}</label>
              <textarea id="wn-body-es" lang="es" rows={5} maxLength={1500} value={form.body_es} onChange={(e) => set('body_es', e.target.value)} style={{ width: '100%', fontSize: '1rem', fontFamily: 'inherit' }} />
            </div>
          </details>
          {!form.id && (
            <label className="wn-tell">
              <input type="checkbox" checked={form.tell} onChange={(e) => set('tell', e.target.checked)} />
              <span><b>{t('Tell everyone')}</b><small>{t('Sends an alert in the app and an email to everyone who has news emails on.')}</small></span>
            </label>
          )}
          {note && <p className="form-error" role="alert">{note}</p>}
          <div className="wn-form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('Saving...') : form.id ? t('Save') : t('Post')}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setForm(null); setNote('') }}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      <div className="notifications-filters wn-tabs" role="group" aria-label={t('Show')}>
        <button type="button" aria-pressed={tab === 'new'} className={'filter-chip' + (tab === 'new' ? ' active' : '')} onClick={() => setTab('new')}>
          {t('New')}{newCount ? ' (' + newCount + ')' : ''}
        </button>
        <button type="button" aria-pressed={tab === 'soon'} className={'filter-chip' + (tab === 'soon' ? ' active' : '')} onClick={() => setTab('soon')}>
          {t('Coming soon')}{soonCount ? ' (' + soonCount + ')' : ''}
        </button>
      </div>

      {!form && note && <p className="cal-sub" role="status" style={{ fontWeight: 600 }}>{note}</p>}
      {error && <p className="form-error" role="alert">{error} <button type="button" className="btn btn-outline" onClick={load}>{t('Try again')}</button></p>}
      {loading && <p className="cal-sub">{t('Loading...')}</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="cal-empty">{tab === 'new' ? t('No news yet.') : t('Nothing on the way right now.')}</p>
      )}

      <ul className="wn-list">
        {shown.map((n) => {
          const w = words(n)
          const c = counts[n.id]
          return (
            <li key={n.id} id={'news-' + n.id} tabIndex={-1} className={'cal-box wn-item wn-' + n.kind}>
              <p className="wn-when">
                <Icon name={n.kind === 'soon' ? 'hourglass' : 'sprout'} /> {n.kind === 'soon' ? t('Coming soon') : n.here_at ? t('Here as of {date}', { date: date(n.here_at) }) : date(n.created_at)}
              </p>
              <h2>{w.title}</h2>
              {w.body.split(/\n+/).filter((s) => s.trim()).map((s, i) => <p key={i} className="wn-body">{s}</p>)}
              {n.link && <Link to={n.link} className="btn btn-outline wn-open">{t('Take me there')} ›</Link>}
              {isAdmin && (
                <div className="wn-admin">
                  {c && <small className="cal-sub">{c.waiting ? t('Emails: {sent} sent, {waiting} waiting for tomorrow', { sent: c.sent, waiting: c.waiting }) : t('Emails: {sent} sent', { sent: c.sent })}</small>}
                  <div className="wn-admin-btns">
                    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setForm({ ...EMPTY, ...n, link: n.link || '', title_es: n.title_es || '', body_es: n.body_es || '', tell: false }); setNote(''); window.scrollTo({ top: 0 }) }}>{t('Change')}</button>
                    {n.kind === 'soon' && <button type="button" className="btn btn-outline" disabled={busy} aria-expanded={asking?.id === n.id && asking.what === 'here'} onClick={() => setAsking({ id: n.id, what: 'here' })}>{t('It’s here')}</button>}
                    <button type="button" className="btn btn-outline" disabled={busy} aria-expanded={asking?.id === n.id && asking.what === 'remove'} onClick={() => setAsking({ id: n.id, what: 'remove' })}>{t('Remove')}</button>
                  </div>
                  {asking?.id === n.id && asking.what === 'here' && (
                    <div className="wn-ask" role="group" aria-label={t('It’s here')}>
                      <p>{t('Move this to New. Tell everyone it is here?')}</p>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => arrived(n, true)}>{t('Move and tell everyone')}</button>
                      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => arrived(n, false)}>{t('Move quietly')}</button>
                      <button type="button" className="btn btn-outline" onClick={() => setAsking(null)}>{t('Cancel')}</button>
                    </div>
                  )}
                  {asking?.id === n.id && asking.what === 'remove' && (
                    <div className="wn-ask" role="group" aria-label={t('Remove')}>
                      <p>{t('Take this post off the page? Alerts and emails already sent stay sent.')}</p>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => remove(n)}>{t('Yes, remove it')}</button>
                      <button type="button" className="btn btn-outline" onClick={() => setAsking(null)}>{t('Cancel')}</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="wn-foot">
        <p className="cal-sub">{t('News also comes to your email. To stop it, go to Settings, then Alerts.')}</p>
        <Link to="/settings" className="btn btn-outline wn-open">{t('Open Settings')}</Link>
      </div>
    </div>
  )
}
