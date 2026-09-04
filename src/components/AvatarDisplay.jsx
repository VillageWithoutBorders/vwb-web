import { supabase } from '../supabaseClient'

export default function AvatarDisplay({ url, userId, size = 32 }) {
  const src = url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${userId || 'default'}`
  return (
    <img
      src={src}
      alt=""
      style={{
        width: size + 'px',
        height: size + 'px',
        borderRadius: '50%',
        background: '#222',
        border: '1px solid #333',
        flexShrink: 0,
        objectFit: 'cover',
      }}
    />
  )
}
