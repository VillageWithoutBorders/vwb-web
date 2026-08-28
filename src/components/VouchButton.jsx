import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

/**
 * VouchButton - lets a user vouch for another user
 * Props:
 *   userId - the person being vouched for
 *   size - 'sm' or 'md' (default 'sm')
 *   showCount - whether to show the vouch count (default true)
 *   onVouchChange - callback when vouch state changes
 */
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
    // Get vouch count
    const { data: countData } = await supabase
      .from('vouches')
      .select('id', { count: 'exact', head: true })
      .eq('vouched_for_id', userId)

    // Check if current user already vouched
    if (user?.id && !isSelf) {
      const { data: existing } = await supabase
        .from('vouches')
        .select('id')
        .eq('voucher_id', user.id)
        .eq('vouched_for_id', userId)
        .maybeSingle()

      setHasVouched(!!existing)
    }

    // Get count from the view
    const { data: vc } = await supabase
      .from('vouch_counts')
      .select('vouch_count')
      .eq('user_id', userId)
      .maybeSingle()

    setVouchCount(vc?.vouch_count || 0)
  }

  async function handleVouch() {
    if (isSelf || hasVouched || loading || !user?.id) return

    setLoading(true)

    const { error } = await supabase
      .from('vouches')
      .insert({
        voucher_id: user.id,
        vouched_for_id: userId,
      })

    if (error) {
      if (error.code === '23505') {
        // Already vouched (unique constraint)
        setHasVouched(true)
      } else {
        console.error('Vouch error:', error)
      }
    } else {
      setHasVouched(true)
      setVouchCount(prev => prev + 1)
      onVouchChange?.()
    }

    setLoading(false)
  }

  // Don't render anything for yourself
  if (isSelf && !showCount) return null

  return (
    <div className={`vouch-container vouch-${size}`}>
      {showCount && vouchCount > 0 && (
        <span className="vouch-count" title={`${vouchCount} neighbor${vouchCount !== 1 ? 's' : ''} vouch for this person`}>
          <span className="vouch-icon" aria-hidden="true">✦</span>
          {vouchCount} vouch{vouchCount !== 1 ? 'es' : ''}
        </span>
      )}

      {!isSelf && user?.id && (
        <button
          className={`vouch-btn vouch-btn-${size} ${hasVouched ? 'vouch-btn-done' : ''}`}
          onClick={handleVouch}
          disabled={hasVouched || loading}
          aria-label={hasVouched ? 'You vouched for this person' : 'Vouch for this person'}
        >
          {loading ? '...' : hasVouched ? '✦ Vouched' : '✦ Vouch'}
        </button>
      )}

      {isSelf && showCount && vouchCount === 0 && (
        <span className="vouch-count vouch-count-empty">No vouches yet</span>
      )}
    </div>
  )
}
