import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ACCESS_CHOICES, ACCESS_TEXTS, cleanAccess } from '../utils/eventAccess'
import { useT } from '../utils/lang'

// Round E part 4 (Nov 10): access notes on the event form. All optional, folded
// away so the form stays short. A saved place fills them in; any set of notes can
// be saved as a place for next time.
export default function AccessNotesEditor({ value, onChange, orgId }) {
  const t = useT()
  const v = value || {}
  const [places, setPlaces] = useState(null)
  const [saveName, setSaveName] = useState('')
  const [note, setNote] = useState('')
  const filled = !!cleanAccess(v)

  useEffect(() => {
    let alive = true
    supabase.rpc('my_event_places').then(({ data, error }) => {
      if (!alive) return
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load saved places:', error); setPlaces([]); return }
      setPlaces(data || [])
    })
    return () => { alive = false }
  }, [])

  const set = (k, val) => onChange({ ...v, [k]: val })
  async function savePlace() {
    const a = cleanAccess(v)
    if (!saveName.trim() || !a) return
    setNote('')
    const { error } = await supabase.rpc('save_event_place', { p_name: saveName.trim(), p_access: a, p_org: orgId || null })
    if (error) { console.error('Failed to save place:', error); setNote(error.code === 'P0001' ? error.message : t("We couldn't save that. Try again.")); return }
    setNote(t('Saved. Pick it next time under Use a saved place.'))
    setSaveName('')
    const { data } = await supabase.rpc('my_event_places')
    setPlaces(data || [])
  }

  return (
    <details className="acc-edit" open={filled || undefined}>
      <summary>{t('Access notes (optional)')}</summary>
      <p className="field-hint">{t('Help people know what to expect: noise, lights, crowds, a quiet room, parking, and what happens when.')}</p>
      {places && places.length > 0 && (
        <div className="form-field">
          <label htmlFor="acc-place">{t('Use a saved place')}</label>
          <select id="acc-place" defaultValue="" onChange={(e) => { const p = places.find((x) => String(x.id) === e.target.value); if (p) onChange({ ...(p.access || {}) }) }}>
            <option value="">{t('Choose one')}</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      {Object.entries(ACCESS_CHOICES).map(([k, c]) => (
        <fieldset key={k} className="acc-choice">
          <legend>{t(c.label)}</legend>
          <div className="acc-options">
            {c.options.map(([val, label]) => (
              <label key={val} className={'cal-choice acc-opt' + (v[k] === val ? ' is-on' : '')}>
                <input type="radio" name={'acc-' + k} checked={v[k] === val} onChange={() => set(k, val)} />
                <span>{t(label)}</span>
              </label>
            ))}
            {v[k] && <button type="button" className="link-button acc-clear" onClick={() => set(k, null)}>{t('Clear')}</button>}
          </div>
        </fieldset>
      ))}
      {Object.entries(ACCESS_TEXTS).map(([k, c]) => (
        <div key={k} className="form-field">
          <label htmlFor={'acc-' + k}>{t(c.label)}</label>
          {k === 'order'
            ? <textarea id={'acc-' + k} rows={4} maxLength={c.max} value={v[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder={t(c.hint)} />
            : <input id={'acc-' + k} type="text" maxLength={c.max} value={v[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder={t(c.hint)} />}
        </div>
      ))}
      <p className="field-hint">{t('Parking and entry is hidden like the address when only people who sign up see the place.')}</p>
      {filled && (
        <div className="acc-save">
          <label htmlFor="acc-save-name">{t('Save these notes as a place for next time (optional)')}</label>
          <div className="acc-save-row">
            <input id="acc-save-name" type="text" maxLength={80} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={t('Place name, like Main library')} />
            <button type="button" className="btn btn-outline" disabled={!saveName.trim()} onClick={savePlace}>{t('Save place')}</button>
          </div>
          {note && <p className="field-hint" role="status">{note}</p>}
        </div>
      )}
    </details>
  )
}
