import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { friendlyError } from '../utils/resourceReports'
import BackLink from '../components/BackLink'
import { useT, getLang } from '../utils/lang'

// Reports and suggested edits on Find Help listings, for Hope Ambassadors
// (in their area) and VWB admins. The database decides who sees what.
// See vwb-resource-reports.sql.

const KIND = {
  id_needed: 'ID needed',
  not_there: 'Not there',
  safety: 'Safety concern',
  something_else: 'Something else',
  edit: 'Suggested edit',
  area_change: 'Change where it serves',
}
const FIELD = { name: 'Name', description: 'Description', phone: 'Phone', url: 'Website', address: 'Address', requirements: 'What to bring' }

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.85rem', marginBottom: '0.75rem' }
const small = { color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.45, margin: '0.15rem 0' }
const input = { width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: '16px', padding: '0.5rem 0.7rem', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)' }
const show = (v, t) => (v === null || v === undefined || v === '' ? t('(blank)') : String(v))

function ReportCard({ r, placeNames, onDone }) {
  const t = useT()
  const loc = getLang() === 'es' ? 'es' : undefined
  const editable = r.kind === 'edit' ? Object.keys(r.proposed_changes || {}) : r.kind === 'id_needed' ? ['requirements'] : []
  const [fields, setFields] = useState(() => {
    const f = {}
    editable.forEach((k) => {
      f[k] = r.kind === 'edit' ? (r.proposed_changes[k]?.new ?? '') : (r.current_values?.[k] ?? '')
    })
    return f
  })
  const [hide, setHide] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const open = r.status === 'waiting' || r.status === 'paused'
  const listingPaused = r.current_values?.hidden_reason === 'paused_for_review'

  async function act(action) {
    let changes = null
    if (action === 'approve') {
      changes = {}
      if (editable.length) {
        const changed = {}
        editable.forEach((k) => {
          const now = (fields[k] ?? '').trim()
          if (now !== (r.current_values?.[k] ?? '')) changed[k] = now
        })
        if (Object.keys(changed).length) changes.fields = changed
      }
      if (hide) changes.hide = true
    }
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('decide_resource_report', { p_report: r.id, p_action: action, p_note: note.trim() || null, p_changes: changes })
    setBusy(false)
    if (error) { console.error('decide_resource_report failed:', error); setMsg(friendlyError(error, t("That didn't save. Try again."))); return }
    onDone()
  }

  return (
    <li style={{ ...card, borderLeft: r.urgent && open ? '4px solid var(--danger)' : card.border }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', overflowWrap: 'anywhere' }}>
        {r.urgent && open && <span style={{ color: 'var(--danger)' }}>{t('Urgent:')} </span>}{KIND[r.kind] ? t(KIND[r.kind]) : r.kind}
      </p>
      <p style={{ ...small, color: 'var(--text)', fontWeight: 600 }}>{r.resource_name}{r.resource_source === 'crn' ? ' (CRN)' : ''}</p>
      {r.serves?.length > 0 && <p style={small}>{t('Serves:')} {r.serves.join('; ')}</p>}
      <p style={small}>{t('From {name}', { name: r.reported_by_name || t('a neighbor') })} &middot; {new Date(r.reported_at).toLocaleString(loc)}</p>
      {listingPaused && <p style={{ ...small, color: 'var(--warn)', fontWeight: 600 }}>{t('This listing is paused. People can’t see it right now.')}</p>}
      {r.details && <p style={{ ...small, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>&ldquo;{r.details}&rdquo;</p>}
      {r.source_url && <p style={small}>{t('Where they checked:')} <a href={r.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', overflowWrap: 'anywhere' }}>{r.source_url}</a></p>}

      {r.kind === 'area_change' && (
        <div style={{ margin: '0.4rem 0' }}>
          {(r.proposed_areas?.add || []).map((id) => <p key={'a' + id} style={small}>{t('Add:')} <strong style={{ color: 'var(--text)' }}>{placeNames[id] || id}</strong></p>)}
          {(r.proposed_areas?.drop || []).map((id) => <p key={'d' + id} style={small}>{t('Stop serving:')} <strong style={{ color: 'var(--danger)' }}>{placeNames[id] || id}</strong></p>)}
        </div>
      )}

      {open && editable.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem', margin: '0.6rem 0' }}>
          {editable.map((k) => (
            <div key={k}>
              <label htmlFor={'rr-' + r.id + '-' + k} style={{ display: 'block', fontWeight: 600, marginBottom: '0.2rem' }}>{FIELD[k] ? t(FIELD[k]) : k}</label>
              <p style={{ ...small, margin: '0 0 0.25rem' }}>{t('Now:')} {show(r.current_values?.[k], t)}</p>
              <input id={'rr-' + r.id + '-' + k} value={fields[k] ?? ''} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} style={input} />
            </div>
          ))}
          <p style={{ ...small, margin: 0 }}>{t('You can fix the new text before you approve it.')}</p>
        </div>
      )}

      {!open && (
        <p style={small}>
          {t(r.status === 'approved' ? 'Approved by {name}' : 'Turned down by {name}', { name: r.reviewed_by_name || t('a reviewer') })}{r.reviewed_at ? ' ' + t('on {date}', { date: new Date(r.reviewed_at).toLocaleDateString(loc) }) : ''}{r.review_note ? ': ' + r.review_note : ''}
        </p>
      )}

      {open && (
        <>
          {r.kind !== 'edit' && r.kind !== 'area_change' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} style={{ width: 22, height: 22 }} />
              <span>{t('Take the listing down (closed)')}</span>
            </label>
          )}
          <label htmlFor={'rr-note-' + r.id} style={{ display: 'block', fontWeight: 600, margin: '0.4rem 0 0.2rem' }}>{t('Note (if you want)')}</label>
          <input id={'rr-note-' + r.id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} style={input} />
          <p role="status" style={{ minHeight: '1.2em', margin: '0.3rem 0', color: 'var(--danger)' }}>{msg}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="btn btn-primary" style={{ minHeight: 48, flex: '1 1 8rem' }} disabled={busy} onClick={() => act('approve')}>
              {r.kind === 'edit' || r.kind === 'area_change' ? t('Approve') : t('Done, it’s handled')}
            </button>
            <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: '1 1 8rem' }} disabled={busy} onClick={() => act('reject')}>
              {r.kind === 'edit' || r.kind === 'area_change' ? t('Turn down') : t('Nothing wrong')}
            </button>
            {r.kind === 'safety' && (
              <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: '1 1 100%' }} disabled={busy} onClick={() => act('not_real_safety')}>{t('Not a real safety concern')}</button>
            )}
            {listingPaused
              ? <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: '1 1 100%' }} disabled={busy} onClick={() => act('resume')}>{t('Show the listing again while I check')}</button>
              : <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: '1 1 100%' }} disabled={busy} onClick={() => act('pause')}>{t('Pause the listing while I check')}</button>}
          </div>
        </>
      )}
    </li>
  )
}

export default function ResourceReports() {
  const t = useT()
  const { profile, isAdmin } = useAuth()
  const canReview = isAdmin || profile?.is_hope_ambassador
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [placeNames, setPlaceNames] = useState({})

  async function load() {
    setLoading(true); setError('')
    const { data, error: err } = await supabase.rpc('list_resource_reports', { p_include_closed: showDone })
    setLoading(false)
    if (err) { console.error('list_resource_reports failed:', err); setError(friendlyError(err, t("We couldn't load reports. Try again."))); return }
    setReports(data || [])
    const ids = [...new Set((data || []).flatMap((r) => [...(r.proposed_areas?.add || []), ...(r.proposed_areas?.drop || [])]))]
    if (ids.length) {
      const { data: places, error: pErr } = await supabase.from('places').select('id, name, parent_id').in('id', ids)
      if (pErr) { console.error('Failed to load area names:', pErr); return }
      const map = {}
      ;(places || []).forEach((p) => { map[p.id] = p.name + (p.parent_id ? ', ' + p.parent_id.split('-')[1] : '') })
      setPlaceNames(map)
    }
  }

  useEffect(() => { if (canReview) load() }, [canReview, showDone])

  if (!canReview) {
    return (
      <div className="community-page">
        <BackLink fallback="/community/resources" fallbackLabel="Find resources" />
        <h1 style={{ fontSize: '1.4rem' }}>{t('Reports to review')}</h1>
        <p style={small}>{t('Hope Ambassadors and VWB admins review reports about listings.')}</p>
      </div>
    )
  }

  const open = reports.filter((r) => r.status === 'waiting' || r.status === 'paused')
  const done = reports.filter((r) => !(r.status === 'waiting' || r.status === 'paused'))

  return (
    <div className="community-page">
      <BackLink fallback="/community/resources" fallbackLabel="Find resources" />
      <h1 style={{ fontSize: '1.4rem', margin: '0.5rem 0' }}>{t('Reports to review')}</h1>
      <p style={small}>{t('Reports and suggested edits on Find Help listings in your area. Urgent ones come first. Nothing changes until someone approves it.')}</p>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {loading && <p style={small}>{t('Loading...')}</p>}
      {!loading && open.length === 0 && <p style={{ ...small, padding: '1rem 0' }}>{t('Nothing waiting right now.')} <Link to="/community/resources" style={{ color: 'var(--accent)' }}>{t('Back to Find resources')}</Link></p>}
      <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
        {open.map((r) => <ReportCard key={r.id + r.status} r={r} placeNames={placeNames} onDone={load} />)}
      </ul>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44, cursor: 'pointer', margin: '0.5rem 0' }}>
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} style={{ width: 22, height: 22 }} />
        <span>{t('Show reports that are already decided')}</span>
      </label>
      {showDone && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {done.map((r) => <ReportCard key={r.id + r.status} r={r} placeNames={placeNames} onDone={load} />)}
        </ul>
      )}
    </div>
  )
}
