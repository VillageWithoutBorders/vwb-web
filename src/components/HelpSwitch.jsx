import { NavLink } from 'react-router-dom'

// The two halves of the Help tab: what neighbors near you need (SkillShare),
// and your own requests, offers, and tasks.
export default function HelpSwitch() {
  return (
    <nav className="help-switch" aria-label="Help">
      <NavLink to="/skillshare" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>Near you</NavLink>
      <NavLink to="/tasks" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>Mine</NavLink>
    </nav>
  )
}
