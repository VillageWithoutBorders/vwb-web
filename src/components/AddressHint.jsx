import { looksLikeAddress } from '../utils/looksLikeAddress'
import { useT } from '../utils/lang'

// A gentle note under a box when what's typed looks like an address (Nov 7).
// It never stops anyone from posting.
export default function AddressHint({ text, id }) {
  const t = useT()
  const show = looksLikeAddress(text)
  return (
    <p id={id} className="address-hint" role="status" aria-live="polite">
      {show ? t('This looks like an address. Other people can read this. Take it out, and share it in a private message instead.') : ''}
    </p>
  )
}
