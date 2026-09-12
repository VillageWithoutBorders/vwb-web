import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function reportError(context, error) {
  if (!error) return false
  console.error(`[AvatarDisplay:${context}]`, error)
  return true
}

export default function AvatarDisplay({ url, userId, size = 32 }) {
  const navigate = useNavigate()
  const src = url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${userId || 'default'}`
  const [showPopup, setShowPopup] = useState(false)
  const [info, setInfo] = useState(null)

  async function loadInfo() {
    if (info || !userId) return
    const { data: p, error: pErr } = await supabase.from('helper_profiles_public').select('display_name, is_hope_ambassador, role, created_at').eq('user_id', userId).maybeSingle()
    reportError('loadInfo:profile', pErr)
    const { data: rep, error: repErr } = await supabase.from('user_reputation').select('net_score, upvotes, downvotes').eq('user_id', userId).maybeSingle()
    reportError('loadInfo:reputation', repErr)
    const { count: vouchCount, error: vouchCountErr } = await supabase.from('vouches').select('*', { count: 'exact', head: true }).eq('vouchee_id', userId)
    reportError('loadInfo:vouchCount', vouchCountErr)
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    reportError('loadInfo:auth', authErr)
    const myId = authData?.user?.id
    let hasVouched = false
    let myVote = null
    if (myId && myId !== userId) {
      const { data: myVouch, error: myVouchErr } = await supabase.from('vouches').select('id').eq('voucher_id', myId).eq('vouchee_id', userId).maybeSingle()
      reportError('loadInfo:myVouch', myVouchErr)
      hasVouched = !!myVouch
      const { data: voteData, error: voteErr } = await supabase.from('user_votes').select('vote').eq('voter_id', myId).eq('voted_for_id', userId).maybeSingle()
      reportError('loadInfo:myVote', voteErr)
      myVote = voteData?.vote || null
    }
    setInfo({
      name: p?.display_name || 'Neighbor',
      ambassador: p?.is_hope_ambassador || false,
      role: p?.role || null,
      joined: p?.created_at || null,
      score: rep?.net_score || 0,
      vouches: vouchCount || 0,
      hasVouched,
      myVote,
    })
  }

  async function castVote(e, voteValue) {
    e.stopPropagation()
    if (!info) return
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    reportError('castVote:auth', authErr)
    const myId = authData?.user?.id
    if (!myId || myId === userId) return
    if (info.myVote === voteValue) {
      const { error } = await supabase.from('user_votes').delete().eq('voter_id', myId).eq('voted_for_id', userId)
      if (reportError('castVote:delete', error)) return
      setInfo(prev => ({ ...prev, score: prev.score - voteValue, myVote: null }))
    } else {
      const scoreDiff = info.myVote ? voteValue - info.myVote : voteValue
      const { error } = await supabase.from('user_votes').upsert({ voter_id: myId, voted_for_id: userId, vote: voteValue, updated_at: new Date().toISOString() }, { onConflict: 'voter_id,voted_for_id' })
      if (reportError('castVote:upsert', error)) return
      setInfo(prev => ({ ...prev, score: prev.score + scoreDiff, myVote: voteValue }))
    }
  }

  async function toggleVouch(e) {
    e.stopPropagation()
    if (!info) return
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    reportError('toggleVouch:auth', authErr)
    const myId = authData?.user?.id
    if (!myId || myId === userId) return
    if (info.hasVouched) {
      const { error } = await supabase.from('vouches').delete().eq('voucher_id', myId).eq('vouchee_id', userId)
      if (reportError('toggleVouch:delete', error)) return
      setInfo(prev => ({ ...prev, vouches: prev.vouches - 1, hasVouched: false }))
    } else {
      const { error } = await supabase.from('vouches').insert({ voucher_id: myId, vouchee_id: userId })
      if (reportError('toggleVouch:insert', error)) return
      setInfo(prev => ({ ...prev, vouches: prev.vouches + 1, hasVouched: true }))
    }
  }

  function handleClick(e) {
    e.stopPropagation()
    if (!userId) return
    loadInfo()
    setShowPopup(true)
  }

  return (
    <>
      <img
        src={src}
        alt=""
        onClick={handleClick}
        style={{
          width: size + 'px',
          height: size + 'px',
          borderRadius: '50%',
          background: '#222',
          border: '1px solid #333',
          flexShrink: 0,
          objectFit: 'cover',
          cursor: userId ? 'pointer' : 'default',
        }}
      />
      {showPopup && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setShowPopup(false) }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#1e1e1e', border: '1px solid #333', borderRadius: '16px', padding: '1.25rem', zIndex: 1101, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <img src={src} alt="" style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#222', border: '2px solid #333' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>{info?.name || 'Loading...'}</div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                  {info?.role === 'founder' && <span style={{ fontSize: '0.6rem', background: '#3a1a4a', color: '#c77dff', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>Founder</span>}
                  {info?.role === 'admin' && <span style={{ fontSize: '0.6rem', background: '#1a3a5a', color: '#66aaff', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>Admin</span>}
                  {info?.ambassador && <span style={{ fontSize: '0.6rem', background: '#1a4a3a', color: '#4ecca3', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>Hope Ambassador</span>}
                </div>
              </div>
            </div>
            {info && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '0.35rem', background: '#222', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  <button onClick={(e) => castVote(e, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: info.myVote === 1 ? '#4ecca3' : '#666', padding: '2px' }}>&#9650;</button>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: info.score > 0 ? '#4ecca3' : info.score < 0 ? '#ff6666' : '#888', lineHeight: 1 }}>{info.score > 0 ? '+' : ''}{info.score}</div>
                    <div style={{ fontSize: '0.6rem', color: '#888' }}>Rep</div>
                  </div>
                  <button onClick={(e) => castVote(e, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: info.myVote === -1 ? '#ff6666' : '#666', padding: '2px' }}>&#9660;</button>
                </div>
                <div onClick={toggleVouch} style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: info.hasVouched ? '#1a4a3a' : '#222', borderRadius: '8px', cursor: 'pointer', border: info.hasVouched ? '1px solid #4ecca3' : '1px solid transparent', transition: 'all 0.2s' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#4ecca3' }}>{info.vouches}</div>
                  <div style={{ fontSize: '0.65rem', color: info.hasVouched ? '#4ecca3' : '#888' }}>{info.hasVouched ? 'Vouched' : 'Vouch'}</div>
                </div>
                {info.joined && (
                  <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: '#222', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#fff' }}>{new Date(info.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
                    <div style={{ fontSize: '0.65rem', color: '#888' }}>Joined</div>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={(e) => { e.stopPropagation(); setShowPopup(false) }} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Close</button>
              <button onClick={(e) => { e.stopPropagation(); setShowPopup(false); navigate('/u/' + userId) }} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>View Profile</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}