import { useT, tabWord } from '../utils/lang'
import { useSkin } from '../utils/skin'

// The words on a top bar tab: "My World". With a skin on (Nov 11), the skin's name
// ("My Galaxy") and the plain word on a small second line ("World"), so people always
// know which place it is. Screen readers hear the tab's aria-label instead.
export default function TabName({ word }) {
  const t = useT()
  const skin = useSkin()
  const label = <span className="header-btn-label" aria-hidden="true"><span className="header-my">{t('My ')}</span>{tabWord(word)}</span>
  if (skin === 'home') return label
  return (
    <span className="header-name" aria-hidden="true">
      {label}
      <span className="header-plain">{t(word)}</span>
    </span>
  )
}
