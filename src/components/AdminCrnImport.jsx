import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { csvToObjects, toCsv, downloadText } from '../utils/csv'
import { friendlyError } from '../utils/resourceReports'
import { CATEGORIES } from '../utils/resourceCategories'
import { askConfirm } from './AdminDialog'
import EnvBanner from './EnvBanner'
import AdminCrnResearch from './AdminCrnResearch'
import { t, useT } from '../utils/lang'

// Admin > CRN Import. VWB admins only (the database checks this too).
// See vwb-crn-import.sql for the rules.

const TABS = [
  { key: 'organizations', label: 'Organizations', file: 'Approved Organizations' },
  { key: 'locations', label: 'Locations', file: 'Approved Locations', hint: 'Latitude and Longitude are optional. A map pin needs both, with at least 4 decimal places, copied from the building itself. No street number or a private location means no pin. Without them, Find Help shows "About X mi away" from the ZIP.' },
  { key: 'services', label: 'Services', file: 'Approved Services' },
  { key: 'areas', label: 'Service areas', file: 'Verified Service Areas', hint: 'Area Type can be County, Community, ZIP or Open to anyone (blank means County). Open to anyone shows to people within 50 miles of the location. A community shows to people who search its county (with a note) or who chose that town. Other towns do not see it. A ZIP only shows on the card. It never decides who sees a service.' },
]
const TAB_LABEL = Object.fromEntries(TABS.map((t) => [t.key, t.label]))
const TAB_WORD = { organizations: ['1 organization', '{n} organizations'], locations: ['1 location', '{n} locations'], services: ['1 service', '{n} services'], areas: ['1 service area', '{n} service areas'] }

const GROUPS = [
  { key: 'possible_match', label: 'Possible match', hint: 'Looks like a resource already in VWB. Needs a person to decide.' },
  { key: 'held', label: 'Held', hint: 'Can’t import yet. The reason is listed.' },
  { key: 'conflict', label: 'Conflict', hint: 'Someone in VWB changed this since the last import. VWB’s version stays.' },
  { key: 'will_hide', label: 'Will hide', hint: 'Marked closed or revoked. Hidden, not deleted.' },
  { key: 'new', label: 'New', hint: '' },
  { key: 'updated', label: 'Updated', hint: '' },
  { key: 'research_new', label: 'Research new', hint: 'Private research. Saved in VWB, never shown in Find Help.' },
  { key: 'research_updated', label: 'Research updated', hint: 'Private research. Saved in VWB, never shown in Find Help.' },
  { key: 'skipped', label: 'Skipped', hint: 'Not saved this time. The reason is listed.' },
  { key: 'no_change', label: 'No change', hint: '' },
  { key: 'research_same', label: 'Research, no change', hint: '' },
  { key: 'missing', label: 'Missing from this export', hint: 'Listed only. Nothing happens to it.' },
]
const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label]))
// Rows where nothing happens. Folded away so a small batch stays easy to read.
const QUIET = ['missing', 'no_change', 'research_same']
const PAGE = 100

const VALUE_FIELDS = [
  { key: 'category', label: 'Category', meanings: CATEGORIES.map((c) => [c, c]) },
  { key: 'status', label: 'Status', meanings: [['active', 'Active (show it)'], ['closed', 'Closed (hide it)'], ['revoked', 'Revoked (hide it)'], ['research', 'Research only (private, never shown)']] },
  { key: 'approval_status', label: 'Approval Status (service areas)', meanings: [['approved', 'Approved'], ['revoked', 'Revoked (stop serving)'], ['unverified', 'Not checked yet']] },
  { key: 'statewide', label: 'County value that means the whole state', meanings: [['statewide', 'Whole state']] },
]
const FIELD_LABEL = Object.fromEntries(VALUE_FIELDS.map((f) => [f.key, f.label]))

const box = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.85rem', marginBottom: '1rem' }
const h3 = { margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--text)' }
const small = { color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.45, margin: '0 0 0.5rem' }
const input = { width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: '16px', padding: '0.5rem 0.7rem', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-strong)' }
const chip = (on) => ({ minHeight: 44, padding: '0 0.85rem', borderRadius: 22, border: on ? '2px solid var(--accent)' : '1px solid var(--border-strong)', background: on ? 'var(--green-light)' : 'none', color: 'var(--text)', font: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' })

const show = (v) => (v === null || v === undefined || v === '' ? t('(blank)') : Array.isArray(v) ? v.join(', ') : String(v))

// The value a held row is waiting on, so it can be taught in one tap.
function heldValue(reason) {
  const m = /^(Category not mapped yet|Unknown Status value|Unknown Approval Status value): (.+)$/.exec(reason || '')
  if (!m || m[2] === '(blank)') return null
  const field = m[1].startsWith('Category') ? 'category' : m[1].includes('Approval') ? 'approval_status' : 'status'
  return { field, value: m[2] }
}

export default function AdminCrnImport() {
  const tr = useT()
  const [view, setView] = useState('import') // 'import' or 'research'
  const [files, setFiles] = useState({}) // { tab: { file, rows, headers } }
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [batches, setBatches] = useState([])
  const [openBatch, setOpenBatch] = useState(null)
  const [rows, setRows] = useState([])
  const [groupFilter, setGroupFilter] = useState('all')
  const [visible, setVisible] = useState(PAGE)
  const [confirming, setConfirming] = useState(false)
  const [undidThisVisit, setUndidThisVisit] = useState(false) // after one Undo, hide the next one so a second tap can't undo an older import
  const prevRef = useRef(null)
  const [values, setValues] = useState([])
  const [newValue, setNewValue] = useState({ field: 'category', value: '', meaning: '' })
  const [teamList, setTeamList] = useState([])
  // Bulk mapping upload: the CRN team's own mapping table, checked first.
  const [mapUpload, setMapUpload] = useState(null) // { file, rows, results }
  const [mapNote, setMapNote] = useState('') // shown under the upload, not at the top of the page

  useEffect(() => { loadBatches(); loadValues(); loadTeam() }, [])

  async function loadBatches(openId) {
    const { data, error } = await supabase.rpc('crn_import_list')
    if (error) { console.error('crn_import_list failed:', error); setNote(tr(friendlyError(error, "We couldn't load past imports."))); return }
    setBatches(data || [])
    const waiting = (data || []).find((b) => b.status === 'preview')
    const pick = openId ? (data || []).find((b) => b.id === openId) : waiting
    if (pick) openBatchRows(pick)
  }

  async function openBatchRows(b, opts = {}) {
    setOpenBatch(b); setConfirming(false); setGroupFilter('all'); setVisible(PAGE)
    if (opts.scroll) {
      // The import opens near the top of the page. Bring it into view so the tap visibly does something.
      setTimeout(() => {
        const el = prevRef.current
        if (!el) return
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
        el.querySelector('h3')?.focus({ preventScroll: true })
      }, 60)
    }
    const { data, error } = await supabase.rpc('crn_import_rows_for', { p_batch: b.id })
    if (error) { console.error('crn_import_rows_for failed:', error); setNote(tr(friendlyError(error, "We couldn't load that import."))); return }
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
    if (file.size > 5 * 1024 * 1024) { setNote(tr('That file is too big. Split it and import in parts.')); return }
    try {
      const text = await file.text()
      const { headers, rows: r } = csvToObjects(text)
      if (!headers.length) { setNote(tr('{file} looks empty.', { file: file.name })); return }
      setFiles((f) => ({ ...f, [tab]: { file: file.name, rows: r, headers } }))
    } catch (e) {
      console.error('Could not read CSV:', e)
      setNote(tr("We couldn't read {file}. Save it as CSV and try again.", { file: file.name }))
    }
  }

  async function makePreview() {
    const payload = {}
    Object.entries(files).forEach(([tab, f]) => { payload[tab] = { file: f.file, rows: f.rows } })
    if (!Object.keys(payload).length) { setNote(tr('Add at least one file first.')); return }
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('crn_import_stage', { p_files: payload })
    setBusy(false)
    if (error) { console.error('crn_import_stage failed:', error); setNote(tr(friendlyError(error, "We couldn't make the preview. Try again."))); return }
    setFiles({})
    await loadBatches(data)
  }

  async function decide(row, decision) {
    setBusy(true)
    const { error } = await supabase.rpc('crn_match_decide', { p_row: row.id, p_decision: decision })
    setBusy(false)
    if (error) { console.error('crn_match_decide failed:', error); setNote(tr(friendlyError(error, "That didn't save. Try again."))); return }
    await openBatchRows(openBatch)
  }

  async function apply() {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('crn_import_apply', { p_batch: openBatch.id, p_confirm: true })
    setBusy(false)
    if (error) { console.error('crn_import_apply failed:', error); setNote(tr(friendlyError(error, "The import didn't finish. Nothing changed. Try again."))); return }
    setNote(tr('Imported.'))
    setUndidThisVisit(false) // a fresh import can be undone right away
    await loadBatches(openBatch.id)
    loadTeam()
  }

  async function discard() {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('crn_import_discard', { p_batch: openBatch.id })
    setBusy(false)
    if (error) { console.error('crn_import_discard failed:', error); setNote(tr(friendlyError(error, "That didn't work. Try again."))); return }
    setNote(tr('Discarded. Nothing changed.'))
    setOpenBatch(null); setRows([])
    loadBatches()
  }

  async function undo(b) {
    const when = new Date(b.uploaded_at).toLocaleString()
    const what = batchChanges(b) || tr('nothing')
    if (!(await askConfirm(tr('Undo the import from {when}? It changed: {what}. Everything it changed goes back the way it was.', { when, what }), { yes: tr('Undo import'), danger: true }))) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('crn_import_undo', { p_batch: b.id })
    setBusy(false)
    if (error) { console.error('crn_import_undo failed:', error); setNote(tr(friendlyError(error, "Undo didn't work. Nothing changed."))); return }
    setNote(tr('Undone.'))
    setUndidThisVisit(true)
    await loadBatches(b.id)
  }

  async function saveValue(v = newValue) {
    if (!v.value.trim() || !v.meaning) { setNote(tr('Type the CRN value and choose what it means.')); return }
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('crn_value_map_set', { p_field: v.field, p_value: v.value.trim(), p_meaning: v.meaning })
    setBusy(false)
    if (error) { console.error('crn_value_map_set failed:', error); setNote(tr(friendlyError(error, "That didn't save. Try again."))); return }
    setNewValue({ field: v.field, value: '', meaning: '' })
    await loadValues()
    setNote(tr('Saved. Make a new preview to use it.'))
  }

  async function pickMapFile(file) {
    setMapNote('')
    if (!file) { setMapUpload(null); return }
    if (file.size > 2 * 1024 * 1024) { setMapNote(tr('That file is too big. Split it into parts.')); return }
    let parsed
    try {
      parsed = csvToObjects(await file.text())
    } catch (e) {
      console.error('Could not read mapping CSV:', e)
      setMapNote(tr("We couldn't read {file}. Save it as CSV and try again.", { file: file.name })); return
    }
    if (!parsed.rows.length) { setMapNote(tr('{file} looks empty.', { file: file.name })); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('crn_value_map_import', { p_rows: parsed.rows, p_save: false })
    setBusy(false)
    if (error) { console.error('crn_value_map_import (check) failed:', error); setMapNote(mapUploadError(error, tr("We couldn't check that file. Try again."))); return }
    setMapUpload({ file: file.name, rows: parsed.rows, results: data || [] })
  }

  async function saveMapUpload() {
    if (!mapUpload) return
    setBusy(true); setMapNote('')
    const { data, error } = await supabase.rpc('crn_value_map_import', { p_rows: mapUpload.rows, p_save: true })
    setBusy(false)
    if (error) { console.error('crn_value_map_import (save) failed:', error); setMapNote(mapUploadError(error, tr("That didn't save. Nothing changed. Try again."))); return }
    const saved = (data || []).filter((r) => r.outcome === 'saved').length
    setMapUpload(null)
    await loadValues()
    setMapNote(tr(saved === 1 ? '1 mapping saved. Make a new preview to use them.' : '{n} mappings saved. Make a new preview to use them.', { n: saved }))
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
    if (error) { console.error('crn_value_map_set failed:', error); setNote(tr(friendlyError(error, "That didn't save. Try again."))); return }
    loadValues()
  }

  async function exportTeam() {
    const headers = ['CRN Source Service ID', 'Resource', 'Kind', 'What changed', 'Approved by', 'Approved on']
    const lines = teamList.map((t) => [t.crn_service_id, t.resource_name, t.kind, JSON.stringify(t.changes), t.approved_by_name || '', new Date(t.created_at).toLocaleDateString()])
    downloadText('vwb-changes-for-crn-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv(headers, lines))
    if (!(await askConfirm(tr('Mark these as sent to the CRN team?'), { yes: tr('Mark as sent') }))) return
    const { error } = await supabase.rpc('crn_team_mark_exported', { p_ids: teamList.map((t) => t.id) })
    if (error) { console.error('crn_team_mark_exported failed:', error); setNote(tr(friendlyError(error, "We couldn't mark them as sent."))); return }
    loadTeam()
  }

  const inPreview = openBatch && openBatch.status === 'preview'
  const svc = rows.filter((r) => r.tab === 'services')
  const summary = {
    added: svc.filter((r) => r.grp === 'new').length,
    updated: svc.filter((r) => r.grp === 'updated' || r.grp === 'conflict').length,
    linked: svc.filter((r) => r.grp === 'possible_match' && r.decision === 'link').length,
    waiting: svc.filter((r) => r.grp === 'possible_match' && !r.decision).length,
    research: svc.filter((r) => r.grp === 'research_new' || r.grp === 'research_updated').length,
    held: rows.filter((r) => r.grp === 'held' || r.grp === 'skipped').length,
    hiding: svc.filter((r) => r.grp === 'will_hide').length,
    flagged: svc.filter((r) => r.flags?.includes('coverage') && !['held', 'skipped', 'missing'].includes(r.grp)).length,
  }
  // Organizations and locations are always private records. Count them so the confirm box matches the preview.
  const SAVES = ['new', 'updated', 'research_new', 'research_updated']
  const savedWord = (tab) => {
    const n = rows.filter((r) => r.tab === tab && SAVES.includes(r.grp)).length
    return n ? tr(TAB_WORD[tab][n === 1 ? 0 : 1], { n }) : ''
  }
  const privateSaved = ['organizations', 'locations'].map(savedWord).filter(Boolean).join(', ')
  const areasSaved = savedWord('areas')
  const counts = {}
  rows.forEach((r) => { counts[r.grp] = (counts[r.grp] || 0) + 1 })
  const shown = rows.filter((r) => (groupFilter === 'all' ? !QUIET.includes(r.grp) : r.grp === groupFilter || (groupFilter === 'coverage' && r.flags?.includes('coverage'))))
  const quiet = QUIET.filter((g) => counts[g]).map((g) => ({ key: g, n: counts[g] }))
  const quietByTab = (g) => TABS.map((t) => [t.key, rows.filter((r) => r.grp === g && r.tab === t.key).length]).filter(([, n]) => n).map(([k, n]) => tr(TAB_WORD[k][n === 1 ? 0 : 1], { n })).join(', ')
  function pickGroup(g) { setGroupFilter(g); setVisible(PAGE) }
  const ignored = openBatch ? Object.entries(openBatch.ignored_columns || {}).flatMap(([tab, cols]) => (cols || []).map((c) => tr(TAB_LABEL[tab]) + ': ' + c)) : []
  // What a batch changed, from its saved results. Rows that were only listed or unchanged are left out.
  // Grouped by tab so it says what was added: "New: 2 organizations · Research updated: 4 services".
  const batchChanges = (b) => {
    const groups = b?.counts?.groups
    if (groups) {
      const parts = []
      GROUPS.forEach((g) => {
        if (QUIET.includes(g.key)) return
        const list = TABS.map((t) => [t.key, groups[t.key]?.[g.key] || 0]).filter(([, n]) => n)
          .map(([k, n]) => tr(TAB_WORD[k][n === 1 ? 0 : 1], { n })).join(', ')
        if (list) parts.push(tr(g.label) + ': ' + list)
      })
      return parts.join(' · ')
    }
    return Object.entries(b?.counts?.results || {})
      .filter(([k, n]) => n && !['listed only', 'no change'].includes(k))
      .map(([k, n]) => n + ' ' + tr(k)).join(', ')
  }
  // Organizations and locations are private records. Say so, so "New" doesn't read as public.
  const rowLabel = (r) => {
    const base = GROUP_LABEL[r.grp] ? tr(GROUP_LABEL[r.grp]) : r.grp
    const isPrivate = r.tab !== 'services' && ['new', 'updated'].includes(r.grp)
      && (r.flags?.includes('research') || (r.reasons || []).some((x) => /private research/i.test(x)))
    return isPrivate ? tr('{label}, private research', { label: base }) : base
  }
  const latestApplied = batches.filter((b) => b.status === 'applied').sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at))[0]
  const fieldMeanings = (VALUE_FIELDS.find((f) => f.key === newValue.field) || VALUE_FIELDS[0]).meanings

  return (
    <div>
      <EnvBanner />
      <div role="group" aria-label={tr('CRN view')} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button type="button" style={chip(view === 'import')} aria-pressed={view === 'import'} onClick={() => setView('import')}>{tr('Imports')}</button>
        <button type="button" style={chip(view === 'research')} aria-pressed={view === 'research'} onClick={() => setView('research')}>{tr('Research records')}</button>
      </div>
      {view === 'research' ? <AdminCrnResearch /> : <>
      <p role="status" style={{ minHeight: '1.2em', margin: '0 0 0.5rem', color: 'var(--accent)', fontWeight: 600 }}>{note}</p>

      {!inPreview && (
        <section style={box} aria-labelledby="crn-add-h">
          <h3 id="crn-add-h" style={h3}>{tr('Add the CRN files')}</h3>
          <p style={small}>{tr('In the CRN workbook, download each approved tab as CSV (File, Download, CSV). Add the ones you have. Nothing changes until you look at the preview and tap Apply.')}</p>
          {TABS.map((t) => (
            <div key={t.key} style={{ marginBottom: '0.75rem' }}>
              <label htmlFor={'crn-file-' + t.key} style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>{tr(t.file)}</label>
              {t.hint && <p id={'crn-hint-' + t.key} style={{ ...small, margin: '0 0 0.25rem' }}>{tr(t.hint)}</p>}
              <input id={'crn-file-' + t.key} type="file" accept=".csv,text/csv" aria-describedby={t.hint ? 'crn-hint-' + t.key : undefined} onChange={(e) => pickFile(t.key, e.target.files?.[0])} style={{ ...input, padding: '0.45rem' }} />
              {files[t.key] && <p style={{ ...small, margin: '0.25rem 0 0' }}>{tr('{file}: {n} rows', { file: files[t.key].file, n: files[t.key].rows.length })}</p>}
            </div>
          ))}
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: 48 }} disabled={busy || !Object.keys(files).length} onClick={makePreview}>
            {busy ? tr('Reading...') : tr('Make a preview')}
          </button>
        </section>
      )}

      {openBatch && (
        <section ref={prevRef} style={{ ...box, scrollMarginTop: '1rem' }} aria-labelledby="crn-prev-h">
          <h3 id="crn-prev-h" tabIndex={-1} style={h3}>
            {inPreview ? tr('Preview') : tr('Import from {date}', { date: new Date(openBatch.uploaded_at).toLocaleDateString() })} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({openBatch.status === 'preview' ? tr('nothing changed yet') : openBatch.status})</span>
          </h3>
          <p style={small}>{tr('Files: {files}', { files: Object.values(openBatch.file_names || {}).join(', ') || tr('none') })}</p>
          {ignored.length > 0 && (
            <p style={{ ...small, color: 'var(--warn)' }}>{tr('Ignored columns (never saved): {list}', { list: ignored.join('; ') })}</p>
          )}

          <div role="group" aria-label={tr('Show')} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.5rem 0 0.75rem' }}>
            <button type="button" style={chip(groupFilter === 'all')} aria-pressed={groupFilter === 'all'} onClick={() => pickGroup('all')}>{tr('Changes')} ({rows.filter((r) => !QUIET.includes(r.grp)).length})</button>
            {GROUPS.filter((g) => counts[g.key] && !QUIET.includes(g.key)).map((g) => (
              <button key={g.key} type="button" style={chip(groupFilter === g.key)} aria-pressed={groupFilter === g.key} onClick={() => pickGroup(g.key)}>{tr(g.label)} ({counts[g.key]})</button>
            ))}
            {summary.flagged > 0 && <button type="button" style={chip(groupFilter === 'coverage')} aria-pressed={groupFilter === 'coverage'} onClick={() => pickGroup('coverage')}>{tr('Coverage flagged')} ({summary.flagged})</button>}
          </div>

          {quiet.length > 0 && (
            <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 10, padding: '0.6rem', marginBottom: '0.75rem' }}>
              <p style={{ ...small, margin: '0 0 0.4rem' }}>{tr('Folded away. Nothing changes for these:')}</p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                {quiet.map((q) => (
                  <li key={q.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span><strong>{tr(GROUP_LABEL[q.key])}</strong>: {quietByTab(q.key)}</span>
                    <button type="button" style={chip(groupFilter === q.key)} aria-pressed={groupFilter === q.key}
                      onClick={() => pickGroup(groupFilter === q.key ? 'all' : q.key)}>
                      {groupFilter === q.key ? tr('Fold away') : tr('Show them')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shown.length === 0 && <p style={small}>{tr('Nothing to show here.')}</p>}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
            {shown.slice(0, visible).map((r) => {
              const teach = (r.reasons || []).map(heldValue).find(Boolean)
              return (
                <li key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem', background: 'var(--surface-2)' }}>
                  <p style={{ margin: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>{r.label || tr('(no name)')}</p>
                  <p style={{ ...small, margin: '0.1rem 0 0.25rem' }}>
                    {tr(TAB_LABEL[r.tab])}{r.source_id ? ' · ' + r.source_id : ''}{r.row_number ? ' · ' + tr('line {n}', { n: r.row_number }) : ''} · <strong>{rowLabel(r)}</strong>
                    {r.flags?.includes('coverage') && <> · <strong style={{ color: 'var(--warn)' }}>{tr('Coverage flagged')}</strong></>}
                    {r.result && <> · {tr('Result: {result}', { result: r.result })}</>}
                  </p>
                  {(r.reasons || []).map((x, i) => <p key={i} style={{ ...small, margin: '0.1rem 0', color: 'var(--text)' }}>{x}</p>)}
                  {Object.entries(r.changes || {}).map(([f, c]) => (
                    <p key={f} style={{ ...small, margin: '0.1rem 0', overflowWrap: 'anywhere' }}>
                      <span style={{ fontWeight: 600 }}>{f.replace(/_/g, ' ')}:</span> {show(c.old)} &rarr; {show(c.new)}
                      {c.action === 'conflict' && <strong style={{ color: 'var(--warn)' }}>{' ' + tr('(kept VWB’s version)')}</strong>}
                    </p>
                  ))}
                  {inPreview && teach && (
                    <button type="button" style={{ ...chip(false), marginTop: '0.3rem' }} onClick={() => setNewValue({ field: teach.field, value: teach.value, meaning: '' })}>
                      {tr('Teach the app what “{value}” means', { value: teach.value })}
                    </button>
                  )}
                  {r.grp === 'possible_match' && (
                    <div style={{ marginTop: '0.4rem' }}>
                      <p style={{ ...small, margin: '0 0 0.3rem' }}>{tr('Looks like:')} <strong style={{ color: 'var(--text)' }}>{r.match_name}</strong></p>
                      {r.decision === 'link'
                        ? <p style={{ ...small, color: 'var(--accent)', fontWeight: 600 }}>{tr('Marked as the same. Its name, owner and votes stay. Only empty CRN details get filled in.')}</p>
                        : inPreview && (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy} onClick={() => decide(r, 'same')}>{tr('Same resource')}</button>
                            <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} disabled={busy} onClick={() => decide(r, 'not_same')}>{tr('Not the same')}</button>
                          </div>
                        )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {shown.length > visible && (
            <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48, marginTop: '0.5rem' }} onClick={() => setVisible((v) => v + PAGE)}>
              {tr('Show {n} more (of {left} left)', { n: Math.min(PAGE, shown.length - visible), left: shown.length - visible })}
            </button>
          )}

          {inPreview && !confirming && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: 1 }} disabled={busy} onClick={discard}>{tr('Discard')}</button>
              <button type="button" className="btn btn-primary" style={{ minHeight: 48, flex: 2 }} disabled={busy} onClick={() => setConfirming(true)}>{tr('Apply')}</button>
            </div>
          )}
          {inPreview && confirming && (
            <div role="alertdialog" aria-labelledby="crn-confirm-h" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 10, border: '2px solid var(--accent)', background: 'var(--surface)' }}>
              <p id="crn-confirm-h" style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>{tr('Import these?')}</p>
              <EnvBanner compact />
              <p style={small}>
                {tr('{added} new in Find Help, {updated} updated, {linked} linked, {hiding} hidden, {research} saved as private research, {held} held or skipped, {flagged} flagged for coverage.', summary)}
                {privateSaved && <> {tr('Also saved as private records: {list}.', { list: privateSaved })}</>}
                {areasSaved && <> {tr('Service areas added or changed: {list}.', { list: areasSaved })}</>}
                {summary.waiting > 0 && <> {tr(summary.waiting === 1 ? '1 possible match is not decided yet and will wait for next time.' : '{n} possible matches are not decided yet and will wait for next time.', { n: summary.waiting })}</>}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: 1 }} disabled={busy} onClick={() => setConfirming(false)}>{tr('Go back')}</button>
                <button type="button" className="btn btn-primary" style={{ minHeight: 48, flex: 2 }} disabled={busy} onClick={apply}>{busy ? tr('Importing...') : tr('Yes, import these')}</button>
              </div>
            </div>
          )}
        </section>
      )}

      <section style={box} aria-labelledby="crn-values-h">
        <h3 id="crn-values-h" style={h3}>{tr('What CRN values mean')}</h3>
        <p style={small}>{tr('Rows with a value the app doesn’t know yet are held, not guessed. Teach it each value once, using the CRN team’s lists.')}</p>
        {VALUE_FIELDS.map((f) => {
          const list = values.filter((v) => v.field === f.key)
          if (!list.length) return null
          return (
            <div key={f.key} style={{ marginBottom: '0.6rem' }}>
              <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>{tr(f.label)}</p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.3rem' }}>
                {list.map((v) => (
                  <li key={v.field + v.crn_value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ overflowWrap: 'anywhere' }}>{boldSpot(tr('“{value}” means {meaning}', { value: v.crn_value }), '{meaning}', tr((f.meanings.find((m) => m[0] === v.meaning) || [v.meaning, v.meaning])[1]))}</span>
                    <button type="button" onClick={() => removeValue(v)} disabled={busy} aria-label={tr('Remove {name}', { name: v.crn_value })}
                      style={{ minHeight: 44, padding: '0 0.5rem', background: 'none', border: 'none', color: 'var(--danger)', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>{tr('Remove')}</button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label htmlFor="crn-v-field" style={{ fontWeight: 600 }}>{tr('Which column')}</label>
          <select id="crn-v-field" value={newValue.field} onChange={(e) => setNewValue({ field: e.target.value, value: newValue.value, meaning: '' })} style={input}>
            {VALUE_FIELDS.map((f) => <option key={f.key} value={f.key}>{tr(FIELD_LABEL[f.key])}</option>)}
          </select>
          <label htmlFor="crn-v-value" style={{ fontWeight: 600 }}>{tr('Value, exactly as the CRN sheet writes it')}</label>
          <input id="crn-v-value" value={newValue.value} onChange={(e) => setNewValue({ ...newValue, value: e.target.value })} style={input} autoComplete="off" />
          <label htmlFor="crn-v-meaning" style={{ fontWeight: 600 }}>{tr('What it means in VWB')}</label>
          <select id="crn-v-meaning" value={newValue.meaning} onChange={(e) => setNewValue({ ...newValue, meaning: e.target.value })} style={input}>
            <option value="">{tr('Choose one')}</option>
            {fieldMeanings.map(([k, l]) => <option key={k} value={k}>{tr(l)}</option>)}
          </select>
          <button type="button" className="btn btn-primary" style={{ minHeight: 48 }} disabled={busy} onClick={() => saveValue()}>{tr('Save')}</button>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: '1rem', paddingTop: '0.85rem' }}>
          <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>{tr('Or upload the CRN team’s mapping file')}</p>
          <p style={small}>{tr('A CSV with Field, CRN Value, VWB Meaning, Mapping Status and Notes. Only rows marked Approved are saved. You see every row first.')}</p>
          <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48, marginBottom: '0.5rem' }} onClick={downloadMapTemplate}>{tr('Download a blank mapping file')}</button>
          <label htmlFor="crn-map-file" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>{tr('Choose mapping file (CSV)')}</label>
          <input id="crn-map-file" type="file" accept=".csv,text/csv" disabled={busy}
            onChange={(e) => { pickMapFile(e.target.files?.[0]); e.target.value = '' }} style={{ ...input, padding: '0.6rem' }} />
          {mapNote && <p role="status" style={{ margin: '0.5rem 0 0', color: 'var(--accent)', fontWeight: 600, overflowWrap: 'anywhere' }}>{mapNote}</p>}
          {mapUpload && <MapUploadPreview upload={mapUpload} busy={busy} onSave={saveMapUpload} onCancel={() => setMapUpload(null)} />}
        </div>
      </section>

      <section style={box} aria-labelledby="crn-team-h">
        <h3 id="crn-team-h" style={h3}>{tr('For the CRN team ({n})', { n: teamList.length })}</h3>
        <p style={small}>{tr('Changes Hope Ambassadors approved on CRN listings. The CRN sheet stays the source, so send these to Carrie’s team to decide.')}</p>
        {teamList.length > 0 && (
          <>
            <ul style={{ listStyle: 'none', margin: '0 0 0.6rem', padding: 0, display: 'grid', gap: '0.3rem' }}>
              {teamList.slice(0, 20).map((t) => (
                <li key={t.id} style={{ ...small, margin: 0 }}><strong style={{ color: 'var(--text)' }}>{t.resource_name || t.crn_service_id}</strong> &middot; {t.kind.replace(/_/g, ' ')} &middot; {new Date(t.created_at).toLocaleDateString()}</li>
              ))}
            </ul>
            <button type="button" className="btn btn-outline btn-full" style={{ minHeight: 48 }} onClick={exportTeam}>{tr('Download as CSV')}</button>
          </>
        )}
      </section>

      <section style={box} aria-labelledby="crn-past-h">
        <h3 id="crn-past-h" style={h3}>{tr('Past imports')}</h3>
        {batches.length === 0 && <p style={small}>{tr('None yet.')}</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
          {batches.map((b) => (
            <li key={b.id} style={{ display: 'flex', alignItems: 'center', columnGap: '0.5rem', rowGap: '0.15rem', flexWrap: 'wrap', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
              <button type="button" onClick={() => openBatchRows(b, { scroll: true })} aria-label={tr('Open the import from {when}', { when: new Date(b.uploaded_at).toLocaleString() })} style={{ minHeight: 44, padding: '0 0.25rem', background: 'none', border: 'none', color: 'var(--accent)', font: 'inherit', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', textAlign: 'left' }}>
                {new Date(b.uploaded_at).toLocaleString()}
              </button>
              <span style={{ color: 'var(--text-secondary)' }}>{b.status}</span>
              {batchChanges(b) && <span style={{ ...small, margin: '0 0 0.25rem 0.25rem', flexBasis: '100%' }}>{batchChanges(b)}</span>}
              {latestApplied && b.id === latestApplied.id && !undidThisVisit && (
                <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} disabled={busy} onClick={() => undo(b)}>{tr('Undo')}</button>
              )}
            </li>
          ))}
        </ul>
        {undidThisVisit && latestApplied && <p style={{ ...small, marginTop: '0.5rem' }}>{tr('To undo an older import too, reload this page first.')}</p>}
      </section>
      </>}
    </div>
  )
}

// Plain words for upload errors. PGRST202: the database doesn't have the
// upload function yet (vwb-crn-mapping-upload.sql not run on this project).
function mapUploadError(error, fallback) {
  if (error?.code === 'PGRST202' || /crn_value_map_import/.test(error?.message || '')) {
    return t('The mapping upload isn\u2019t set up on this project yet. Run vwb-crn-find-help-column.sql, then vwb-crn-mapping-upload.sql, then try again.')
  }
  return t(friendlyError(error, fallback))
}

// What will happen to each row of an uploaded mapping file.
const MAP_OUTCOME = {
  save: 'Will save',
  change: 'Will change',
  same: 'Already set',
  not_saved: 'Not saved',
  problem: 'Problem',
}

// Puts a bold part where {spot} sits in an already translated sentence.
function boldSpot(text, spot, node) {
  const [a, b = ''] = text.split(spot)
  return <>{a}<strong>{node}</strong>{b}</>
}

function MapUploadPreview({ upload, busy, onSave, onCancel }) {
  const tr = useT()
  const rows = upload.results
  const n = (k) => rows.filter((r) => r.outcome === k).length
  const toSave = n('save') + n('change')
  const problems = n('problem')
  const label = (r) => {
    const f = VALUE_FIELDS.find((x) => x.key === r.field)
    const m = f && (f.meanings.find((x) => x[0] === r.meaning) || [r.meaning, r.meaning])[1]
    return { field: f ? tr(f.label) : tr('Unknown field'), meaning: m ? tr(m) : '' }
  }
  return (
    <div style={{ marginTop: '0.75rem' }} aria-live="polite">
      <p style={{ margin: '0 0 0.4rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{upload.file}</p>
      <p style={small}>
        {tr(problems === 1 ? '{save} to save · {same} already set · {waiting} not approved yet · 1 problem' : '{save} to save · {same} already set · {waiting} not approved yet · {n} problems', { save: toSave, same: n('same'), waiting: n('not_saved'), n: problems })}
      </p>
      {problems > 0 && <p style={{ ...small, color: 'var(--danger)', fontWeight: 600 }}>{tr('Fix the problem rows in the file and upload it again. Nothing saves until they’re fixed.')}</p>}
      <ul style={{ listStyle: 'none', margin: '0 0 0.6rem', padding: 0, display: 'grid', gap: '0.35rem', maxHeight: 360, overflowY: 'auto' }}>
        {rows.map((r) => {
          const l = label(r)
          const bad = r.outcome === 'problem'
          return (
            <li key={r.line} style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid ' + (bad ? 'var(--danger)' : 'var(--border)'), fontSize: '0.95rem', overflowWrap: 'anywhere' }}>
              <strong style={{ color: bad ? 'var(--danger)' : 'var(--text)' }}>{MAP_OUTCOME[r.outcome] ? tr(MAP_OUTCOME[r.outcome]) : r.outcome}</strong>
              {' '}&middot; {tr('line {n}', { n: r.line })} &middot; {l.meaning ? boldSpot(tr('{field}: “{value}” means {meaning}', { field: l.field, value: r.crn_value || tr('(blank)') }), '{meaning}', l.meaning) : tr('{field}: “{value}”', { field: l.field, value: r.crn_value || tr('(blank)') })}
              {r.note && <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{r.note}</span>}
            </li>
          )
        })}
      </ul>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" style={{ minHeight: 48, flex: 1 }} disabled={busy} onClick={onCancel}>{tr('Cancel')}</button>
        <button type="button" className="btn btn-primary" style={{ minHeight: 48, flex: 2 }} disabled={busy || problems > 0 || toSave === 0} onClick={onSave}>
          {busy ? tr('Saving...') : toSave === 0 ? tr('Nothing to save') : tr(toSave === 1 ? 'Save 1 mapping' : 'Save {n} mappings', { n: toSave })}
        </button>
      </div>
    </div>
  )
}
