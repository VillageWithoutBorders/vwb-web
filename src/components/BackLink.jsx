import { createContext, useContext, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

// The app frame (Layout) shows a Back button at the top of every page (Oct 22, Jade).
// A page that has its own BackLink tells the frame, so there is only ever one.
export const PageBackContext = createContext(null)

// Goes back to the page the person came from. If they opened this page
// directly (a link, a bookmark, a refresh), it goes to the fallback instead.
export default function BackLink({ fallback = '/', fallbackLabel = 'Home', className = 'hub-back' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const cameFromApp = location.key !== 'default'
  const tellFrame = useContext(PageBackContext)
  useEffect(() => {
    if (!tellFrame) return
    tellFrame(1)
    return () => tellFrame(-1)
  }, [tellFrame])
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

// For back arrows: go to the previous page in the app, or to the fallback
// when the page was opened directly.
export function useGoBack() {
  const navigate = useNavigate()
  const location = useLocation()
  return (fallback = '/') => {
    if (location.key !== 'default') navigate(-1)
    else navigate(fallback)
  }
}

// The Back button the app frame shows on pages without their own.
export function FrameBack({ world }) {
  const navigate = useNavigate()
  const location = useLocation()
  const cameFromApp = location.key !== 'default'
  return (
    <div className={'app-back-row' + (world ? ' app-back-world' : '')}>
      <Link to="/world" className="app-back" onClick={cameFromApp ? (e) => { e.preventDefault(); navigate(-1) } : undefined}>
        <span aria-hidden="true">&#8592;</span> {cameFromApp ? 'Back' : 'Home'}
      </Link>
    </div>
  )
}
