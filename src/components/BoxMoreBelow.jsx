import { useEffect, useState } from 'react'
import { useT } from '../utils/lang'
import { calmMotion } from '../utils/motion'

// Nov 8 (Jade): "More below" for pop-ups that scroll inside themselves (My Tools).
// A soft fade and a small button at the bottom of the box when something is hidden.
// It goes away once you start scrolling or when everything already fits.
// Put it as the last thing inside the scrolling box; boxRef points at that box.
export default function BoxMoreBelow({ boxRef, label = 'More below' }) {
  const t = useT()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    function check() {
      const left = box.scrollHeight - box.clientHeight - box.scrollTop
      setShow(box.scrollTop < 40 && left > 24)
    }
    check()
    const tm = setTimeout(check, 600)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    if (ro) { ro.observe(box); for (const c of box.children) ro.observe(c) }
    box.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => { clearTimeout(tm); if (ro) ro.disconnect(); box.removeEventListener('scroll', check); window.removeEventListener('resize', check) }
  }, [boxRef])
  if (!show) return null
  function go() {
    const box = boxRef.current
    if (box) box.scrollBy({ top: Math.round(box.clientHeight * 0.6), behavior: calmMotion() ? 'auto' : 'smooth' })
  }
  return (
    <div className="box-more">
      <button type="button" className="vs-more-desk-btn" onClick={go}>
        {t(label)} <span aria-hidden="true">&#8595;</span>
      </button>
    </div>
  )
}
