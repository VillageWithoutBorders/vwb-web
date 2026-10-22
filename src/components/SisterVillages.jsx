import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import VillageRiskDialog from './VillageRiskDialog'
import Icon from './Icon'

// Sister Villages, shown on a neighborhood's card on the map.
// Everyone sees which villages are sisters. Full members of a sister can join.
// The keeper asks another village, answers asks, and can end a sister link.

const box = { margin: '0.5rem 0', padding: '0.75rem', border: '1px solid rgba(255, 210, 122, 0.5)', borderRadius: '12px', background: 'rgba(255, 210, 122, 0.08)' }
const row = { display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.35rem 0', flexWrap: 'wrap' }

export default function SisterVillages({ village, villages, sisters, isKeeper, joinOptions, onPick, onChanged }) {
  const navigate = useNavigate()
  const [state, setState] = useState([])
  const [askId, setAskId] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [ending, setEnding] = useState(null)
  const [risk, setRisk] = useState(false)
  const [riskError, setRiskError] = useState('')

  const nameOf = (id) => (villages.find((v) => v.id === id) || {}).name || 'A village'
  const mySisters = sisters
    .filter((s) => s.village_a === village.id || s.village_b === village.id)
    .map((s) => (s.village_a === village.id ? s.village_b : s.village_a))
  const joinVia = joinOptions.find((o) => o.village_id === village.id)

  async function loadState() {
    if (!isKeeper) { setState([]); return }
    const { data, error } = await supabase.rpc('village_sister_state', { p_village: village.id })
    if (error) { console.error('Failed to load sister villages:', error); return }
    setState(data || [])
  }
  useEffect(() => { setNote(''); setEnding(null); setAskId(''); loadState() }, [village.id, isKeeper])

  const askedOfUs = state.filter((s) => s.status === 'asked' && !s.asked_by_us)
  const weAsked = state.filter((s) => s.status === 'asked' && s.asked_by_us)
  const taken = new Set([village.id, ...state.map((s) => s.other_id), ...mySisters])
  const canAsk = villages.filter((v) => !taken.has(v.id)).sort((a, b) => a.name.localeCompare(b.name))

  async function call(fn, args, messages) {
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { console.error('Sister village ' + fn + ' failed:', error); setNote("We couldn't save that. Try again."); return }
    setNote(messages[data] || 'Done.')
    setEnding(null); setAskId('')
    loadState(); onChanged?.()
  }

  function ask() {
    if (!askId) { setNote('Pick a village first.'); return }
    const other = nameOf(askId)
    call('ask_sister_village', { p_mine: village.id, p_other: askId }, {
      asked: 'Asked. The keeper of ' + other + ' will get a notice and can say yes or no.',
      sisters: other + ' had already asked you, so you are now Sister Villages.',
      already: 'You are already Sister Villages.',
      notkeeper: 'Only the keeper of this village can ask.',
      missing: 'We could not find that village.',
      same: 'Pick a different village.',
    })
  }

  async function joinAsSister() {
    setBusy(true); setRiskError('')
    const { data, error } = await supabase.rpc('join_sister_village', { p_village: village.id, p_agreed: true })
    if (error || data !== 'ok') {
      setBusy(false)
      if (error) console.error('Failed to join sister village:', error)
      setRiskError(data === 'removed' ? 'You were removed from this village before, so you cannot join it.' : data === 'notsister' ? 'This village is no longer a sister of yours.' : "We couldn't join you just now. Try again.")
      return
    }
    const { data: boards, error: bErr } = await supabase.from('campfire_boards').select('id').eq('village_id', village.id).limit(1)
    setBusy(false)
    if (bErr) console.error('Failed to find the village chat:', bErr)
    setRisk(false)
    const b = boards && boards[0]
    navigate(b ? '/village-square?board=' + b.id + '&intro=1' : '/find-village')
  }

  if (!mySisters.length && !isKeeper && !joinVia) return null

  return (
    <div style={box}>
      <p style={{ margin: '0 0 0.25rem', fontWeight: 700 }}><Icon name="handshake" /> Sister Villages</p>
      {mySisters.length === 0
        ? <p className="cal-sub" style={{ margin: '0 0 0.25rem' }}>No Sister Villages yet.</p>
        : (
          <div style={row}>
            {mySisters.map((id) => (
              <button key={id} type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => onPick?.(id)}>{nameOf(id)}</button>
            ))}
          </div>
        )}
      <p className="cal-sub" style={{ margin: '0.25rem 0' }}>Sister Villages are villages that chose each other. Members of one can join the other, even outside its zip codes, with a Guest badge. The two villages share a Sister Campfire that anyone in either village can join.</p>

      {joinVia && (
        <>
          <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginTop: '0.25rem' }} disabled={busy} onClick={() => { setRiskError(''); setRisk(true) }}>Join as a sister neighbor</button>
          <p className="cal-sub" style={{ margin: '0.25rem 0 0' }}>You can join because you are in {joinVia.via_village_name}. Everyone here will see that you joined and a Guest badge by your name.</p>
        </>
      )}

      {isKeeper && (
        <div style={{ marginTop: '0.5rem' }}>
          {askedOfUs.map((s) => (
            <div key={s.other_id} className="cal-box" style={{ margin: '0.5rem 0' }}>
              <p style={{ margin: '0 0 0.5rem' }}><b>{s.other_name}</b> asked to be Sister Villages. Their members could join here, and yours could join there.</p>
              <button type="button" className="btn btn-primary btn-full" style={{ minHeight: '44px', marginBottom: '0.5rem' }} disabled={busy} onClick={() => call('answer_sister_village', { p_mine: village.id, p_other: s.other_id, p_accept: true }, { sisters: 'You are now Sister Villages with ' + s.other_name + '.', noask: 'That ask is no longer open.' })}>Say yes</button>
              <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy} onClick={() => call('answer_sister_village', { p_mine: village.id, p_other: s.other_id, p_accept: false }, { declined: 'No problem. ' + s.other_name + ' is not told why.', noask: 'That ask is no longer open.' })}>Not now</button>
            </div>
          ))}
          {weAsked.map((s) => (
            <div key={s.other_id} style={row}>
              <span style={{ flex: 1, minWidth: 0 }}>Waiting on {s.other_name}</span>
              <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} disabled={busy} onClick={() => call('end_sister_village', { p_mine: village.id, p_other: s.other_id }, { ended: 'Ask taken back.', none: 'That ask is already gone.' })}>Take back</button>
            </div>
          ))}
          {mySisters.map((id) => (
            <div key={'end' + id} style={row}>
              <span style={{ flex: 1, minWidth: 0 }}>{ending === id ? 'End with ' + nameOf(id) + '? Your Sister Campfire closes and is deleted for good in 30 days.' : nameOf(id)}</span>
              {ending === id
                ? <>
                    <button type="button" className="btn btn-primary" style={{ minHeight: '44px' }} disabled={busy} onClick={() => call('end_sister_village', { p_mine: village.id, p_other: id }, { ended: 'Sister link ended. Anyone who already joined stays. The Sister Campfire closes and is deleted for good in 30 days.', none: 'That link is already gone.' })}>Yes, end it</button>
                    <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => setEnding(null)}>Keep it</button>
                  </>
                : <button type="button" className="btn btn-outline" style={{ minHeight: '44px' }} onClick={() => setEnding(id)}>End</button>}
            </div>
          ))}
          {canAsk.length > 0 && (
            <>
              <label htmlFor="sister-ask" style={{ display: 'block', margin: '0.5rem 0 0.25rem', fontWeight: 600 }}>Ask a village to be sisters</label>
              <select id="sister-ask" value={askId} onChange={(e) => setAskId(e.target.value)} style={{ width: '100%', minHeight: '44px', fontSize: '1rem', boxSizing: 'border-box', marginBottom: '0.5rem' }}>
                <option value="">Pick a village</option>
                {canAsk.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button type="button" className="btn btn-outline btn-full" style={{ minHeight: '44px' }} disabled={busy || !askId} onClick={ask}>Ask</button>
              <p className="cal-sub" style={{ margin: '0.25rem 0 0' }}>Their keeper decides. Either keeper can end it later.</p>
            </>
          )}
        </div>
      )}
      {note && <p className="cal-sub" role="status" style={{ margin: '0.5rem 0 0', color: 'var(--gold)' }}>{note}</p>}
      {risk && (
        <VillageRiskDialog villageName={village.name} busy={busy} error={riskError} onAgree={joinAsSister} onCancel={() => { if (!busy) setRisk(false) }} />
      )}
    </div>
  )
}
