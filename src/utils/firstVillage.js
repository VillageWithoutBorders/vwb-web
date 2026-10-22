// First run: should this person see the Find your village screen?
// See components/FirstVillage.jsx.

// Who sees this: people who have not answered about villages yet and have not
// finished the tour (new members). Older members are asked on the Dashboard.
export function needsFirstVillage(profile) {
  if (!profile) return false
  const has = (k) => Object.prototype.hasOwnProperty.call(profile, k)
  if (!has('village_opt_in') || !has('tour_done_at')) return false
  return profile.village_opt_in === null && !profile.tour_done_at
}

// While a new member is starting a village or saying hi in their new village
// chat, the first-run questions (Simple view, the tour) wait. They show up as
// soon as the person goes anywhere else.
export function firstRunPaused(pathname) {
  return pathname === '/find-village' || pathname === '/village-square'
}
