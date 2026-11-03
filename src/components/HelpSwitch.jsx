import { Link, NavLink } from 'react-router-dom'
import { useWaitingOffers } from '../hooks/useWaitingOffers'
import { useOwnBack } from './BackLink'
import { useT } from '../utils/lang'

// The three parts of the Help tab: what neighbors near you need (Offer Help, once called SkillShare),
// your own requests, offers, and tasks, and the resource library (Find help).
// Your tasks shows a count when neighbors offered to help and are waiting for your yes.
// "All help" goes back to the Help doors page (the Help tab's front door).
export default function HelpSwitch() {
  const t = useT()
  useOwnBack() // "All help" is this page's way back, so the frame's Back button hides
  const waiting = useWaitingOffers()

  return (
    <>
      <Link to="/help-doors" className="hub-back">&#8592; {t('All help')}</Link>
      <nav className="help-switch" aria-label={t('Help')}>
        <NavLink to="/skillshare" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>{t('Offer Help')}</NavLink>
        <NavLink to={waiting ? '/tasks?tab=requests' : '/tasks'} className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')} aria-label={waiting ? t('Your tasks') + ', ' + t(waiting === 1 ? '1 neighbor offered to help' : '{n} neighbors offered to help', { n: waiting }) : undefined}>
          {t('Your tasks')}{waiting > 0 && <span className="help-switch-count" aria-hidden="true">{waiting > 9 ? '9+' : waiting}</span>}
        </NavLink>
        <NavLink to="/community/resources" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>{t('Find resources')}</NavLink>
      </nav>
    </>
  )
}
