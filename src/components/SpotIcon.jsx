// The picture for a spot on the Village or Organization map.
// Pictures live in public/art/icons. Swap a file there (same name) to change it.
// Falls back to the emoji if a spot has no icon.
export default function SpotIcon({ spot, size = 56 }) {
  if (!spot.icon) return <>{spot.em}</>
  return <img className="vs-icon" src={'/art/icons/' + spot.icon + '.svg'} alt="" width={size} height={size} draggable="false" />
}
