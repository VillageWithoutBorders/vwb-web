// Two ways to sign up (Nov 1, Jade). Picked on the sign-up form and kept on the
// account (user_metadata.start_path), so it still works if the email is
// confirmed on a different phone.
//   quick: in fast, Simple view, no setup steps. A card on the Simple home
//          offers Full setup any time.
//   full:  Find your village, then avatar, skills and your cottage (/setup),
//          then the tour, in the full app.
// Accounts made before this have no path and work as before.
export function startPath(user) {
  const p = user && user.user_metadata && user.user_metadata.start_path
  return p === 'quick' || p === 'full' ? p : null
}

// Full setup is waiting (the database column exists and it isn't finished).
export function setupWaiting(profile) {
  return !!profile && Object.prototype.hasOwnProperty.call(profile, 'setup_done_at') && !profile.setup_done_at
}

// Should /setup open by itself? Only for people who picked Full setup.
// If saving "done" fails, stop sending them back to /setup for this visit.
let leftThisVisit = false
export function leaveSetup() { leftThisVisit = true }
export function needsFullSetup(user, profile) {
  return !leftThisVisit && startPath(user) === 'full' && setupWaiting(profile)
}
