// New accounts earn trust before they can message people first, post
// offers, or start or join groups by link (vwb-new-account-safety.sql).
// The database enforces it; these just explain it kindly.
export const NEW_ACCOUNT_NOTE =
  "New accounts can do this once someone vouches for you or you finish a task with someone. It keeps VWB safe from fake accounts. Until then, you can ask for help, offer to help on requests, and reply to anyone who messages you."

// True when a Supabase error came from one of those rules.
export function isNewAccountBlock(error) {
  if (!error) return false
  const msg = String(error.message || '')
  return /new_accounts_|New accounts can/i.test(msg) || (error.code === '42501' && /row-level security/i.test(msg))
}
