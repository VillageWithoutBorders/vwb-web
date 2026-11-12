import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { saveSkin, usePickedSkin, SKINS } from '../utils/skin'
import { useSimpleView } from '../utils/simpleView'
import { useT, getLang } from '../utils/lang'
import { SKIN_WORDS } from '../data/skinWords'

// Settings > Easy to use > Seeing: "Choose your story" (Nov 11, Jade). Skins change only
// the look and some place names. Buttons stay the same. Saved on the account, like
// Simple view. Simple view always uses Home Place, so the choice is hidden there.
const NAMES = { home: 'Home Place', space: 'Space Station', mycelium: 'Mycelium', fairy: 'Fairy Ring' }
const TIPS = {
  home: 'Use the Home Place look. This is how the app has always looked.',
  space: 'Use the Space Station look: night blues, and space names for your places.',
  mycelium: 'Use the Mycelium look: forest browns, and forest names for your places.',
  fairy: 'Use the Fairy Ring look: sea-glass blues, and meadow names for your places.',
}
// A small row of each skin's colors (page, top bar, tile, chip). Pictures only.
const COLORS = {
  home: ['#1b3838', '#2E4D46', '#234a48', '#3fbf9f'],
  space: ['#0A1024', '#1B2742', '#1F2E52', '#A9B6E8'],
  mycelium: ['#17110C', '#3A2C20', '#3A2E22', '#C2AE84'],
  fairy: ['#0E1A24', '#1E3A44', '#22404A', '#9CC9D9'],
}
const PLACES = ['My World', 'My Village', 'My Cottage', 'My Corner']

// The skin's place names in the picked language, straight from the table
// (t() would give the names of the skin that is on right now).
function placeLine(sk) {
  const es = getLang() === 'es'
  return PLACES.map((en) => sk === 'home' ? (es ? SKIN_WORDS[en].es : en) : SKIN_WORDS[en][sk][es ? 1 : 0]).join(', ')
}

export default function StoryPicker() {
  const t = useT()
  const { refreshProfile } = useAuth()
  const simple = useSimpleView()
  const picked = usePickedSkin()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function choose(sk) {
    if (sk === picked) return
    setBusy(true); setNote('')
    const ok = await saveSkin(sk)
    if (refreshProfile) await refreshProfile()
    setBusy(false)
    setNote(ok ? '' : "Saved on this phone. We couldn't save it to your account, so try again later.")
  }

  return (
    <div className="profile-details" style={{ marginBottom: '1rem' }}>
      <div className="detail-section-header" id="story-h">{t('Choose your story')}</div>
      {simple ? (
        <p style={{ margin: 0, padding: '0.5rem 1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('Simple view uses the Home Place look. Turn off Simple view to pick a story.')}</p>
      ) : (<>
        <div role="radiogroup" aria-labelledby="story-h" className="story-cards">
          {SKINS.map((sk) => (
            <button key={sk} type="button" role="radio" aria-checked={picked === sk} disabled={busy} onClick={() => choose(sk)}
              data-tip={t(TIPS[sk])} className="story-card">
              <b>{t(NAMES[sk])}</b>
              <span className="story-swatches" aria-hidden="true">
                {COLORS[sk].map((c) => <span key={c} style={{ background: c }} />)}
              </span>
              <span className="story-places">{placeLine(sk)}</span>
            </button>
          ))}
        </div>
        <p role="status" style={{ margin: 0, padding: '0.25rem 1rem 0.75rem', color: note ? 'var(--text)' : 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {t(note || 'Only the look and some names change. Buttons stay the same.')}
        </p>
      </>)}
    </div>
  )
}
