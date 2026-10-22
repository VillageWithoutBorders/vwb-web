import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

// Your home village, on your profile (Oct 22). Everyone has one home village,
// set from the zip code on their profile. When more than one village covers
// that zip, you choose. Your other villages are guest links.
export default function HomeVillageRow() {
  const { profile, refreshProfile } = useAuth()
  const [home, setHome] = useState(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('my_home_village').then(({ data, error }) => {
      if (error) { console.error('Failed to load your home village:', error); if (alive) setNote("We couldn't load your home village."); return }
      if (alive) setHome((data || [])[0] || { village_id: null, name: null, choices: [] })
    })
    return () => { alive = false }
  }, [profile?.zip_code, profile?.home_village_id])

  async function choose(id) {
    if (!id || id === home?.village_id) return
    setSaving(true); setNote('')
    const { data, error } = await supabase.rpc('set_my_home_village', { p_village: id })
    setSaving(false)
    if (error || (data !== 'ok' && data !== 'same')) {
      console.error('Failed to change your home village:', error || data)
      setNote("We couldn't change your home village. Try again.")
      return
    }
    setNote('Saved. Your other villages are guest links now.')
    await refreshProfile()
  }

  const choices = Array.isArray(home?.choices) ? home.choices : []

  return (
    <div className="detail-row detail-row-stack">
      <span className="detail-label">Home village</span>
      {home === null && !note && <span className="detail-value">Loading...</span>}
      {home && !home.village_id && (
        <span className="detail-value">
          {profile?.zip_code ? 'No village covers your zip code yet. ' : 'Add your zip code to get a home village. '}
          <Link to="/find-village">Find or start a village</Link>
        </span>
      )}
      {home && home.village_id && choices.length <= 1 && (
        <span className="detail-value"><Link to={'/village/' + home.village_id}>{home.name}</Link></span>
      )}
      {home && home.village_id && choices.length > 1 && (
        <>
          <span className="detail-value">More than one village covers your zip code. Pick your home:</span>
          <select className="home-village-select" value={home.village_id} disabled={saving} onChange={(e) => choose(e.target.value)} aria-label="Your home village">
            {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      )}
      {note && <span className="detail-value" role="status">{note}</span>}
    </div>
  )
}
