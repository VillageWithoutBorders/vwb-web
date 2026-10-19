import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { csvToObjects, toCsv, downloadText } from '../utils/csv'
import { friendlyError } from '../utils/resourceReports'
import { CATEGORIES } from '../utils/resourceCategories'

// Admin > CRN Import. VWB admins only (the database checks this too).
// See vwb-crn-import.sql for the rules.

const TABS = [
  { key: 'organizations', label: 'Organizations', file: 'Approved Organizations' },
  { key: 'locations', label: 'Locations', file: 'Approved Locations' },
  { key: 'services', label: 'Services', file: 'Approved Services' },
  { key: 'areas', label: 'Service areas', file: 'Verified Service Areas', hint: 'Area Type can be County, Community or ZIP (blank means County). A community shows to people who search its county (with a note) or who chose that town. Other towns do not see it. A ZIP only shows on the card. It never decides who sees a service.' },
]
const TAB_LABEL = Object.fromEntries(TABS.map((t) => [t.key, t.label]))

const GROUPS = [
  { key: 'possible_match', label: 'Possible match', hint: 'Looks like a resource already in VWB. Needs a person to decide.' },
  { key: 'held', label: 'Held', hint: 'Can’t import yet. The reason is listed.' },
  { key: 'conflict', label: 'Conflict', hint: 'Someone in VWB changed this since the last import. VWB’s version stays.' },
  { key: 'will_hide', label: 'Will hide', hint: 'Marked closed or revoked. Hidden, not deleted.' },
  { key: 'new', label: 'New', hint: '' },
  { key: 'updated', label: 'Updated', hint: '' },
  { key: 'skipped', label: 'Skipped', hint: 'Not active, and not in VWB yet.' },
  { key: 'no_change', label: 'No change', hint: '' },
  { key: 'missing', label: 'Missing from this export', hint: 'Listed only. Nothing happens to it.' },
]
const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label]))

const VALUE_FIELDS = [
  { key: 'category', label: 'Category', meanings: CATEGORIES.map((c) => [c, c]) },
  { key: 'status', label: 'Status', meanings: [['active', 'Active (show it)'], ['closed', 'Closed (hide it)'], ['revoked', 'Revoked (hide it)']] },
  { key: 'approval_status', label: 'Approval Status (service areas)', meanings: [['approved', 'Approved'], ['revoked', 'Revoked (stop serving)'], ['unverified', 'Not checked yet']] },
  { key: 'statewide', label: 'County value that means the whole state', meanings: [['statewide', 'Whole state']] },
]
const FIELD_LABEL = Object.fromEntries(VALUE_FIELDS.map((f) => [f.key, f.label]))

const box = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.85rem', marginBottom: '1rem' }
const h3 = { margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--text)' }
const small = { color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.45, margin: '0 0 0.5rem' }
const input = { width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: '16px', padding: '0.5rem 0.7rem', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)' }
const chip = (on) => ({ minHeight: 44, padding: '0 0.85rem', borderRadius: 22, border: on ? '2px solid var(--accent)' : '1px solid var(--border-strong)', background: on ? 'var(--green-light)' : 'none', color: 'var(--text)', font: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' })

const show = (v) => (v === null || v === undefined || v === '' ? '(blank)' : Array.isArray(v) ? v.join(', ') : String(v))

// The value a held row is waiting on, so it can be taught in one tap.
function heldValue(reason) {
  const m = /^(Category not mapped yet|Unknown Status value|Unknown Approval Status value): (.+)$/.exec(reason || '')
  if (!m || m[2] === '(blank)') return null
  const field = m[1].startsWith('Category') ? 'category' : m[1].includes('Approval') ? 'approval_status' : 'status'
  return { field, value: m[2] }
}

export default function AdminCrnImport() {
  const [files, setFiles] = useState({}) // { tab: { file, rows, headers } }
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [batches, setBatches] = useState([])
  const [openBatch, setOpenBatch] = useState(null)
  const [rows, setRows] = useState([])
  const [groupFilter, setGroupFilter] = useState('all')
  const [confirming, setConfirming] = useState(false)
  const [values, setValues] = useState([])
  const [newValue, setNewValue] = useState({ field: 'category', value: '', meaning: '' })
  const [teamList, setTeamList] = useState([])
  // Bulk mapping upload: the CRN team's own mapping table, checked first.
  const [mapUpload, setMapUpload] = useState(null) // { file, rows, results }
  const [mapNote, setMapNote] = useState('') // shown under the upload, not at the top of the page

  useEffect(() => { loadBatches(); loadValues(); loadTeam() }, [])

  async function loadBatches(openId) {
    const { data, error } = await supabase.rpc('crn_import_list')
    if (error) { console.error('crn_import_list failed:', error); setNote(friendlyError(error, "We couldn't load past imports.")); return }
    setBatches(data || [])
    const waiting = (data || []).find((b) => b.status === 'preview')
    const pick = openId ? (data || []).find((b) => b.id === openId) : waiting
    if (pick) openBatchRows(pick)
  }

  async function openBatchRows(b) {
    setOpenBatch(b); setConfirming(false); setGroupFilter('all')
    const { data, error } = await supabase.rpc('crn_import_rows_for', { p_batch: b.id })
    if (error) { console.error('crn_import_rows_for failed:', error); setNote(friendlyError(error, "We couldn't load that import.")); return }
    setRows(data || [])
  }

  async function loadValues() {
    const { data, error } = await supabase.rpc('crn_value_map_list')
    if (error) { console.error('crn_value_map_list failed:', error); return }
    setValues(data || [])
  }

  async function loadTeam() {
    const { data, error } = await supabase.rpc('crn_team_list', { p_include_exported: false })
    if (error) { console.error('crn_team_list failed:', error); return }
    setTeamList(data || [])
  }

  async function pickFile(tab, file) {
    setNote('')
    if (!file) { setFiles((f) => { const n = { ...f }; delete n[tab]; return n }); return }
    if (file.size > 5 * 1024 * 1024) { setNote('That file is too big. Split it and import in parts.'); return }
    try {
      const text = await file.text()
      const { headers, rows: r } = csvToObjects(text)
      if (!headers.length) { setNote(file.name + ' looks empty.'); return }
      setFiles((f) => ({ ...f, [tab]: { file: file.name, rows: r, headers } }))
    } catch (e) {
      console.error('Could not read CSV:', e)
      setNote("We couldn't read " + file.name + '. Save it as CSV and try again.')
    }
  }

  async function makePreview() {
    const payload = {}
    Object.entries(files).forEach(([tab, f]) => { payload[tab] = { file: f.file, rows: f.rows } })
    if (!Object.keys(payload).length) { setNote('Add at least one file first.'); return }
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('crn_import_stage', { p_files: payload })
    setBusy(false)
    if (error) { console.error('crn_import_stage failed:', error); setNote(friendlyError(error, "We couldn't make the preview. Try again.")); return }
    setFiles({})
    await loadBatches(data)
  }

  async function decide(row, decision) {
    setBusy(true)
    const { error } = await supabase.rpc('crn_match_decide', { p_row: row.id, p_decision: decision })
    setBusy(false)
    if (error) { console.error('crn_match_decide failed:', error); setNote(friendlyError(error, "That didn't save. Try again.")); return }
    await openBatchRows(openBatch)
  }

  async function apply() {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('crn_import_apply', { p_batch: openBatch.id, p_confirm: true })
    setBusy(false)
    if (error) { console.error('crn_import_apply failed:', error); setNote(friendlyError(error, "The import didn't finish. Nothing changed. Try again.")); return }
    setNote('Imported.')
    await loadBatches(openBatch.id)
    loadTeam()
  }

  async function discard() {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('crn_import_discard', { p_batch: openBatch.id })
    setBusy(false)
    if (error) { console.error('crn_import_discard failed:', error); setNote(friendlyError(error, "That didn't work. Try again.")); return }
    setNote('Discarded. Nothing changed.')
    setOpenBatch(null); setRows([])
    loadBatches()
  }

  async function undo(b) {
    if (!window.confirm('Undo this import? Everything it changed goes back the way it was.')) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('crn_import_undo', { p_batch: b.id })
    setBusy(false)
    if (error) { console.error('crn_import_undo failed:', error); setNote(friendlyError(error, "Undo didn't work. Nothing changed.")); return }
    setNote('Undone.')
    await loadBatches(b.id)
  }

  async function saveValue(v = newValue) {
    if (!v.value.trim() || !v.meaning) { setNote('Type the CRN value and choose what it means.'); return }
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('crn_value_map_set', { p_field: v.field, p_value: v.value.trim(), p_meaning: v.meaning })
    setBusy(false)
    if (error) { console.error('crn_value_map_set failed:', error); setNote(friendlyError(error, "That didn't save. Try again.")); return }
    setNewValue({ field: v.field, value: '', meaning: '' })
    await loadValues()
    setNote('Saved. Make a new preview to use it.')
  }

  async function pickMapFile(file) {
    setMapNote('')
    if (!file) { setMapUpload(null); return }
    if (file.size > 2 * 1024 * 1024) { setMapNote('That file is too big. Split it into parts.'); return }
    let parsed
    try {
      parsed = csvToObjects(await file.text())
    } catch (e) {
      console.error('Could not read mapping CSV:', e)
      setMapNote("We couldn't read " + file.name + '. Save it as CSV and try again.'); return
    }
    if (!parsed.rows.length) { setMapNote(file.name + ' looks empty.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('crn_value_map_import', { p_rows: parsed.rows, p_save: false })
    setBusy(false)
    if (error) { console.error('crn_value_map_import (check) failed:', error); setMapNote(mapUploadError(error, "We couldn't check that file. Try again.")); return }
    setMapUpload({ file: file.name, rows: parsed.rows, results: data || [] })
  }

  async function saveMapUpload() {
    if (!mapUpload) return
    setBusy(true); setMapNote('')
    const { data, error } = await supabase.rpc('crn_value_map_import', { p_rows: mapUpload.rows, p_save: true })
    setBusy(false)
    if (error) { console.error('crn_value_map_import (save) failed:', error); setMapNote(mapUploadError(error, "That didn't save. Nothing changed. Try again.")); return }
    const saved = (data || []).filter((r) => r.outcome === 'saved').length
    setMapUpload(null)
    await loadValues()
    setMapNote(saved + (saved === 1 ? ' mapping saved.' : ' mappings saved.') + ' Make a new preview to use them.')
  }

  function downloadMapTemplate() {
    downloadText('crn-mapping-template.csv', toCsv(['Field', 'CRN Value', 'VWB Meaning', 'Mapping Status', 'Notes'], [
      ['Category', 'Food & Nutrition', 'Food', 'Approved', ''],
      ['Status', 'Active', 'Active', 'Approved', ''],
      ['Approval Status', 'Approved', 'Approved', 'Approved', ''],
      ['Statewide', 'Statewide', 'Whole state', 'Approved', ''],
      ['Category', 'Financial Assistance', 'Money and Benefits', 'Proposed', 'Some programs fit Bills and Utilities better'],
    ]))
  }

  async function removeValue(v) {
    setBusy(true)
    const { error } = await supabase.rpc('crn_value_map_set', { p_field: v.field, p_value: v.crn_value, p_meaning: '' })
    setBusy(false)
    if (error) { console.error('crn_value_map_set failed:', error); setNote(friendlyError(error, "That didn't save. Try again.")); return }
    loadValues()
  }

  async function exportTeam() {
    const headers = ['CRN Source Service ID', 'Resource', 'Kind', 'What changed', 'Approved by', 'Approved on']
    const lines = teamList.map((t) => [t.crn_service_id, t.resource_name, t.kind, JSON.stringify(t.changes), t.approved_by_name || '', new Date(t.created_at).toLocaleDateString()])
    downloadText('vwb-changes-for-crn-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv(headers, lines))
    if (!window.confirm('Mark these as sent to the CRN team?')) return
    const { error } = await supabase.rpc('crn_team_mark_exported', { p_ids: teamList.map((t) => t.id) })
    if (error) { console.error('crn_team_mark_exported failed:', error); setNote(friendlyError(error, "We couldn't mark them as sent.")); return }
    loadTeam()
  }

  const inPreview = openBatch && openBatch.status === 'preview'
  const svc = rows.filter((r) => r.tab === 'services')
  const summary = {
    added: svc.filter((r) => r.grp === 'new').length,
    updated: svc.filter((r) => r.grp === 'updated' || r.grp === 'conflict').length,
    linked: svc.filter((r) => r.grp === 'possible_match' && r.decision === 'link').length,
    waiting: svc.filter((r) => r.grp === 'possible_match' && !r.decision).length,
    held: rows.filter((r) => r.grp === 'held' || r.grp === 'skipped').length,
    hiding: svc.filter((r) => r.grp === 'will_hide').length,
    flagged: svc.filter((r) => r.flags?.includes('coverage') && !['held', 'skipped', 'missing'].includes(r.grp)).length,
  }
  const counts = {}
  rows.forEach((r) => { counts[r.grp] = (counts[r.grp] || 0) + 1 })
  const shown = rows.filter((r) => groupFilter === 'all' || r.grp === groupFilter || (groupFilter === 'coverage' && r.flags?.includes('coverage')))
  const ignored = openBatch ? Object.entries(openBatch.ignored_columns || {}).flatMap(([tab, cols]) => (cols || []).map((c) => TAB_LABEL[tab] + ': ' + c)) : []
  const latestApplied = batches.filter((b) => b.status === 'applied').sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at))[0]
  const fieldMeanings = (VALUE_FIELDS.find((f) => f.key === newValue.field) || VALUE_FIELDS[0]).meanings

  return (
    <div>
      <p role="status" style={{ minHeight: '1.2em', margin: '0 0 0.5rem', color: 'var(--accent)', fontWeight: 600 }}>{note}</p>

      {!inPreview && (
        <section style={box} aria-labelledby="crn-add-h">
          <h3 id="crn-add-h" style={h3}>Add the CRN files</h3>
          <p style={small}>In the CRN workbook, download each approved tab as CSV (File, Download, CSV). Add the ones you have. Nothing changes until you look at the preview and tap Apply.</p>
          {TABS.map((t) => (
            <div key={t.key} style={{ marginBottom: '0.75rem' }}>
              <label htmlFor={'crn-file-' + t.key} style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>{t.file}</label>
              {t.hint && <p id={'crn-hint-' + t.key} style={{ ...small, margin: '0 0 0.25rem' }}>{t.hint}</p>}
              <input id={'crn-file-' + t.key} type="file" accept=".csv,text/csv" aria-describedby={t.hint ? 'crn-hint-' + t.key : undefined} onChange={(e) => pickFile(t.key, e.target.files?.[0])} style={{ ...input, padding: '0.45rem' }} />
              {files[t.key] && <p style={{ ...small, margin: '0.25rem 0 0' }}>{files[t.key].file}: {files[t.key].rows.length} rows</p>}
            </div>
          ))}
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: 48 }} disabled={busy || !Object.keys(files).length} onClick={makePreview}>
            {busy ? 'Reading...' : 'Make a preview'}
          </button>
        </section>
      )}

      {openBatch && (
        <section style={box} aria-labelledby="crn-prev-h">
          <h3 id="crn-prev-h" style={h3}>
            {inPreview ? 'Preview' : 'Import from ' + new Date(openBatch.uploaded_at).toLocaleDateString()} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({openBatch.status === 'preview' ? 'nothing changed yet' : openBatch.status})</span>
          </h3>
          <p style={small}>Files: {Object.values(openBatch.file_names || {}).join(', ') || 'none'}</p>
          {ignored.length > 0 && (
            <p style={{ ...small, color: 'var(--warn)' }}>Ignored columns (never saved): {ignored.join('; ')}</p>
          )}

          <div role="group" aria-label="Show" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.5rem 0 0.75rem' }}>
            <button type="button" style={chip(groupFilter === 'all')} aria-pressed={groupFilter === 'all'} onClick={() => setGroupFilter('all')}>All ({rows.length})</button>
            {GROUPS.filter((g) => counts[g.key]).map((g) => (
              <button key={g.key} type="button" style={chip(groupFilter === g.key)} aria-pressed={groupFilter === g.key} onClick={() => setGroupFilter(g.key)}>{g.label} ({counts[g.key]})</button>
            ))}
            {summary.flagged > 0 && <button type="button" style={chip(groupFilter === 'coverage')} aria-pressed={groupFilter === 'coverage'} onClick={() => setGroupFilter('coverage')}>Coverage flagged ({summary.flagged})</button>}
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
            {shown.map((r) => {
              const teach = (r.reasons || []).map(heldValue).find(Boolean)
              return (
                <li key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem', background: 'var(--surface-2)' }}>
                  <p style={{ margin: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>{r.label || '(no name)'}</p>
                  <p style={{ ...small, margin: '0.1rem 0 0.25rem' }}>
                    {TAB_LABEL[r.tab]}{r.source_id ? ' · ' + r.source_id : ''}{r.row_number ? ' · line ' + r.row_number : ''} · <strong>{GROUP_LABEL[r.grp] || r.grp}</strong>
                    {r.flags?.includes('coverage') && <> · <strong style={{ color: 'var(--warn)' }}>Coverage flagged</strong></>}
                    {r.result && <> · Result: {r.result}</>}
                  </p>
                  {(r.reasons || []).map((x, i) => <p key={i} style={{ ...small, margin: '0.1rem 0', color: 'var(--text)' }}>{x}</p>)}
                  {Object.entries(r.changes || {}).map(([f, c]) => (
                    <p key={f} style={{ ...small, margin: '0.1rem 0', overflowWrap: 'anywhere' }}>
                      <span style={{ fontWeight: 600 }}>{f.replace(/_/g, ' ')}:</span> {show(c.old)} &rarr; {show(c.new)}
                      {c.action === 'conflict' && <strong style={{ color: 'var(--warn)' }}> (kept VWB&rsquo;s version)</strong>}
                    </p>
                  ))}
                  {inPreview && teach && (
                    <button type="button" style={{ ...chip(false), marginTop: '0.3rem' }} onClick={() => setNewValue({ field: teach.field, value: teach.value, meaning: '' })}>
                      Teach the app what &ldquo;{teach.value}&rdquo; means
                    </button>
                  )}
                  {r.grp === 'possible_match' && (
                    <div style={{ marginTop: '0.4rem' }}>
                      <p style={{ ...small, margin: '0 0 0.3rem' }}>Looks like: <strong style={{ color: 'var(--text)' }}>{r.match_name}</strong></p>
                      {r.decision === 'link'
                        ? <p style={{ ...small, color: 'var(--accent)', fontWeight: 600 }}>Marked as the same. Its name, owner and votes stay. Only empty CRN details get filled in.</p>
                        : inPreview && (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy} onClick={() => decide(r, 'same')}>Same resource</button>
                            <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} disabled={busy} onClick={() => decide(r, 'not_same')}>Not the same</button>
                          </div>
                        )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {inPreview && !confirming && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: 1 }} disabled={busy} onClick={discard}>Discard</button>
              <button type="button" className="btn btn-primary" style={{ minHeight: 48, flex: 2 }} disabled={busy} onClick={() => setConfirming(true)}>Apply</button>
            </div>
          )}
          {inPreview && confirming && (
            <div role="alertdialog" aria-labelledby="crn-confirm-h" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 10, border: '2px solid var(--accent)', background: 'var(--surface)' }}>
              <p id="crn-confirm-h" style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>Import these?</p>
              <p style={small}>
                {summary.added} new, {summary.updated} updated, {summary.linked} linked, {summary.hiding} hidden, {summary.held} held or skipped, {summary.flagged} flagged for coverage.
                {summary.waiting > 0 && <> {summary.waiting} possible {summary.waiting === 1 ? 'match is' : 'matches are'} not decided yet and will wait for next time.</>}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: 1 }} disabled={busy} onClick={() => setConfirming(false)}>Go back</button>
                <button type="button" className="btn btn-primary" style={{ minHeight: 48, flex: 2 }} disabled={busy} onClick={apply}>{busy ? 'Importing...' : 'Yes, import these'}</button>
              </div>
            </div>
          )}
        </section>
      )}

      <section style={box} aria-labelledby="crn-values-h">
        <h3 id="crn-values-h" style={h3}>What CRN values mean</h3>
        <p style={small}>Rows with a value the app doesn&rsquo;t know yet are held, not guessed. Teach it each value once, using the CRN team&rsquo;s lists.</p>
        {VALUE_FIELDS.map((f) => {
          const list = values.filter((v) => v.field === f.key)
          if (!list.length) return null
          return (
            <div key={f.key} style={{ marginBottom: '0.6rem' }}>
              <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>{f.label}</p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.3rem' }}>
                {list.map((v) => (
                  <li key={v.field + v.crn_value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ overflowWrap: 'anywhere' }}>&ldquo;{v.crn_value}&rdquo; means <strong>{(f.meanings.find((m) => m[0] === v.meaning) || [v.meaning, v.meaning])[1]}</strong></span>
                    <button type="button" onClick={() => removeValue(v)} disabled={busy} aria-label={'Remove ' + v.crn_value}
                      style={{ minHeight: 44, padding: '0 0.5rem', background: 'none', border: 'none', color: 'var(--danger)', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label htmlFor="crn-v-field" style={{ fontWeight: 600 }}>Which column</label>
          <select id="crn-v-field" value={newValue.field} onChange={(e) => setNewValue({ field: e.target.value, value: newValue.value, meaning: '' })} style={input}>
            {VALUE_FIELDS.map((f) => <option key={f.key} value={f.key}>{FIELD_LABEL[f.key]}</option>)}
          </select>
          <label htmlFor="crn-v-value" style={{ fontWeight: 600 }}>Value, exactly as the CRN sheet writes it</label>
          <input id="crn-v-value" value={newValue.value} onChange={(e) => setNewValue({ ...newValue, value: e.target.value })} style={input} autoComplete="off" />
          <label htmlFor="crn-v-meaning" style={{ fontWeight: 600 }}>What it means in VWB</label>
          <select id="crn-v-meaning" value={newValue.meaning} onChange={(e) => setNewValue({ ...newValue, meaning: e.target.value })} style={input}>
            <option value="">Choose one</option>
            {fieldMeanings.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button type="button" className="btn btn-primary" style={{ minHeight: 48 }} disabled={busy} onClick={() => saveValue()}>Save</button>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: '1rem', paddingTop: '0.85rem' }}>
          <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>Or upload the CRN team&rsquo;s mapping file</p>
          <p style={small}>A CSV with Field, CRN Value, VWB Meaning, Mapping Status and Notes. Only rows marked Approved are saved. You see every row first.</p>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48, marginBottom: '0.5rem' }} onClick={downloadMapTemplate}>Download a blank mapping file</button>
          <label htmlFor="crn-map-file" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>Choose mapping file (CSV)</label>
          <input id="crn-map-file" type="file" accept=".csv,text/csv" disabled={busy}
            onChange={(e) => { pickMapFile(e.target.files?.[0]); e.target.value = '' }} style={{ ...input, padding: '0.6rem' }} />
          {mapNote && <p role="status" style={{ margin: '0.5rem 0 0', color: 'var(--accent)', fontWeight: 600, overflowWrap: 'anywhere' }}>{mapNote}</p>}
          {mapUpload && <MapUploadPreview upload={mapUpload} busy={busy} onSave={saveMapUpload} onCancel={() => setMapUpload(null)} />}
        </div>
      </section>

      <section style={box} aria-labelledby="crn-team-h">
        <h3 id="crn-team-h" style={h3}>For the CRN team ({teamList.length})</h3>
        <p style={small}>Changes Hope Ambassadors approved on CRN listings. The CRN sheet stays the source, so send these to Carrie&rsquo;s team to decide.</p>
        {teamList.length > 0 && (
          <>
            <ul style={{ listStyle: 'none', margin: '0 0 0.6rem', padding: 0, display: 'grid', gap: '0.3rem' }}>
              {teamList.slice(0, 20).map((t) => (
                <li key={t.id} style={{ ...small, margin: 0 }}><strong style={{ color: 'var(--text)' }}>{t.resource_name || t.crn_service_id}</strong> &middot; {t.kind.replace(/_/g, ' ')} &middot; {new Date(t.created_at).toLocaleDateString()}</li>
              ))}
            </ul>
            <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48 }} onClick={exportTeam}>Download as CSV</button>
          </>
        )}
      </section>

      <section style={box} aria-labelledby="crn-past-h">
        <h3 id="crn-past-h" style={h3}>Past imports</h3>
        {batches.length === 0 && <p style={small}>None yet.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
          {batches.map((b) => (
            <li key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openBatchRows(b)} style={{ minHeight: 44, padding: '0 0.25rem', background: 'none', border: 'none', color: 'var(--accent)', font: 'inherit', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', textAlign: 'left' }}>
                {new Date(b.uploaded_at).toLocaleString()}
              </button>
              <span style={{ color: 'var(--text-secondary)' }}>{b.status}</span>
              {latestApplied && b.id === latestApplied.id && (
                <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} disabled={busy} onClick={() => undo(b)}>Undo</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// Plain words for upload errors. PGRST202: the database doesn't have the
// upload function yet (vwb-crn-mapping-upload.sql not run on this project).
function mapUploadError(error, fallback) {
  if (error?.code === 'PGRST202' || /crn_value_map_import/.test(error?.message || '')) {
    return 'The mapping upload isn\u2019t set up on this project yet. Run vwb-crn-find-help-column.sql, then vwb-crn-mapping-upload.sql, then try again.'
  }
  return friendlyError(error, fallback)
}

// What will happen to each row of an uploaded mapping file.
const MAP_OUTCOME = {
  save: 'Will save',
  change: 'Will change',
  same: 'Already set',
  not_saved: 'Not saved',
  problem: 'Problem',
}

function MapUploadPreview({ upload, busy, onSave, onCancel }) {
  const rows = upload.results
  const n = (k) => rows.filter((r) => r.outcome === k).length
  const toSave = n('save') + n('change')
  const problems = n('problem')
  const label = (r) => {
    const f = VALUE_FIELDS.find((x) => x.key === r.field)
    const m = f && (f.meanings.find((x) => x[0] === r.meaning) || [r.meaning, r.meaning])[1]
    return { field: f ? f.label : 'Unknown field', meaning: m || '' }
  }
  return (
    <div style={{ marginTop: '0.75rem' }} aria-live="polite">
      <p style={{ margin: '0 0 0.4rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{upload.file}</p>
      <p style={small}>
        {toSave} to save &middot; {n('same')} already set &middot; {n('not_saved')} not approved yet &middot; {problems} {problems === 1 ? 'problem' : 'problems'}
      </p>
      {problems > 0 && <p style={{ ...small, color: 'var(--danger)', fontWeight: 600 }}>Fix the problem rows in the file and upload it again. Nothing saves until they&rsquo;re fixed.</p>}
      <ul style={{ listStyle: 'none', margin: '0 0 0.6rem', padding: 0, display: 'grid', gap: '0.35rem', maxHeight: 360, overflowY: 'auto' }}>
        {rows.map((r) => {
          const l = label(r)
          const bad = r.outcome === 'problem'
          return (
            <li key={r.line} style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid ' + (bad ? 'var(--danger)' : 'var(--border)'), fontSize: '0.95rem', overflowWrap: 'anywhere' }}>
              <strong style={{ color: bad ? 'var(--danger)' : 'var(--text)' }}>{MAP_OUTCOME[r.outcome] || r.outcome}</strong>
              {' '}&middot; line {r.line} &middot; {l.field}: &ldquo;{r.crn_value || '(blank)'}&rdquo;{l.meaning ? <> means <strong>{l.meaning}</strong></> : null}
              {r.note && <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{r.note}</span>}
            </li>
          )
        })}
      </ul>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: 1 }} disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" style={{ minHeight: 48, flex: 2 }} disabled={busy || problems > 0 || toSave === 0} onClick={onSave}>
          {busy ? 'Saving...' : toSave === 0 ? 'Nothing to save' : 'Save ' + toSave + (toSave === 1 ? ' mapping' : ' mappings')}
        </button>
      </div>
    </div>
  )
}
