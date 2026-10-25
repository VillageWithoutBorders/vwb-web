import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { CATEGORIES } from '../utils/resourceCategories'
import { getMyLocation } from '../utils/location'
import Icon from './Icon'
import '../find-help.css'

// "Suggest a resource" (Oct 25). One button, then one question:
//   1. I know a resource that isn't listed  -> name, what they offer, how to reach them
//   2. My area is missing a kind of help     -> which kind, where, what you need
// Suggestions go to Hope Ambassadors and VWB admins (vwb-resource-suggestions.sql).
// Nothing goes live on its own.

const KINDS = CATEGORIES.filter((c) => c !== 'Give and Get Involved')
const EMPTY = { name: '', details: '', phone: '', url: '', place: '', how: '', category: '' }

export default function SuggestResource({ category = '', label = 'Suggest a resource', className = 'btn btn-outline btn-full' }) {
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('pick')
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sheetRef = useRef(null)
  const lastFocus = useRef(null)

  useEffect(() => {
    if (!open) return
    const first = sheetRef.current && sheetRef.current.querySelector('button, input, select, textarea')
    if (first) first.focus()
    function onKey(e) { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null

  function start() {
    lastFocus.current = document.activeElement
    const here = getMyLocation(profile)
    setForm({ ...EMPTY, category: KINDS.includes(category) ? category : '', place: (here && here.label) || profile?.zip_code || '' })
    setStep('pick'); setError(''); setOpen(true)
  }
  function close() {
    setOpen(false)
    if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus()
  }
  const field = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError('') }

  async function send(e) {
    e.preventDefault()
    const kind = step === 'resource' ? 'resource' : 'gap'
    if (kind === 'resource' && !form.name.trim()) { setError('Add the name of the resource.'); document.getElementById('sr-name')?.focus(); return }
    if (kind === 'gap' && !form.category) { setError('Pick the kind of help your area is missing.'); document.getElementById('sr-cat')?.focus(); return }
    setBusy(true); setError('')
    const { error: err } = await supabase.rpc('suggest_resource', {
      p_kind: kind,
      p_category: form.category || null,
      p_name: kind === 'resource' ? form.name : null,
      p_details: form.details,
      p_phone: kind === 'resource' ? form.phone : null,
      p_url: kind === 'resource' ? form.url : null,
      p_place: form.place,
      p_how_known: kind === 'resource' ? form.how : null,
    })
    setBusy(false)
    if (err) {
      console.error('Failed to send resource suggestion:', err)
      const ours = ['P0001', '22023', '22001', '28000', '42501'].includes(err.code)
      setError(ours ? err.message : "We couldn't send that. Check your connection and try again.")
      return
    }
    setStep('done')
  }

  return (
    <>
      <button type="button" className={className} onClick={start}>
        <Icon name="books" /> {label}
      </button>

      {open && (
        <div className="sr-shade" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
          <div className="sr-sheet" role="dialog" aria-modal="true" aria-labelledby="sr-title" ref={sheetRef}>
            {step === 'pick' && <>
              <h2 id="sr-title">Suggest a resource</h2>
              <p className="sr-note">Thank you for helping your neighbors find help. What would you like to tell us?</p>
              <button type="button" className="sr-choice" onClick={() => setStep('resource')}>
                <span aria-hidden="true" className="sr-choice-ic"><Icon name="books" size={32} /></span>
                <span className="sr-choice-text">
                  <b>I know a resource that isn't listed</b>
                  <small>A food pantry, a clinic, a hotline, or another place that helps.</small>
                </span>
              </button>
              <button type="button" className="sr-choice" onClick={() => setStep('gap')}>
                <span aria-hidden="true" className="sr-choice-ic"><Icon name="pin" size={32} /></span>
                <span className="sr-choice-text">
                  <b>My area is missing a kind of help</b>
                  <small>Tell us what is hard to find near you, so local groups and Hope Ambassadors can work on it.</small>
                </span>
              </button>
              <button type="button" className="btn btn-outline btn-full" onClick={close}>Cancel</button>
            </>}

            {step === 'resource' && (
              <form className="sr-form" onSubmit={send} noValidate>
                <h2 id="sr-title">Tell us about the resource</h2>
                <p className="sr-note">A Hope Ambassador or VWB admin checks it before it is added. Only the name is required.</p>

                <label htmlFor="sr-name">Name of the place or program (required)</label>
                <input id="sr-name" type="text" autoComplete="organization" maxLength={120} value={form.name} onChange={field('name')} aria-invalid={error && !form.name.trim() ? 'true' : undefined} placeholder="For example, Ringgold Food Pantry" />

                <label htmlFor="sr-cat">Kind of help (optional)</label>
                <select id="sr-cat" value={form.category} onChange={field('category')}>
                  <option value="">Not sure</option>
                  {KINDS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <label htmlFor="sr-details">What do they offer?</label>
                <textarea id="sr-details" rows={3} maxLength={1000} value={form.details} onChange={field('details')} placeholder="Who it is for, when they are open, anything to bring" />

                <label htmlFor="sr-phone">Phone number</label>
                <input id="sr-phone" type="tel" inputMode="tel" autoComplete="off" maxLength={40} value={form.phone} onChange={field('phone')} />

                <label htmlFor="sr-url">Website or social page</label>
                <input id="sr-url" type="url" inputMode="url" autoComplete="off" maxLength={300} placeholder="https://" value={form.url} onChange={field('url')} />

                <label htmlFor="sr-place">Town or address</label>
                <input id="sr-place" type="text" autoComplete="off" maxLength={200} value={form.place} onChange={field('place')} />

                <label htmlFor="sr-how">How do you know about it? (optional)</label>
                <input id="sr-how" type="text" autoComplete="off" maxLength={300} value={form.how} onChange={field('how')} placeholder="I went there, a friend told me, I saw a flyer" />

                {error && <p className="sr-error" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Sending...' : 'Send suggestion'}</button>
                <button type="button" className="btn btn-outline btn-full" onClick={() => { setStep('pick'); setError('') }}>Back</button>
              </form>
            )}

            {step === 'gap' && (
              <form className="sr-form" onSubmit={send} noValidate>
                <h2 id="sr-title">What is missing near you?</h2>
                <p className="sr-note">This helps local groups and Hope Ambassadors see where help is needed.</p>

                <label htmlFor="sr-cat">Kind of help (required)</label>
                <select id="sr-cat" value={form.category} onChange={field('category')} aria-invalid={error && !form.category ? 'true' : undefined}>
                  <option value="">Choose one</option>
                  {KINDS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <label htmlFor="sr-place">Your town or zip code</label>
                <input id="sr-place" type="text" autoComplete="off" maxLength={200} value={form.place} onChange={field('place')} />

                <label htmlFor="sr-details">What do you need that you can't find? (optional)</label>
                <textarea id="sr-details" rows={3} maxLength={1000} value={form.details} onChange={field('details')} placeholder="For example, a food pantry open on weekends, or rides to the doctor" />

                {error && <p className="sr-error" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primary btn-full" disabled={busy}>{busy ? 'Sending...' : 'Send suggestion'}</button>
                <button type="button" className="btn btn-outline btn-full" onClick={() => { setStep('pick'); setError('') }}>Back</button>
              </form>
            )}

            {step === 'done' && <>
              <h2 id="sr-title">Thank you</h2>
              <p className="sr-note" role="status">Your suggestion was sent to Hope Ambassadors and VWB admins. They will look into it.</p>
              <button type="button" className="btn btn-primary btn-full" onClick={close}>Done</button>
            </>}
          </div>
        </div>
      )}
    </>
  )
}
