import { useT, getLang, setLangLocal } from '../utils/lang'

// Spanish or English, picked right on Welcome and Sign in, before an account
// exists (Nov 3). The button is written in the language it switches to, so anyone
// can find theirs. Saved on this phone, and on the account once they have one.
export default function LangSwitch() {
  const t = useT()
  const other = getLang() === 'es' ? 'en' : 'es'
  return (
    <button type="button" lang={other} onClick={() => setLangLocal(other)} className="welcome-lang">
      {other === 'es' ? 'Español' : 'English'}
      <span className="sr-only"> {t('(changes the language)')}</span>
    </button>
  )
}
