import { useState } from 'react'
import { supabase } from '../supabaseClient'
import AddressLink from './AddressLink'

// An organizer finds a resource in the Library and asks to claim it. An admin
// reviews every claim, so a fake claim can't take over a real listing.
const inputStyle = { display: 'block', width: '100%', boxSizing: 'border-box', minHeight: '48px', padding: '0.5rem 0.75rem', marginBottom: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '1rem', fontFamily: 'inherit' }

export default function OrgClaimResource({ orgId, onDone }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [picked, setPicked] = useState(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function reset() { setOpen(false); setQuery(''); setResults(null); setPicked(null); setWhy('') }

  async function search(e) {
    e.preventDefault()
    setMsg(''); setPicked(null)
    if (query.trim().length < 2) { setMsg('Type at least 2 letters of the name.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('search_claimable_resources', { p_org: orgId, p_query: query })
    setBusy(false)
    if (error) { console.error('search_claimable_resources', error); setMsg("Couldn't search right now."); return }
    setResults(data || [])
  }

  async function send(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('request_resource_claim', { p_org: orgId, p_resource: picked.id, p_note: why })
    setBusy(false)
    if (error) { console.error('request_resource_claim', error); setMsg(error.message && error.message.includes('already asked') ? error.message : "Couldn't send. Try again."); return }
    const name = picked.name
    reset()
    setMsg('Sent. An admin will review your claim on "' + name + '". You will get an alert when it is decided.')
    if (onDone) onDone()
  }

  const btn = { minHeight: '44px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }

  if (!open) {
    return (
      <div style={{ marginTop: '0.75rem' }}>
        <button type="button" onClick={() => { setMsg(''); setOpen(true) }} style={btn}>Claim a resource that is already listed</button>
        {msg && <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{msg}</p>}
      </div>
    )
  }

  return (
    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#1e1e1e', border: '1px solid #4ecca3', borderRadius: '10px' }}>
      <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>Claim a resource</h3>
      <p style={{ margin: '0 0 0.6rem', fontSize: '0.9rem', color: '#ccc' }}>Find it by name. An admin approves every claim. Once approved, your organizers can edit it.</p>
      <form onSubmit={search}>
        <label htmlFor="claim-q" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Resource name</label>
        <input id="claim-q" type="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} style={inputStyle} />
        <button type="submit" disabled={busy} style={{ ...btn, marginBottom: '0.6rem' }}>{busy && !picked ? 'Searching...' : 'Search'}</button>
      </form>
      {results && results.length === 0 && <p style={{ fontSize: '0.9rem', color: '#ccc' }}>Nothing found. If it is not listed, use Add resource instead.</p>}
      {results && results.length > 0 && !picked && (
        <ul style={{ listStyle: 'none', margin: '0 0 0.6rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" disabled={r.claim_waiting} onClick={() => setPicked(r)} style={{ width: '100%', textAlign: 'left', minHeight: '48px', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '1rem', cursor: r.claim_waiting ? 'default' : 'pointer', overflowWrap: 'anywhere' }}>
                <strong>{r.name}</strong>
                {r.address && <span style={{ display: 'block', fontSize: '0.85rem', color: '#aaa' }}><AddressLink address={r.address} /></span>}
                {r.held_by && <span style={{ display: 'block', fontSize: '0.85rem', color: '#e0b84c' }}>Now listed under {r.held_by}. An admin will decide.</span>}
                {r.claim_waiting && <span style={{ display: 'block', fontSize: '0.85rem', color: '#e0b84c' }}>You already asked. Waiting for an admin.</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <form onSubmit={send}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{picked.name}</p>
          <label htmlFor="claim-why" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>How do you run or manage this? (helps the admin check)</label>
          <textarea id="claim-why" rows={3} maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>{busy ? 'Sending...' : 'Send claim'}</button>
            <button type="button" onClick={() => setPicked(null)} style={{ flex: 1, minHeight: '48px', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#ccc', fontSize: '1rem', cursor: 'pointer' }}>Back</button>
          </div>
        </form>
      )}
      {msg && <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{msg}</p>}
      <button type="button" onClick={reset} style={{ marginTop: '0.5rem', minHeight: '44px', padding: '0 0.25rem', background: 'none', border: 'none', color: '#aaa', fontSize: '1rem', cursor: 'pointer' }}>Close</button>
    </div>
  )
}
