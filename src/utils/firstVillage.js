import { startPath } from './startPath'

// First run: should this person see the Find your village screen?
// See components/FirstVillage.jsx.

// Who sees this: people who have not answered about villages yet and have not
// finished the tour (new members). Older members are asked on the Dashboard.
// Quick start (Nov 1) skips this screen; they are asked later on the Dashboard.
export function needsFirstVillage(profile, user) {
  if (!profile) return false
  if (startPath(user) === 'quick') return false
  const has = (k) => Object.prototype.hasOwnProperty.call(profile, k)
  if (!has('village_opt_in') || !has('tour_done_at')) return false
  return profile.village_opt_in === null && !profile.tour_done_at
}

// While a new member is starting a village or saying hi in their new village
// chat, the first-run questions (Simple view, the tour) wait. They show up as
// soon as the person goes anywhere else.
// Full setup (/setup) and arranging your cottage pause them too (Nov 1).
let arranging = false
export function pauseFirstRun(on) { arranging = !!on }
export function firstRunPaused(pathname) {
  return arranging || pathname === '/find-village' || pathname === '/village-square' || pathname === '/setup'
}
