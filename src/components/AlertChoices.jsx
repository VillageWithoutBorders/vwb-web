import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { alertKindName } from '../utils/alertKinds'
import { useT } from '../utils/lang'
import PushDeviceSwitch from './PushDeviceSwitch'

// Round E part 2 (Nov 10): how phone alerts come. Everything still shows in the
// Alerts list in the app. Emergencies and account safety alerts always come through.
const MODES = [
  { k: 'all', label: 'All alerts', sub: 'Every alert comes to your phone right away.' },
  { k: 'quiet', label: 'Quiet', sub: 'Only private messages, your own help and events, and your groups’ Announcements.' },
  { k: 'daily', label: 'Once a day', sub: 'One alert each evening that says how many are waiting.' },
]

export default function AlertChoices() {
  const t = useT()
  const { profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // Before the database step is run, the columns are not there: show only this device's switch.
  if (!profile || !Object.prototype.hasOwnProperty.call(profile, 'alert_mode')) {
    return (
      <div className="profile-details" style={{ marginBottom: '1rem' }}>
        <div className="detail-section-header">{t('Alerts')}</div>
        <PushDeviceSwitch />
      </div>
    )
  }
  const mode = profile.alert_mode || 'all'
  const muted = Array.isArray(profile.muted_alert_types) ? profile.muted_alert_types : []

  async function pick(k) {
    if (k === mode || busy) return
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('set_my_alert_mode', { p_mode: k })
    setBusy(false)
    if (error) { console.error('Failed to save alert choice:', error); setNote(t("We couldn't save that. Try again.")); return }
    await refreshProfile()
    setNote(t('Saved.'))
  }
  async function unmute(type) {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('mute_alert_type', { p_type: type, p_mute: false })
    setBusy(false)
    if (error) { console.error('Failed to unmute:', error); setNote(t("We couldn't save that. Try again.")); return }
    await refreshProfile()
  }

  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
    <fieldset className="alert-choices" aria-labelledby="alerts-h">
      <div className="detail-section-header" id="alerts-h">{t('Alerts')}</div>
      <PushDeviceSwitch />
      <p className="alert-choices-note" style={{ marginTop: '0.25rem', paddingLeft: '10px' }}><b>{t('Which alerts pop up')}</b></p>
      {MODES.map((m) => (
        <label key={m.k} className={'alert-choice' + (mode === m.k ? ' is-on' : '')}>
          <input type="radio" name="alert-mode" value={m.k} checked={mode === m.k} disabled={busy} onChange={() => pick(m.k)} />
          <span><b>{t(m.label)}</b><small>{t(m.sub)}</small></span>
        </label>
      ))}
      <p className="alert-choices-note">{t('Emergencies and account safety alerts always come through. Everything still shows in Alerts in the app.')}</p>
      {muted.length > 0 && (
        <div className="alert-muted">
          <p><b>{t('Muted')}</b></p>
          {muted.map((type) => (
            <div key={type} className="alert-muted-row">
              <span>{t(alertKindName(type))}</span>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => unmute(type)}>{t('Unmute')}</button>
            </div>
          ))}
        </div>
      )}
      {note && <p className="alert-choices-note" role="status">{note}</p>}
    </fieldset>
    </div>
  )
}
