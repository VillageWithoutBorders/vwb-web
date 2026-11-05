import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../utils/lang'

// For Hope Ambassadors (and the founder): villages they live in that have no
// Keeper, or whose Keeper hasn't opened VWB in 60 days. Pick a neighbor from
// the village to ask. Nothing changes until that neighbor says yes.
// The database checks every rule again (vwb-roles-step5.sql).

export default function FindAKeeper() {
  const t = useT()
  const [villages, setVillages] = useState([])
  const [openFor, setOpenFor] = useState(null)
  const [people, setPeople] = useState([])
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    supabase.rpc('villages_needing_keeper').then(({ data, error }) => {
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load villages needing a Keeper:', error); return }
      setVillages(data || [])
    })
  }, [])
  useEffect(() => { load() }, [load])

  async function openAsk(v) {
    setOpenFor(v.village_id); setPick(''); setNote(''); setPeople([])
    const { data, error } = await supabase.rpc('village_people', { p_village: v.village_id, p_search: null, p_limit: 200 })
    if (error) { console.error('Failed to load village people:', error); setNote(t("The people list didn't load. Try again.")); return }
    setPeople(data || [])
  }

  async function ask(v) {
    if (!pick) { setNote(t('Pick a neighbor to ask.')); return }
    setBusy(true); setNote('')
    const { error } = await supabase.rpc('offer_keeper', { p_village: v.village_id, p_person: pick })
    setBusy(false)
    if (error) { console.error('Failed to ask a Keeper:', error); setNote(error.message && error.message.length < 160 ? error.message : t("That didn't send. Try again.")); return }
    setOpenFor(null)
    setNote(t('Asked. They get an alert, and nothing changes until they say yes.'))
    load()
  }

  if (villages.length === 0) return note ? <p className="amb-note" role="status">{note}</p> : null

  return (
    <section className="amb-box" aria-labelledby="amb-keeper">
      <h2 id="amb-keeper">{t('Villages that need a Keeper')}</h2>
      <p className="amb-note">{t('Every village needs someone to look after it. You can ask a neighbor who lives there and has been on VWB a while. They choose whether to say yes.')}</p>
      {villages.map((v) => (
        <div key={v.village_id} style={{ marginBottom: '0.75rem' }}>
          <p style={{ margin: '0 0 0.4rem' }}>
            <strong>{v.village_name}</strong>{' '}
            <small>{v.keeper_name ? t("{name} keeps it, but hasn't opened VWB in 60 days.", { name: v.keeper_name }) : t('No one keeps it right now.')}</small>
            {v.waiting_offer_to && <small> {t('Waiting on {name} to answer.', { name: v.waiting_offer_to })}</small>}
          </p>
          {openFor === v.village_id ? (
            <>
              <label htmlFor={'fk-' + v.village_id} className="sr-only">{t('Neighbor to ask')}</label>
              <select id={'fk-' + v.village_id} value={pick} onChange={(e) => { setPick(e.target.value); setNote('') }}
                style={{ width: '100%', minHeight: 44, fontSize: '1rem', marginBottom: '0.5rem' }}>
                <option value="">{t('Pick a neighbor')}</option>
                {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name || t('A neighbor')}</option>)}
              </select>
              <button type="button" className="btn btn-primary btn-full amb-btn" disabled={busy || !pick} onClick={() => ask(v)}>{busy ? t('Asking...') : t('Ask them to be Keeper')}</button>
              <button type="button" className="btn btn-outline btn-full amb-btn" disabled={busy} onClick={() => setOpenFor(null)}>{t('Cancel')}</button>
            </>
          ) : (
            <button type="button" className="btn btn-outline btn-full amb-btn" onClick={() => openAsk(v)}>
              {v.waiting_offer_to ? t('Ask someone else') : t('Ask a neighbor')}
            </button>
          )}
        </div>
      ))}
      {note && <p className="amb-note" role="status">{note}</p>}
    </section>
  )
}
