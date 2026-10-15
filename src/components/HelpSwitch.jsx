import { NavLink } from 'react-router-dom'

// The two halves of the Help tab: what neighbors near you need (SkillShare),
// your own requests, offers, and tasks, and the resource library (Find help).
export default function HelpSwitch() {
  return (
    <nav className="help-switch" aria-label="Help">
      <NavLink to="/skillshare" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>Near you</NavLink>
      <NavLink to="/tasks" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>Mine</NavLink>
      <NavLink to="/community/resources" className={({ isActive }) => 'help-switch-btn' + (isActive ? ' on' : '')}>Resources</NavLink>
    </nav>
  )
}
