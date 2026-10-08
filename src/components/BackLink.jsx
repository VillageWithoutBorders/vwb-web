import { Link, useLocation, useNavigate } from 'react-router-dom'

// Goes back to the page the person came from. If they opened this page
// directly (a link, a bookmark, a refresh), it goes to the fallback instead.
export default function BackLink({ fallback = '/', fallbackLabel = 'Home', className = 'hub-back' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const cameFromApp = location.key !== 'default'
  return (
    <Link
      to={fallback}
      className={className}
      onClick={cameFromApp ? (e) => { e.preventDefault(); navigate(-1) } : undefined}
    >
      &#8592; {cameFromApp ? 'Back' : fallbackLabel}
    </Link>
  )
}
