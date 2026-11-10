import { useEffect, useState } from 'react'
import { useT } from '../utils/lang'
import { WHAT_EVENT, WHAT_STATE } from './HoverTips'

// "What is this?" (Nov 10, Jade). A round ? just above the bottom bar. Tap it, then tap
// anything: a short note says what it is, and the thing itself does not open.
// The notes are the same ones a mouse sees (HoverTips.jsx, data/hoverTips.js).
// Hidden for a mouse on a big screen, where resting on a button already shows the note.
export default function WhatButton() {
  const t = useT()
  const [on, setOn] = useState(false)
  useEffect(() => {
    const f = (e) => setOn(!!e.detail)
    window.addEventListener(WHAT_STATE, f)
    return () => window.removeEventListener(WHAT_STATE, f)
  }, [])
  return (
    <button type="button" className={'what-btn' + (on ? ' on' : '')} data-what-btn data-no-hold data-tour="what" aria-pressed={on}
      aria-label={t('What is this? Tap here, then tap anything to see what it is.')}
      onClick={() => window.dispatchEvent(new Event(WHAT_EVENT))}>
      <span aria-hidden="true">?</span>
    </button>
  )
}
