import { Link } from 'react-router-dom'
import Icon from './Icon'
import { useT } from '../utils/lang'

// Nov 10 (Jade): Emergency Response is one tap from Ask for Help and Offer Help,
// not only from My Cottage. It opens the same page as the bar on My Cottage (/emergency),
// where people report an emergency or see the ones that are open.
export default function EmergencyDoor() {
  const t = useT()
  return (
    <Link to="/emergency" className="today-slim today-slim-warn today-slim-wrap emergency-door"
      data-tip={t('Emergency Response: report a flood, storm, fire, or outage near you, or see the ones that are open.')}>
      <Icon name="cat-emergency" size={28} />
      <span className="today-slim-text"><b>{t('Emergency Response')}</b><small>{t('Report an active emergency near you')}</small></span>
      <span className="today-slim-go" aria-hidden="true">&#8250;</span>
    </Link>
  )
}
