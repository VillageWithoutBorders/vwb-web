import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { getPushState, subscribeToPush, unsubscribeFromPush, isAppleMobile } from '../utils/pushUtils'
import { useT } from '../utils/lang'

// Nov 13: turn alerts on or off for THIS phone or computer, send a test, and plain
// steps for when the device itself is hiding them. Lives at the top of Phone alerts
// in Settings. Each device is turned on by itself.
const STATUS = {
  on: 'Alerts are on for this device.',
  off: 'Alerts are off for this device. Turn them on to know when a neighbor answers.',
  blocked: 'This browser is blocking alerts from VWB. See the steps below to let them in.',
  'needs-home-screen': 'On iPhone and iPad, alerts only work from the Home Screen. Tap Share, then Add to Home Screen. Open VWB from the new icon and come back here.',
  unsupported: 'This browser can’t show alerts. Try Chrome, Edge, Firefox or Safari.',
}

function whichDevice() {
  const ua = navigator.userAgent || ''
  if (isAppleMobile()) return 'iphone'
  if (/Android/i.test(ua)) return 'android'
  if (/Mac/i.test(ua)) return 'mac'
  return 'windows'
}

const STEPS = {
  android: [
    'Open your phone’s Settings, then Apps.',
    'Pick Village Without Borders (or Chrome if you use VWB in Chrome).',
    'Tap Notifications and turn them on.',
    'If you still see nothing, check that Do Not Disturb is off.',
  ],
  iphone: [
    'You need iOS 16.4 or newer.',
    'In Safari, tap Share, then Add to Home Screen.',
    'Open VWB from the new Home Screen icon and turn on alerts here.',
    'Later you can change it in the iPhone Settings app, under Notifications, then Village Without Borders.',
  ],
  windows: [
    'Open Windows Settings, then System, then Notifications.',
    'Turn on notifications for Chrome or Edge (or for Village Without Borders if you installed the app).',
    'Check that Do not disturb is off.',
    'Alerts come while the browser or the VWB app is open. You can keep it open in the background.',
  ],
  mac: [
    'Open System Settings, then Notifications.',
    'Pick Chrome, Safari, Edge or Firefox (or Village Without Borders if you installed it).',
    'Turn on Allow notifications. Banners or Alerts both work.',
    'Check that Focus is off. Alerts come while the browser or the VWB app is open.',
  ],
}

const BLOCKED_STEPS = [
  'Click or tap the small icon to the left of the web address (a lock or sliders).',
  'Find Notifications and change it to Allow.',
  'Reload the page and come back here.',
  'In Brave, also turn on Use Google services for push messaging in Settings, then Privacy.',
]

const DEVICE_NAMES = { android: 'Android phone', iphone: 'iPhone or iPad', windows: 'Windows computer', mac: 'Mac' }

export default function PushDeviceSwitch() {
  const t = useT()
  const { user } = useAuth()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const device = whichDevice()

  useEffect(() => {
    let alive = true
    getPushState().then((s) => { if (alive) setState(s) })
    return () => { alive = false }
  }, [])

  async function turnOn() {
    if (!user?.id || busy) return
    setBusy(true); setNote('')
    const result = await subscribeToPush(user.id)
    setBusy(false)
    if (result.ok) {
      try { localStorage.setItem('vwb_push_v2', 'true') } catch { /* private mode */ }
      setState('on')
      setNote(t('Alerts are on. Tap Send me a test to try it.'))
    } else if (result.reason === 'denied') {
      setState(Notification.permission === 'denied' ? 'blocked' : 'off')
      setNote(t('Alerts were not allowed. You can let them in with the steps below.'))
    } else {
      setNote(t('Could not turn on alerts. Please try again later.'))
    }
  }

  async function turnOff() {
    if (!user?.id || busy) return
    setBusy(true); setNote('')
    const result = await unsubscribeFromPush(user.id)
    setBusy(false)
    if (result.ok) { setState('off'); setNote(t('Alerts are off for this device.')) }
    else setNote(t("We couldn't turn them off. Try again."))
  }

  async function sendTest() {
    if (busy) return
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('send_me_a_test_alert')
    setBusy(false)
    if (error) { console.error('Test alert failed:', error); setNote(t("We couldn't send a test. Try again.")); return }
    if (data?.reason === 'wait') { setNote(t('Please wait a minute before sending another test.')); return }
    if (!data?.devices) { setNote(t('No device is turned on yet. Turn on alerts first.')); return }
    setNote(t('Sent. It should pop up in a few seconds. If it doesn’t, try the steps below.'))
  }

  if (!state) return null
  const steps = state === 'blocked' ? BLOCKED_STEPS : STEPS[device]

  return (
    <div className="push-device">
      <p className="push-device-status"><b>{t('This device')}:</b> {t(STATUS[state])}</p>
      <div className="push-device-actions">
        {state === 'off' && (
          <button type="button" className="btn btn-primary" onClick={turnOn} disabled={busy}>{busy ? t('Turning on...') : t('Turn on alerts')}</button>
        )}
        {state === 'on' && (
          <>
            <button type="button" className="btn btn-primary" onClick={sendTest} disabled={busy}>{t('Send me a test')}</button>
            <button type="button" className="btn btn-outline" onClick={turnOff} disabled={busy}>{t('Turn off here')}</button>
          </>
        )}
      </div>
      {note && <p className="alert-choices-note" role="status">{note}</p>}
      {state !== 'unsupported' && (
        <details className="push-device-help" open={state === 'blocked' || state === 'needs-home-screen'}>
          <summary>{state === 'blocked' ? t('How to let alerts in') : t('Not seeing alerts on your {device}?', { device: t(DEVICE_NAMES[device]) })}</summary>
          <ol>{steps.map((s) => <li key={s}>{t(s)}</li>)}</ol>
        </details>
      )}
    </div>
  )
}
