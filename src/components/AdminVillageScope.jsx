import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

// Admins see the people in the villages the founder gives them
// (vwb-admin-local-people.sql). The database enforces it; this file only
// explains it and lets the founder set it.

// Puts bits of page into a translated sentence: 'You see people in {villages}, ...'
function fill(s, bits) {
  return s.split(/(\{\w+\})/).map((x, i) => {
    const m = /^\{(\w+)\}$/.exec(x)
    return <Fragment key={i}>{m && bits[m[1]] !== undefined ? bits[m[1]] : x}</Fragment>
  })
}

// Loads every admin's villages (founder) or your own (admin).
export function useAdminVillages(refreshKey) {
  const [rows, setRows] = useState([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    supabase.rpc('admin_village_list').then(({ data, error }) => {
      if (error) { console.error('[useAdminVillages] failed:', error); setFailed(true); return }
      setFailed(false)
      setRows(data || [])
    })
  }, [refreshKey])
  return { rows, failed }
}

// Top of People, for admins who are not the founder.
export function AdminScopeNote({ me, rows, failed }) {
  const t = useT()
  if (failed) return null
  const mine = rows.filter((r) => r.admin_id === me).map((r) => r.village_name)
  return (
    <p className="admin-scope-note" role="note">
      {mine.length > 0
        ? fill(t("You see people in {villages}, every admin, people who haven't joined a village yet, and anyone waiting on a role review."), { villages: <strong>{mine.join(', ')}</strong> })
        : t("The founder hasn't given you any villages yet. For now you see every admin, people who haven't joined a village yet, and anyone waiting on a role review.")}
    </p>
  )
}

// On an admin's row, for the founder: pick the villages they cover.
export function AdminVillagePicker({ admin, villages, rows, onSaved }) {
  const t = useT()
  const current = rows.filter((r) => r.admin_id === admin.user_id).map((r) => r.village_id)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(current)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => { if (!open) setPicked(current) }, [open, rows]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function save() {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('set_admin_villages', { p_admin: admin.user_id, p_villages: picked })
    setBusy(false)
    if (error) { console.error('[AdminVillagePicker] save failed:', error); setNote(error.message ? t(error.message) : t("That didn't save. Try again.")); return }
    setOpen(false)
    onSaved?.()
  }

  const names = rows.filter((r) => r.admin_id === admin.user_id).map((r) => r.village_name)
  return (
    <div className="admin-village-picker">
      <button type="button" className="admin-village-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('Villages they cover: {list}', { list: names.length ? names.join(', ') : t('none yet') })}
      </button>
      {open && (
        <fieldset className="admin-village-set">
          <legend>{t('Which villages can {name} see?', { name: admin.display_name || t('this admin') })}</legend>
          {villages.length === 0 && <p className="admin-section-note">{t('No villages yet.')}</p>}
          {villages.map((v) => (
            <label key={v.id} className="admin-village-option">
              <input type="checkbox" checked={picked.includes(v.id)} onChange={() => toggle(v.id)} />
              <span>{v.name}</span>
            </label>
          ))}
          {note && <p className="admin-role-note" role="alert">{note}</p>}
          <div className="admin-role-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? t('Saving...') : t('Save')}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel')}</button>
          </div>
        </fieldset>
      )}
    </div>
  )
}

// Founder only: the keeper asks (vwb-founder-keeper.sql).
export function useKeeperOffers(isFounder, refreshKey) {
  const [offers, setOffers] = useState([])
  useEffect(() => {
    if (!isFounder) return
    supabase.rpc('keeper_offer_list').then(({ data, error }) => {
      if (error) { console.error('[useKeeperOffers] failed:', error); return }
      setOffers(data || [])
    })
  }, [isFounder, refreshKey])
  return offers
}

// Founder only: ask an admin to be Keeper of a village.
// On an admin's row (admin set, pick a village) or on a village (village set, pick an admin).
export function AdminKeeperAsk({ admin, village, choices, offers, onChanged }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const waiting = offers.filter((o) => o.status === 'waiting' && (admin ? o.admin_id === admin.user_id : o.village_id === village.id))

  async function ask() {
    if (!pick) { setNote(admin ? t('Pick a village.') : t('Pick an admin.')); return }
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('founder_offer_keeper', admin
      ? { p_village: pick, p_admin: admin.user_id }
      : { p_village: village.id, p_admin: pick })
    setBusy(false)
    if (error) { console.error('[AdminKeeperAsk] ask failed:', error); setNote(error.message ? t(error.message) : t("That didn't send. Try again.")); return }
    setOpen(false); setPick('')
    setNote(t('Asked. They get an alert, and nothing changes until they say yes.'))
    onChanged?.()
  }

  async function takeBack(o) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('founder_cancel_keeper_offer', { p_offer: o.offer_id })
    setBusy(false)
    if (error) { console.error('[AdminKeeperAsk] take back failed:', error); setNote(error.message ? t(error.message) : t("That didn't save. Try again.")); return }
    setNote(t('Ask taken back.'))
    onChanged?.()
  }

  return (
    <div className="admin-village-picker">
      {waiting.map((o) => (
        <p key={o.offer_id} className="admin-section-note">
          {admin ? t('Waiting: Keeper of {village}.', { village: o.village_name }) : t('Waiting: {name} to keep it.', { name: o.admin_name })}{' '}
          <button type="button" className="admin-village-btn" disabled={busy} onClick={() => takeBack(o)}>{t('Take back')}</button>
        </p>
      ))}
      <button type="button" className="admin-village-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {admin ? t('Name as Keeper of a village') : t('Name an admin as Keeper')}
      </button>
      {open && (
        <fieldset className="admin-village-set">
          <legend>{admin ? t('Which village should {name} keep?', { name: admin.display_name || t('this admin') }) : t('Which admin should keep {village}?', { village: village.name })}</legend>
          <p className="admin-section-note">{t('They get an alert and say yes or no. If they say yes, the current keeper becomes a helper and can still post announcements.')}</p>
          {choices.length === 0
            ? <p className="admin-section-note">{admin ? t('No villages yet.') : t('No admins to pick.')}</p>
            : (
              <label className="admin-village-option" style={{ display: 'grid', gap: '0.25rem' }}>
                <span>{admin ? t('Village') : t('Admin')}</span>
                <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ minHeight: '44px', fontSize: '1rem', padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface-sunk, var(--surface))', color: 'var(--text)' }}>
                  <option value="">{t('Pick one')}</option>
                  {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            )}
          <div className="admin-role-actions">
            <button type="button" className="btn btn-primary" disabled={busy || choices.length === 0} onClick={ask}>{busy ? t('Sending...') : t('Ask them')}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel')}</button>
          </div>
        </fieldset>
      )}
      {note && <p className="admin-role-note" role="status">{note}</p>}
    </div>
  )
}
