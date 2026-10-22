import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { friendlyError } from '../utils/resourceReports'

// Admin > CRN Import > Research records. VWB admins only (the database
// checks this too). Read only: the CRN sheet is the source. To change a
// record, change the sheet and import it. See vwb-crn-research-stage.sql.

const PAGE = 50
const SHOW = [
  { key: 'all', label: 'All' },
  { key: 'research', label: 'Private research' },
  { key: 'find_help', label: 'In Find Help' },
  { key: 'not_imported', label: 'Not seen by an import yet' },
]

const box = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.85rem', marginBottom: '1rem' }
const small = { color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.45, margin: '0 0 0.5rem' }
const input = { width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: '16px', padding: '0.5rem 0.7rem', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)' }
const chip = (on) => ({ minHeight: 44, padding: '0 0.85rem', borderRadius: 22, border: on ? '2px solid var(--accent)' : '1px solid var(--border-strong)', background: on ? 'var(--green-light)' : 'none', color: 'var(--text)', font: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' })

const STATUS_WORDS = { research: 'Private research', active: 'Active', closed: 'Closed', revoked: 'Revoked' }
const HIDDEN_WORDS = { crn_revoked: 'hidden (revoked)', closed: 'hidden (closed)', paused_for_review: 'paused for review' }

function place(r) {
  return [r.city, r.county ? r.county + ' County' : null, r.state].filter(Boolean).join(', ')
}

// Fields shown on the detail, in the CRN sheet's own words.
const SERVICE_FIELDS = [
  ['service_name', 'Service Name'], ['category', 'Category'], ['find_help_category', 'Find Help Category'],
  ['service_type', 'Service Type'], ['public_description', 'Public Description'], ['delivery_method', 'Delivery Method'],
  ['eligibility_summary', 'Eligibility Summary'], ['access_instructions', 'Access Instructions'],
  ['appointment_required', 'Appointment Required'], ['referral_required', 'Referral Required'], ['cost', 'Cost'],
  ['schedule_frequency', 'Schedule / Frequency'], ['public_phone', 'Public Phone'], ['status', 'Status'],
  ['public_notes', 'Public Notes'], ['last_verified', 'Last Verified'], ['source_url', 'Source URL'], ['approved_at', 'Approved At'],
]
const ORG_FIELDS = [['organization_name', 'Organization Name'], ['common_name', 'Common Name'], ['organization_type', 'Organization Type'],
  ['website', 'Website'], ['public_phone', 'Public Phone'], ['public_email', 'Public Email'], ['approved_at', 'Approved At']]
const LOC_FIELDS = [['public_location_name', 'Public Location Name'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP'],
  ['physical_county', 'Physical County'], ['location_type', 'Location Type'], ['public_access_notes', 'Public Access Notes'], ['approved_at', 'Approved At']]

const RESULT_WORDS = {
  'added to research': 'Added as private research', 'research updated': 'Research updated', 'no change': 'Seen, no change',
  added: 'Added to Find Help', updated: 'Updated', 'updated, conflicts kept': 'Updated (VWB edits kept)', hidden: 'Hidden', linked: 'Linked',
}

export default function AdminCrnResearch() {
  const [search, setSearch] = useState('')
  const [show, setShow] = useState('all')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const ask = useRef(0) // ignore answers to older searches

  useEffect(() => {
    const t = setTimeout(() => load(0), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, show])

  async function load(offset) {
    const n = ++ask.current
    setLoading(true); setNote('')
    const { data, error } = await supabase.rpc('crn_research_list', { p_search: search.trim() || null, p_show: show, p_limit: PAGE, p_offset: offset })
    if (n !== ask.current) return
    setLoading(false)
    if (error) {
      console.error('crn_research_list failed:', error)
      setNote(error.code === 'PGRST202'
        ? 'Research records are not set up on this project yet. Run vwb-crn-research-stage.sql first.'
        : friendlyError(error, "We couldn't load the research records. Try again."))
      return
    }
    const list = data || []
    setRows((old) => (offset === 0 ? list : [...old, ...list]))
    setTotal(list.length ? Number(list[0].total) : offset === 0 ? 0 : total)
  }

  async function toggle(id) {
    if (openId === id) { setOpenId(null); setDetail(null); return }
    setOpenId(id); setDetail(null)
    const { data, error } = await supabase.rpc('crn_research_get', { p_id: id })
    if (error) { console.error('crn_research_get failed:', error); setNote(friendlyError(error, "We couldn't open that record.")); setOpenId(null); return }
    setDetail(data)
  }

  return (
    <div>
      <section style={box} aria-labelledby="crn-rs-h">
        <h3 id="crn-rs-h" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--text)' }}>Research records</h3>
        <p style={small}>Every CRN service VWB has stored, private research included. Read only. To change one, change the CRN sheet and import it. Private research never shows in Find Help.</p>
        <label htmlFor="crn-rs-search" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>Search</label>
        <input id="crn-rs-search" type="search" inputMode="search" autoComplete="off" value={search}
          placeholder="Name, CRN ID, town or county"
          onChange={(e) => setSearch(e.target.value)} style={input} />
        <div role="group" aria-label="Show" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.6rem' }}>
          {SHOW.map((s) => (
            <button key={s.key} type="button" style={chip(show === s.key)} aria-pressed={show === s.key} onClick={() => setShow(s.key)}>{s.label}</button>
          ))}
        </div>
      </section>

      <p role="status" aria-live="polite" style={{ ...small, minHeight: '1.2em', color: note ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: note ? 600 : 400 }}>
        {note || (loading && rows.length === 0 ? 'Loading...' : total + (total === 1 ? ' record' : ' records'))}
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {rows.map((r) => {
          const open = openId === r.source_service_id
          return (
            <li key={r.source_service_id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
              <button type="button" onClick={() => toggle(r.source_service_id)} aria-expanded={open}
                style={{ display: 'block', width: '100%', minHeight: 44, padding: '0.6rem', background: 'none', border: 'none', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}>{r.service_name || '(no name)'}</span>
                <span style={{ display: 'block', ...small, margin: '0.15rem 0 0', overflowWrap: 'anywhere' }}>
                  {r.org_name || r.source_org_id}{place(r) ? ' · ' + place(r) : ''}
                </span>
                <span style={{ display: 'block', ...small, margin: '0.15rem 0 0', overflowWrap: 'anywhere' }}>
                  {r.source_service_id} · {STATUS_WORDS[r.status_meaning] || r.status || '(no status)'}
                  {r.in_find_help
                    ? <> · <strong style={{ color: 'var(--accent)' }}>In Find Help{r.hidden_reason ? ', ' + (HIDDEN_WORDS[r.hidden_reason] || r.hidden_reason) : ''}</strong></>
                    : r.status_meaning === 'research' ? null : <> · Not in Find Help</>}
                </span>
              </button>
              {open && <Detail data={detail} />}
            </li>
          )
        })}
      </ul>

      {rows.length < total && (
        <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48, marginTop: '0.75rem' }} disabled={loading} onClick={() => load(rows.length)}>
          {loading ? 'Loading...' : 'Show ' + Math.min(PAGE, total - rows.length) + ' more'}
        </button>
      )}
    </div>
  )
}

function Fields({ title, obj, fields }) {
  if (!obj) return null
  const filled = fields.filter(([k]) => obj[k] !== null && obj[k] !== undefined && obj[k] !== '')
  return (
    <div style={{ marginTop: '0.6rem' }}>
      <p style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>{title}</p>
      {filled.length === 0 && <p style={{ ...small, margin: 0 }}>Nothing filled in.</p>}
      <dl style={{ margin: 0 }}>
        {filled.map(([k, label]) => (
          <div key={k} style={{ marginBottom: '0.3rem' }}>
            <dt style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{label}</dt>
            <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{String(obj[k])}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Detail({ data }) {
  if (!data) return <p style={{ ...small, padding: '0 0.6rem 0.6rem' }}>Loading...</p>
  const s = data.service || {}
  const history = data.history || []
  return (
    <div style={{ padding: '0 0.6rem 0.6rem', borderTop: '1px solid var(--border)' }}>
      {data.listing
        ? <p style={{ ...small, margin: '0.5rem 0 0', color: 'var(--text)' }}>In Find Help as &ldquo;{data.listing.name}&rdquo;{data.listing.hidden_reason ? ' (' + (HIDDEN_WORDS[data.listing.hidden_reason] || data.listing.hidden_reason) + ')' : ''}. Edits made in VWB stay; the import lists them as conflicts.</p>
        : <p style={{ ...small, margin: '0.5rem 0 0', color: 'var(--text)' }}>Private. Not in Find Help.</p>}
      <Fields title="Service" obj={s} fields={SERVICE_FIELDS} />
      <Fields title="Organization" obj={data.organization} fields={ORG_FIELDS} />
      <Fields title="Location" obj={data.location} fields={LOC_FIELDS} />
      <div style={{ marginTop: '0.6rem' }}>
        <p style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>Import history</p>
        {!s.last_import_batch && history.length === 0 && <p style={{ ...small, margin: 0 }}>Loaded before batch tracking. Its next import adds it to the history, with Undo.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.3rem' }}>
          {history.map((h) => (
            <li key={h.batch_id} style={{ fontSize: '0.95rem', overflowWrap: 'anywhere' }}>
              <strong>{new Date(h.uploaded_at).toLocaleDateString()}</strong> · {RESULT_WORDS[h.result] || h.result || h.grp}
              {h.batch_status === 'undone' && <span style={{ color: 'var(--text-secondary)' }}> (undone)</span>}
              {Object.keys(h.changes || {}).length > 0 && (
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Changed: {Object.keys(h.changes).map((k) => k.replace(/_/g, ' ')).join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
