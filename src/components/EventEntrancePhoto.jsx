import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'
import { useT } from '../utils/lang'

// Nov 11 (Jade): one photo of the way in, for events run by approved groups
// (vwb-event-entrance-photos.sql). The database decides who sees it: signed-in people
// who can see the event, and only people who signed up when the address is hidden.
// The photo is redrawn on this phone before it is sent. That strips the hidden location
// and camera details and keeps it small. It sits in a private storage space and opens
// through a link that stops working after an hour.

const BUCKET = 'event-photos'
const MAX_BYTES = 580 * 1024

function drawTo(canvas, img, max) {
  const w0 = img.width || img.naturalWidth
  const h0 = img.height || img.naturalHeight
  const scale = Math.min(1, max / Math.max(w0, h0))
  canvas.width = Math.max(1, Math.round(w0 * scale))
  canvas.height = Math.max(1, Math.round(h0 * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
}

function toBlob(canvas, type, q) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, q))
}

async function openPicture(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

// Redraw the picture: a new, plain image with nothing hidden inside it.
async function redrawPhoto(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('not-image')
  if (file.size > 30 * 1024 * 1024) throw new Error('too-big')
  const pic = await openPicture(file)
  const canvas = document.createElement('canvas')
  try {
    for (const max of [1200, 1000, 800]) {
      drawTo(canvas, pic, max)
      for (const q of [0.8, 0.65]) {
        let blob = await toBlob(canvas, 'image/webp', q)
        if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q)
        if (blob && blob.size <= MAX_BYTES) return blob
      }
    }
  } finally {
    if (pic.close) pic.close()
  }
  throw new Error('too-big')
}

export default function EventEntrancePhoto({ eventId, user }) {
  const t = useT()
  const [info, setInfo] = useState(null)
  const [src, setSrc] = useState('')
  const [adding, setAdding] = useState(false)
  const [blob, setBlob] = useState(null)
  const [preview, setPreview] = useState('')
  const [alt, setAlt] = useState('')
  const [noPeople, setNoPeople] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [done, setDone] = useState('')
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    if (!user) { setInfo(null); return }
    const { data, error } = await supabase.rpc('event_photo_info', { p_event: Number(eventId) })
    if (error) { if (error.code !== 'PGRST202') console.error('Failed to load the event photo:', error); setInfo(null); return }
    setInfo(data || null)
    if (data?.path) {
      const { data: s, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(data.path, 3600)
      if (sErr) { console.error('Failed to open the event photo:', sErr); setSrc('') } else setSrc(s?.signedUrl || '')
    } else {
      setSrc('')
    }
  }, [eventId, user])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  if (!info) return null
  const { can_manage: manage, can_add: canAdd, can_review: review } = info
  const showing = !!info.path && !!src
  if (!showing && !info.for_signed_up && !info.hidden && !canAdd) return null

  function resetForm() {
    setAdding(false); setBlob(null); setPreview(''); setAlt(''); setNoPeople(false); setNote('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function pick(e) {
    const file = e.target.files && e.target.files[0]
    setNote(''); setBlob(null); setPreview('')
    if (!file) return
    setBusy(true)
    try {
      const b = await redrawPhoto(file)
      setBlob(b); setPreview(URL.createObjectURL(b))
    } catch (err) {
      console.error('Could not get the photo ready:', err)
      setNote(err?.message === 'too-big' ? t('That photo is too big. Try another one.') : t("We couldn't open that photo. Try a JPG or PNG photo."))
      if (fileRef.current) fileRef.current.value = ''
    }
    setBusy(false)
  }

  async function save(e) {
    e.preventDefault()
    setNote('')
    if (!blob) { setNote(t('Pick a photo first.')); return }
    if (!alt.trim()) { setNote(t('Please say what the photo shows.')); return }
    if (!noPeople) { setNote(t('Please check the box to say there are no people in the photo.')); return }
    setBusy(true)
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${Number(eventId)}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '3600', upsert: false })
    if (upErr) {
      console.error('Failed to send the photo:', upErr)
      setBusy(false); setNote(t("We couldn't send the photo. Try again.")); return
    }
    const { data: old, error } = await supabase.rpc('event_photo_set', { p_event: Number(eventId), p_path: path, p_alt: alt.trim(), p_no_people: true })
    if (error) {
      console.error('Failed to save the photo:', error)
      supabase.storage.from(BUCKET).remove([path]).catch(() => {})
      setBusy(false); setNote(['22001', '22023'].includes(error.code) ? error.message : t("We couldn't save that. Try again.")); return
    }
    if (old) supabase.storage.from(BUCKET).remove([old]).then(({ error: rmErr }) => { if (rmErr) console.error('Old photo stays until tonight:', rmErr) })
    setBusy(false); resetForm(); setDone(t('Photo saved.'))
    await load()
  }

  async function removePhoto() {
    if (!(await askConfirm(t('Remove the photo of the way in?'), { yes: t('Remove it'), no: t('Keep it') }))) return
    setBusy(true); setNote('')
    const { data: old, error } = await supabase.rpc('event_photo_clear', { p_event: Number(eventId) })
    if (error) { console.error('Failed to remove the photo:', error); setBusy(false); setNote(t("We couldn't save that. Try again.")); return }
    if (old) await supabase.storage.from(BUCKET).remove([old]).then(({ error: rmErr }) => { if (rmErr) console.error('Photo file erased tonight instead:', rmErr) })
    setBusy(false); setDone(t('Photo removed.'))
    await load()
  }

  async function sendReport(e) {
    e.preventDefault()
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('event_photo_report', { p_event: Number(eventId), p_why: why.trim() || null })
    setBusy(false)
    if (error) { console.error('Failed to report the photo:', error); setNote(error.code === '22023' ? error.message : t("We couldn't send that. Try again.")); return }
    setReporting(false); setWhy(''); setDone(t('Thank you. The photo is hidden while someone checks it.'))
    await load()
  }

  async function showAgain() {
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('event_photo_show_again', { p_event: Number(eventId) })
    setBusy(false)
    if (error) { console.error('Failed to show the photo again:', error); setNote(t("We couldn't save that. Try again.")); return }
    setDone(t('The photo shows again.'))
    await load()
  }

  return (
    <section className="cal-box ep" aria-labelledby="ep-h">
      <h2 id="ep-h">{t('The way in')}</h2>
      {info.hidden && <p className="ep-flag" role="status">{t('This photo is hidden because someone reported it.')}</p>}
      {showing && (
        <figure className="ep-fig">
          <img src={src} alt={info.alt || t('The way in')} loading="lazy" decoding="async" />
        </figure>
      )}
      {!showing && info.for_signed_up && <p className="cal-sub">{t('A photo of the way in is shared with people who sign up.')}</p>}
      {done && <p className="cal-sub" role="status">{done}</p>}

      {showing && !manage && !info.hidden && !reporting && (
        <button type="button" className="link-button ep-report" onClick={() => { setReporting(true); setDone('') }}>{t('Report this photo')}</button>
      )}
      {reporting && (
        <form className="ep-form" onSubmit={sendReport}>
          <label htmlFor="ep-why">{t("What's wrong? (you can skip this)")}</label>
          <textarea id="ep-why" rows={2} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t('For example: It shows a person, or it is the wrong place.')} />
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? t('Sending...') : t('Send report')}</button>
          <button type="button" className="btn btn-outline btn-full" onClick={() => { setReporting(false); setWhy('') }}>{t('Cancel')}</button>
        </form>
      )}

      {info.hidden && review && (
        <div className="cal-actions">
          <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={showAgain}>{t('It looks fine. Show it again')}</button>
        </div>
      )}

      {(manage || review) && (info.path || info.hidden) && !adding && (
        <div className="cal-actions">
          {canAdd && <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={() => { setAdding(true); setDone('') }}>{t('Change the photo')}</button>}
          <button type="button" className="link-button" style={{ color: 'var(--danger)', minHeight: '44px' }} disabled={busy} onClick={removePhoto}>{t('Remove the photo')}</button>
        </div>
      )}
      {canAdd && !info.path && !info.hidden && !adding && (
        <>
          <p className="cal-sub">{t('Add one photo of the door or the way in, so people know where to go.')}</p>
          <button type="button" className="btn btn-outline btn-full" onClick={() => { setAdding(true); setDone('') }}>{t('Add a photo of the way in')}</button>
        </>
      )}

      {adding && (
        <form className="ep-form" onSubmit={save} noValidate>
          <ul className="ep-tips">
            <li>{t('Show the door or the way in, from where people walk up.')}</li>
            <li>{t('No people, faces, license plates, or house numbers of homes.')}</li>
            <li>{t('Your phone makes a clean copy first. Hidden details, like where the photo was taken, are left out.')}</li>
          </ul>
          <label className="btn btn-outline btn-full ep-pick">
            {preview ? t('Pick a different photo') : t('Pick or take a photo')}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" onChange={pick} className="sr-only" />
          </label>
          {busy && !preview && <p role="status">{t('Getting the photo ready...')}</p>}
          {preview && <figure className="ep-fig"><img src={preview} alt={t('The photo you picked')} /></figure>}
          <label htmlFor="ep-alt">{t('What does the photo show?')}</label>
          <input id="ep-alt" type="text" maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={t('For example: The blue side door, next to the ramp.')} />
          <label className="org-default ep-check">
            <input type="checkbox" checked={noPeople} onChange={(e) => setNoPeople(e.target.checked)} />
            <span>{t('No people, faces, license plates, or house numbers are in this photo.')}</span>
          </label>
          <button type="submit" className="btn btn-primary btn-full" disabled={busy || !blob}>{busy ? t('Saving...') : t('Save the photo')}</button>
          <button type="button" className="btn btn-outline btn-full" onClick={resetForm}>{t('Cancel')}</button>
        </form>
      )}
      {note && <p className="form-error" role="alert">{note}</p>}
    </section>
  )
}
