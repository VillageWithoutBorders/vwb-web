import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// Phase 4 measuring page (admins only). Nothing is saved anywhere.
// It makes fake devices on this phone, locks one message for N of them,
// then opens messages the way a reader would. Run it on slow phones.

const DEVICE_COUNTS = [1, 6, 8, 16, 32, 64, 128]
const MESSAGE = 'Hi neighbors, the creek is rising near the bridge on Cherokee Valley Road. Can anyone bring sandbags to the church lot by 4? Thank you. '.slice(0, 140)

function ms(n) { return Math.round(n * 10) / 10 }
function kb(bytes) { return Math.round(bytes / 102.4) / 10 }
function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

export default function ScrambleTest() {
  const { isAdmin } = useAuth()
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState('')
  const [real, setReal] = useState('')

  function showReal() {
    let list = []
    try { list = JSON.parse(localStorage.getItem('vwb_scramble_timings') || '[]') } catch { /* none */ }
    if (list.length === 0) { setReal('No real scrambled sends or opens recorded on this phone yet.'); return }
    const out = ['REAL USE on this phone (newest last)']
    for (const t of list) {
      out.push(t.kind === 'send'
        ? t.at.slice(11, 19) + ' SEND ' + t.devices + ' copies (' + t.keyless + ' members without a key), key ' + t.keyMs + ' ms, member lookup ' + t.lookupMs + ' ms, lock ' + t.lockMs + ' ms, save ' + t.saveMs + ' ms, total ' + t.totalMs + ' ms, upload ' + t.uploadKB + ' KB'
        : t.at.slice(11, 19) + ' OPEN ' + t.opened + ' of ' + t.messages + ' messages, fetch ' + t.fetchMs + ' ms, unlock ' + t.unlockMs + ' ms, total ' + t.totalMs + ' ms, download ' + t.downloadKB + ' KB')
    }
    setReal(out.join('\n'))
  }

  if (!isAdmin) return <div style={{ padding: '1rem' }}><p>Admins only.</p></div>

  async function run() {
    setRunning(true)
    const lines = []
    const log = (s) => { lines.push(s); setReport(lines.join('\n')) }
    try {
      const sodium = (await import('libsodium-wrappers')).default
      await sodium.ready
      const nav = navigator
      const conn = nav.connection || {}
      log('VWB scramble test, ' + new Date().toISOString())
      log('Phone/browser: ' + nav.userAgent)
      log('CPU cores: ' + (nav.hardwareConcurrency || '?') + ', memory GB: ' + (nav.deviceMemory || '?') + ', network: ' + (conn.effectiveType || '?') + ', downlink Mbps: ' + (conn.downlink || '?') + ', rtt ms: ' + (conn.rtt || '?'))
      log('')

      // 1. Speed of one round trip to the database (5 tries, median)
      const trips = []
      for (let i = 0; i < 5; i++) {
        const t = performance.now()
        await supabase.from('villages').select('id').limit(1)
        trips.push(performance.now() - t)
      }
      log('Database round trip, median of 5: ' + ms(median(trips)) + ' ms')
      log('')

      // 2. Send cost: lock one message for N devices
      const sender = sodium.crypto_box_keypair()
      log('SEND: lock one message (' + MESSAGE.length + ' characters) for N devices')
      log('devices | lock time ms | upload KB | rows')
      const wireByCount = {}
      for (const n of DEVICE_COUNTS) {
        const targets = []
        for (let i = 0; i < n; i++) targets.push(sodium.crypto_box_keypair().publicKey)
        const times = []
        let rows = null
        for (let rep = 0; rep < 5; rep++) {
          const t = performance.now()
          rows = targets.map((pub, i) => {
            const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
            const ct = sodium.crypto_box_easy(MESSAGE, nonce, pub, sender.privateKey)
            return { user_id: 'u' + i, device_id: 'd' + i, ciphertext: sodium.to_base64(ct), nonce: sodium.to_base64(nonce), post_id: 'p' }
          })
          times.push(performance.now() - t)
        }
        const bytes = new Blob([JSON.stringify(rows)]).size
        wireByCount[n] = bytes
        log(n + ' | ' + ms(median(times)) + ' | ' + kb(bytes) + ' | ' + rows.length)
        await new Promise((r) => setTimeout(r, 0))
      }
      log('')

      // 3. Read cost: this device opens its own copy of M messages
      const me = sodium.crypto_box_keypair()
      log('OPEN: unlock the copies for one reader')
      log('messages | unlock time ms | download KB (own copies only)')
      for (const m of [20, 50, 200]) {
        const copies = []
        for (let i = 0; i < m; i++) {
          const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
          copies.push({ ct: sodium.crypto_box_easy(MESSAGE, nonce, me.publicKey, sender.privateKey), nonce })
        }
        const times = []
        for (let rep = 0; rep < 3; rep++) {
          const t = performance.now()
          for (const c of copies) sodium.crypto_box_open_easy(c.ct, c.nonce, sender.publicKey, me.privateKey)
          times.push(performance.now() - t)
        }
        const bytes = new Blob([JSON.stringify(copies.map((c) => ({ ciphertext: sodium.to_base64(c.ct), nonce: sodium.to_base64(c.nonce) })))]).size
        log(m + ' | ' + ms(median(times)) + ' | ' + kb(bytes))
      }
      log('')
      log('Note: upload time on a real connection is about (upload KB x 8) / Mbps. Add the round trips.')
      log('Done.')
    } catch (e) {
      log('Error: ' + (e?.message || e))
    }
    setRunning(false)
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 640, margin: '0 auto' }}>
      <h2>Scramble speed test</h2>
      <p>Admins only. Nothing is saved. Run it on a slow phone, on mobile data, then copy the result.</p>
      <button type="button" onClick={run} disabled={running} style={{ minHeight: 48, padding: '0.6rem 1.2rem', fontSize: '1rem' }}>
        {running ? 'Running...' : 'Run test'}
      </button>
      <button type="button" onClick={showReal} style={{ minHeight: 48, padding: '0.6rem 1.2rem', fontSize: '1rem', marginLeft: '0.5rem' }}>Show real timings</button>
      {real && (
        <>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', marginTop: '1rem' }}>{real}</pre>
          <button type="button" onClick={() => navigator.clipboard?.writeText(real)} style={{ minHeight: 48, padding: '0.6rem 1.2rem', fontSize: '1rem' }}>Copy real timings</button>
        </>
      )}
      {report && (
        <>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', marginTop: '1rem' }}>{report}</pre>
          <button type="button" onClick={() => navigator.clipboard?.writeText(report)} style={{ minHeight: 48, padding: '0.6rem 1.2rem', fontSize: '1rem' }}>Copy result</button>
        </>
      )}
    </div>
  )
}
