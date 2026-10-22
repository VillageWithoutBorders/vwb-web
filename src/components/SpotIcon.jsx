import { useState } from 'react'

// The picture for a spot on the Village or Organization map.
// Pictures live in public/art/icons. Swap a file there (same name) to change it.
// A spot can also have painted art (spot.art, a building on the village
// path). Pass painted to use it; until that file exists, the round badge shows.
// Falls back to the emoji if a spot has no icon.
export default function SpotIcon({ spot, size = 56, painted = false }) {
  const [artFailed, setArtFailed] = useState(false)
  if (painted && spot.art && !artFailed) {
    return <img className="vs-icon vs-art" src={spot.art} alt="" width={size * 2} height={size * 2} draggable="false" onError={() => setArtFailed(true)} />
  }
  if (!spot.icon) return <>{spot.em}</>
  return <img className="vs-icon" src={'/art/icons/' + spot.icon + '.svg'} alt="" width={size} height={size} draggable="false" />
}
