import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { askConfirm } from './AdminDialog'
import { useT } from '../utils/lang'

// Settings > Account and privacy: village chats near your zip code (Round A4, Nov 10).
// Moved here from your profile. Turning it on goes to the list of villages, where you read
// the warning and join. Turning it off leaves every village chat.
export default function VillageChatsSwitch() {
  const t = useT()
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  async function toggle(on) {
    setNote('')
    if (on) { navigate('/find-village'); return }
    if (!(await askConfirm(t('Leave all your village chats? You can join again any time.')))) return
    setSaving(true)
    const { error } = await supabase.rpc('leave_all_villages')
    setSaving(false)
    if (error) { console.error('Failed to leave village chats:', error); setNote(t("We couldn't do that. Check your connection and try again.")); return }
    await refreshProfile()
  }

  return (
    <div className="profile-details">
      <div className="detail-section-header">{t('Village chats')}</div>
      <div className="detail-row detail-row-stack">
        <label className="checkbox-field profile-village-choice">
          <input type="checkbox" checked={profile?.village_opt_in === true} disabled={saving} onChange={(e) => toggle(e.target.checked)} />
          <span>
            <strong>{t('Show me village chats near my zip code')}</strong>
            <small>{t('Turn off to leave nearby village chats. You can turn it back on.')}</small>
          </span>
        </label>
        <Link to="/find-village" className="profile-village-link">{t('Find or start a village chat')} &#8250;</Link>
        {note && <p className="form-error" role="alert">{note}</p>}
      </div>
    </div>
  )
}
