import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Your avatar from the avatar builder, or the same drawn one others see.
// The first letter of your name shows only if the picture can't load.
export default function MyAvatar({ size = 26, className = 'me-btn-img', letterClass = 'me-btn-letter' }) {
  const { user, profile } = useAuth()
  const [failed, setFailed] = useState(false)
  const letter = ((profile?.display_name || '').trim().charAt(0) || '?').toUpperCase()
  const src = profile?.avatar_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + (user?.id || 'default')
  if (failed) return <span className={letterClass} aria-hidden="true" style={{ width: size, height: size }}>{letter}</span>
  return <img className={className} src={src} alt="" width={size} height={size} onError={() => setFailed(true)} />
}
