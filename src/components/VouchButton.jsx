import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { createNotification } from '../utils/notificationHelpers'

export default function VouchButton({ userId, size = 'sm', showCount = true, onVouchChange }) {
  const { user } = useAuth()
  const [vouchCount, setVouchCount] = useState(0)
  const [hasVouched, setHasVouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const isSelf = user?.id === userId

  useEffect(() => {
    if (!userId) return
    loadVouchData()
  }, [userId, user?.id])

  async function loadVouchData() {
    if (user?.id && !isSelf) {
      const { data: existing } = await supabase
        .from('vouches')
        .select('id')
        .eq('voucher_id', user.id)
        .eq('vouched_for_id', userId)
        .maybeSingle()
      setHasVouched(!!existing)
    }
    const { data: vc } = await supabase
      .from('vouch_counts')
      .select('vouch_count')
      .eq('user_id', userId)
      .maybeSingle()
    setVouchCount(vc?.vouch_count || 0)
  }

  async function handleVouch() {
    if (isSelf || loading || !user?.id) return
    setLoading(true)

    if (hasVouched) {
      const { error } = await supabase
        .from('vouches')
        .delete()
        .eq('voucher_id', user.id)
        .eq('vouched_for_id', userId)
      if (!error) {
        setHasVouched(false)
        setVouchCount(prev => Math.max(0, prev - 1))
        onVouchChange?.()
      } else {
        console.error('Unvouch error:', error)
      }
    } else {
      const { error } = await supabase
        .from('vouches')
        .insert({ voucher_id: user.id, vouched_for_id: userId })
      if (error) {
        if (error.code === '23505') {
          setHasVouched(true)
        } else {
          console.error('Vouch error:', error)
        }
      } else {
        setHasVouched(true)
        setVouchCount(prev => prev + 1)
        createNotification({ userId, type: 'vouch', title: 'Someone vouched for you!', body: 'A neighbor believes in you.', link: '/profile' })
        onVouchChange?.()
      }
    }
    setLoading(false)
  }

  if (isSelf && !showCount) return null

  return (
    <div className={`vouch-container vouch-${size}`}>
      {showCount && vouchCount > 0 && (
        <span className="vouch-count" title={`${vouchCount} neighbor${vouchCount !== 1 ? 's' : ''} vouch for this person`}>
          &#10022; {vouchCount} vouch{vouchCount !== 1 ? 'es' : ''}
        </span>
      )}
      {!isSelf && user?.id && (
        <button
          className={`vouch-btn vouch-btn-${size} ${hasVouched ? 'vouch-btn-done' : ''}`}
          onClick={handleVouch}
          disabled={loading}
          aria-label={hasVouched ? 'Remove your vouch' : 'Vouch for this person'}
        >
          {loading ? '...' : hasVouched ? '\u2726 Vouched' : '\u2726 Vouch'}
        </button>
      )}
      {isSelf && showCount && vouchCount === 0 && (
        <span className="vouch-count vouch-count-empty">No vouches yet</span>
      )}
    </div>
  )
}