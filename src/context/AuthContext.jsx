import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase, savedSignIn, keepSignedIn } from '../supabaseClient'
import { ensureDeviceKeypair, flushOutbox } from '../lib/e2ee'
import { peekReturnTo } from '../utils/returnTo'
import { getLang } from '../utils/lang'
import { tell } from '../components/AdminDialog'
import { clearAllPendingAsks, isNoSignal } from '../utils/pendingAsks'
import { clearAllPendingReports } from '../utils/pendingReports'
import { clearAllPendingEventActions } from '../utils/pendingEventActions'
import { clearEventCopies } from '../utils/eventCopy'
import { setTownToday } from '../utils/location'

// Opening VWB with no signal (Nov 3). The last profile and groups that loaded
// are kept on this phone, in the same place as the sign-in, so the app can open
// with no signal. Signing out removes them.
const COPY = 'vwb_profile_copy'
function copyStore() {
  try { return keepSignedIn() ? localStorage : sessionStorage } catch { return null }
}
function saveCopy(uid, profile, organizations) {
  try { copyStore()?.setItem(COPY, JSON.stringify({ uid, profile, organizations })) } catch { /* private window */ }
}
function readCopy(uid) {
  try {
    const c = JSON.parse(copyStore()?.getItem(COPY) || 'null')
    return c && c.uid === uid && c.profile ? c : null
  } catch { return null }
}
function clearCopy() {
  try { localStorage.removeItem(COPY); sessionStorage.removeItem(COPY) } catch { /* private window */ }
}
// No signal (or a weak one): Supabase can't renew an hour-old sign-in, so it says
// nobody is signed in, but it keeps the sign-in saved. A sign-in that is truly over
// (signed out, or turned down by VWB) is removed from the phone, so anything still
// saved is still good. Keep the person in until the signal comes back.
function noSignalUser() {
  return savedSignIn()?.user || null
}

const AuthContext = createContext({})

export function useAuth() {
  return useContext(AuthContext)
}

// Sends a Hope Ambassador application for review. The Ambassador badge is
// never handed out by the app itself: an admin approves it, and the database
// enforces that. Safe to call twice (an application already waiting counts
// as done). Returns true when an application is on file.
async function submitAmbassadorApplication(userId, howKnown) {
  const { data: existing, error: existErr } = await supabase
    .from('ambassador_applications')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()
  if (existErr) { console.error('[AuthContext] submitAmbassadorApplication:check', existErr); return false }
  if (existing) return true
  const { error } = await supabase
    .from('ambassador_applications')
    .insert({ user_id: userId, how_known: howKnown || null })
  if (error) { console.error('[AuthContext] submitAmbassadorApplication', error); return false }
  return true
}

// Pending organization invite: JoinOrg.jsx stashes this in localStorage when
// someone accepts an invite before they have an account yet, or before they've
// signed in -- same pending-in-localStorage pattern as the ambassador and
// village signup data above. Applied here once we actually have a signed-in
// user. Only cleared on success, so a hiccup (or an email-confirm gap) just
// retries on the next load, same as the ambassador stash.
// Sign-up stashes are also saved on the account itself (user metadata, see
// signUp below), so they still work when the confirm-email link is opened on
// a different phone or computer. Cleared from both places once used.
function readStash(key, metaKey, authUser) {
  let raw = null
  try { raw = localStorage.getItem(key) } catch { /* private mode */ }
  if (raw) { try { return JSON.parse(raw) } catch (e) { console.error('Failed to read ' + key + ':', e) } }
  const meta = authUser?.user_metadata?.[metaKey]
  return meta && typeof meta === 'object' ? meta : null
}

async function clearStash(key, metaKey, authUser) {
  try { localStorage.removeItem(key) } catch { /* private mode */ }
  if (authUser?.user_metadata?.[metaKey]) {
    const { error } = await supabase.auth.updateUser({ data: { [metaKey]: null } })
    if (error) console.error('[AuthContext] clear ' + metaKey, error)
  }
}

async function applyPendingOrgInvite(authUser) {
  const invite = readStash('vwb_pending_org_invite', 'org_invite_pending', authUser)
  if (!invite) return
  if (!invite.token) { await clearStash('vwb_pending_org_invite', 'org_invite_pending', authUser); return }
  const { error } = await supabase.rpc('accept_organization_invitation', {
    p_token: invite.token,
    p_name: invite.name,
    p_description: invite.description || null,
    p_contact_email: invite.contact_email || null,
    p_website_url: invite.website_url || null,
    p_social_link: invite.social_link || null,
  })
  if (error) { console.error('[AuthContext] applyPendingOrgInvite', error); return }
  await clearStash('vwb_pending_org_invite', 'org_invite_pending', authUser)
  // Say it went through. It happens in the background right after sign up.
  tell('Thank you! ' + (invite.name || 'Your group') + ' is saved and waiting for approval. A VWB admin will look at it soon. You can post once it is approved.')
}

// The 5-digit zip code someone typed when they signed up (Oct 25), or null.
function signupZip(authUser) {
  const z = String(authUser?.user_metadata?.zip_code || '').replace(/[^0-9]/g, '').slice(0, 5)
  return z.length === 5 ? z : null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(true)
  // Set when a signed-in account's profile can't be loaded or created, so
  // the app can say so (with Try again / Sign out) instead of a blank screen.
  const [profileError, setProfileError] = useState('')
  // getSession and onAuthStateChange both fire on page load (and right
  // after an email confirmation link). Share one run so a brand-new account
  // never tries to create its profile twice at the same moment.
  const profileRun = useRef(null)
  // True while the profile on screen is the copy kept on this phone (no signal).
  const [fromCopy, setFromCopy] = useState(false)

  useEffect(() => {
    let settled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      settled = true
      const u = session?.user ?? noSignalUser()
      setUser(u)
      if (u) {
        ensureProfile(u)
      }
      setLoading(false)
    })
    // With no signal, renewing an old sign-in keeps trying for half a minute.
    // Don't leave a blank screen that long: after 3 seconds, open with the saved sign-in.
    const slow = setTimeout(() => {
      if (settled) return
      const u = noSignalUser()
      if (!u) return
      setUser(u)
      ensureProfile(u)
      setLoading(false)
    }, 3000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // A real sign out always signs out. Otherwise, with no signal, keep a saved sign-in.
        const u = session?.user ?? (event === 'SIGNED_OUT' ? null : noSignalUser())
        if (event === 'SIGNED_OUT') { clearCopy(); clearAllPendingAsks(); clearAllPendingReports(); clearAllPendingEventActions(); clearEventCopies(); setTownToday(null) }
        setUser(u)
        if (u) {
          ensureProfile(u)
        } else {
          setProfile(null)
        }
      }
    )

    // Signal is back: renew the sign-in and load the real profile.
    function back() {
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) { console.error('[AuthContext] renewing sign-in', error); return }
        if (session?.user) { setUser(session.user); ensureProfile(session.user) }
      })
    }
    window.addEventListener('online', back)

    return () => { clearTimeout(slow); subscription.unsubscribe(); window.removeEventListener('online', back) }
  }, [])

  // Keep a copy of the profile and groups once they load from VWB.
  useEffect(() => {
    if (user?.id && profile && !fromCopy) saveCopy(user.id, profile, organizations)
  }, [user?.id, profile, organizations, fromCopy])

  async function loadOrganizations(userId) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, role, organizations ( id, name, approved, hide_from_public, kind )')
      .eq('user_id', userId)

    if (error) {
      console.error('[AuthContext] loadOrganizations', error)
      setOrganizations([])
      return
    }

    const approved = (data || [])
      .filter((row) => row.organizations && row.organizations.approved)
      .map((row) => ({ id: row.organizations.id, name: row.organizations.name, role: row.role, hide_from_public: !!row.organizations.hide_from_public, kind: row.organizations.kind || 'organization' }))

    setOrganizations(approved)
  }

  function ensureProfile(authUser) {
    if (profileRun.current && profileRun.current.userId === authUser.id) return profileRun.current.promise
    const promise = ensureProfileOnce(authUser).finally(() => {
      if (profileRun.current?.promise === promise) profileRun.current = null
    })
    profileRun.current = { userId: authUser.id, promise }
    return promise
  }

  // The profile copy kept on this phone, shown while there is no signal.
  function showCopy(authUser) {
    const copy = readCopy(authUser.id)
    if (!copy) return false
    setFromCopy(true)
    setProfile(copy.profile)
    setOrganizations(copy.organizations || [])
    return true
  }

  async function ensureProfileOnce(authUser) {
    setProfileError('')
    // No signal at all: open with the copy right away. The real one loads when the signal is back.
    if (navigator.onLine === false && showCopy(authUser)) return
    // A weak signal can take a while (Supabase tries again for several seconds).
    // After 3 seconds, show the copy while it keeps trying.
    let loaded = false
    const slow = setTimeout(() => { if (!loaded) showCopy(authUser) }, 3000)
    const { data: rows, error: fetchErr } = await supabase
      .from('helper_profiles')
      .select('*')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: true })
      .limit(1)
    loaded = true
    clearTimeout(slow)
    const data = rows?.[0] || null

    // A real failure (network, permissions). Don't guess that this is a new
    // person and try to create a second profile. Say so instead.
    if (fetchErr) {
      console.error('[AuthContext] ensureProfile fetch', fetchErr)
      // No signal: open with the copy kept on this phone. The real one loads when the signal is back.
      if (isNoSignal(fetchErr) && showCopy(authUser)) return
      setProfileError(isNoSignal(fetchErr)
        ? 'No signal right now. VWB will open when your phone has signal.'
        : "We couldn't load your account. Check your connection and try again.")
      return
    }
    setFromCopy(false)

    // Pending ambassador signup: Login.jsx stashes this in localStorage
    // because the profile row doesn't exist yet at signup time (the account
    // needs email confirmation first). Applied here as plain helper_profiles
    // columns, matching how Profile.jsx's own ambassador signup writes them.
    const pendingData = readStash('vwb_ambassador_pending', 'ambassador_pending', authUser)

    if (data) {
      if (pendingData && !data.is_hope_ambassador) {
        const { data: updated, error } = await supabase
          .from('helper_profiles')
          .update({
            skills: pendingData.skills,
            availability: pendingData.availability,
            interests: pendingData.interests,
            radius_miles: pendingData.radius_miles,
            is_available: true,
            campfire_notifications_enabled: pendingData.campfire_notifications_enabled ?? false,
          })
          .eq('user_id', authUser.id)
          .select()
          .single()

        if (error) {
          console.error('Failed to apply pending ambassador signup:', error)
          setProfile(data)
        } else {
          // Profile details are saved, but the Ambassador badge waits for an
          // admin to approve the application. Keep the stash until the
          // application is really on file, so a hiccup can retry next load.
          const applied = await submitAmbassadorApplication(authUser.id, pendingData.how_known)
          if (applied) await clearStash('vwb_ambassador_pending', 'ambassador_pending', authUser)
          setProfile(updated)
        }
      } else if (!data.zip_code && signupZip(authUser)) {
        // The zip typed at sign up (Oct 25), if the profile didn't get it yet.
        const { data: withZip, error: zipErr } = await supabase.from('helper_profiles')
          .update({ zip_code: signupZip(authUser) }).eq('user_id', authUser.id).select().single()
        if (zipErr) console.error('[AuthContext] saving sign-up zip failed', zipErr)
        setProfile(zipErr ? data : withZip)
      } else {
        setProfile(data)
      }
      loadOrganizations(authUser.id)
      applyPendingOrgInvite(authUser)
      ensureDeviceKeypair(authUser.id).then(() => flushOutbox(authUser.id))
      checkBanned()
      checkEstablished()
      return
    }

    // No profile yet, create one
    const displayName = authUser.user_metadata?.display_name || ''
    const insertData = { user_id: authUser.id, display_name: displayName }
    // The zip code typed at sign up (Oct 25). The database checks it and sets the area from it.
    if (signupZip(authUser)) insertData.zip_code = signupZip(authUser)
    if (pendingData) {
      insertData.skills = pendingData.skills
      insertData.availability = pendingData.availability
      insertData.interests = pendingData.interests
      insertData.radius_miles = pendingData.radius_miles
      insertData.is_available = true
      insertData.campfire_notifications_enabled = pendingData.campfire_notifications_enabled ?? false
    }

    // No village is set here. The database places people in a village from
    // the zip on their profile (vwb-villages-by-zip.sql), so nobody is ever
    // guessed into an area they don't live in.

    let { data: newProfile, error } = await supabase
      .from('helper_profiles')
      .insert(insertData)
      .select()
      .single()
    // A zip the database won't take never blocks the account: save without it (they are asked again on Today).
    if (error && error.code === '22023' && insertData.zip_code) {
      delete insertData.zip_code
      ;({ data: newProfile, error } = await supabase.from('helper_profiles').insert(insertData).select().single())
    }

    if (!error) {
      if (pendingData) {
        const applied = await submitAmbassadorApplication(authUser.id, pendingData.how_known)
        if (applied) await clearStash('vwb_ambassador_pending', 'ambassador_pending', authUser)
      }
      try { localStorage.removeItem('vwb_pending_village_id') } catch {}
      setProfile(newProfile)
      loadOrganizations(authUser.id)
      applyPendingOrgInvite(authUser)
      ensureDeviceKeypair(authUser.id).then(() => flushOutbox(authUser.id))
      checkEstablished()
    } else if (error.code === '23505') {
      // Already created a moment ago (for example, in another tab). Load it.
      const { data: again, error: againErr } = await supabase
        .from('helper_profiles').select('*').eq('user_id', authUser.id)
        .order('created_at', { ascending: true }).limit(1)
      if (againErr || !again?.[0]) {
        console.error('[AuthContext] ensureProfile reload after duplicate', againErr)
        setProfileError("We couldn't finish setting up your account. Try again in a moment.")
        return
      }
      setProfile(again[0])
      loadOrganizations(authUser.id)
      checkEstablished()
    } else {
      console.error('[AuthContext] ensureProfile insert failed', error.code, error.message, error.details, error.hint)
      setProfileError("We couldn't finish setting up your account. Try again in a moment. If it keeps happening, email info@villagewithoutborders.org.")
    }
  }

  async function refreshProfile() {
    if (!user) return
    const { data, error } = await supabase
      .from('helper_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('[AuthContext] refreshProfile', error)
      return
    }

    if (data) {
      setProfile(data)
      loadOrganizations(user.id)
    }
  }

  // captchaToken comes from the Turnstile human check (components/Turnstile.jsx).
  // extra: more sign-up details saved on the account (ambassador_pending,
  // org_invite_pending), so they survive opening the email on another device.
  // The confirm link brings them back to the page they were headed to
  // (an event, a chat link, a QR code). Supabase only follows it when the
  // address is on its Redirect URLs list; otherwise it uses the Site URL.
  async function signUp(email, password, displayName, isAmbassador = false, captchaToken = undefined, extra = {}) {
    let orgInvite = null
    try { orgInvite = JSON.parse(localStorage.getItem('vwb_pending_org_invite') || 'null') } catch { /* private mode */ }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken: captchaToken || undefined,
        emailRedirectTo: window.location.origin + (peekReturnTo() || '/'),
        data: {
          display_name: displayName,
          is_hope_ambassador: isAmbassador,
          // Nov 13: the welcome email comes in the language they signed up in.
          lang: getLang() === 'es' ? 'es' : 'en',
          ...(orgInvite ? { org_invite_pending: orgInvite } : {}),
          ...extra,
        },
      },
    })
    return { data, error }
  }

  async function signIn(email, password, captchaToken = undefined) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken || undefined },
    })
    return { data, error }
  }

  // Whether this account has earned trust yet (vwb-new-account-safety.sql).
  // null = not known yet; screens treat that as "don't block".
  const [established, setEstablished] = useState(null)
  async function checkEstablished() {
    const { data, error } = await supabase.rpc('am_i_established')
    if (error) { if (error.code !== 'PGRST202') console.error('[AuthContext] am_i_established', error); setEstablished(true); return }
    setEstablished(data === true)
  }

  // Backstop for a session that was already open when an admin banned
  // this account (vwb-bans.sql). Signs them out and leaves a note for the
  // login page to explain and give the appeal address.
  async function checkBanned() {
    const { data, error } = await supabase.rpc('am_i_banned')
    if (error) { if (error.code !== 'PGRST202') console.error('[AuthContext] am_i_banned', error); return }
    if (data === true) {
      try { localStorage.setItem('vwb_banned_notice', '1') } catch { /* private mode */ }
      await signOut()
    }
  }

  async function signOut() {
    // Requests saved with no signal, and the profile copy, stay on this phone only while signed in.
    clearAllPendingAsks()
    clearAllPendingReports()
    clearAllPendingEventActions()
    clearEventCopies()
    clearCopy()
    setTownToday(null)
    const { error } = await supabase.auth.signOut()
    if (error) console.error('[AuthContext] signOut', error)
    setUser(null)
    setProfile(null)
    setOrganizations([])
  }

  // Two-step login. null = not checked yet, true = this session still needs
  // its authenticator code, false = fine. A failed check never locks anyone out.
  const [mfaRequired, setMfaRequired] = useState(null)
  async function refreshMfa() {
    // With no signal this check waits on renewing the sign-in, which can take half a
    // minute. After 3 seconds, work it out from the sign-in saved on this phone:
    // a code is needed if the account has an authenticator and this sign-in hasn't
    // used it yet. The real check still finishes when the signal is back.
    let done = false
    const slow = setTimeout(() => {
      if (done) return
      const saved = savedSignIn()
      if (!saved) return
      const hasCode = (saved.user.factors || []).some((f) => f.status === 'verified')
      let aal = ''
      try { aal = JSON.parse(atob(saved.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal || '' } catch { /* unreadable */ }
      setMfaRequired(hasCode && aal !== 'aal2')
    }, 3000)
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    done = true
    clearTimeout(slow)
    if (error) { console.error('[AuthContext] refreshMfa', error); setMfaRequired(false); return }
    setMfaRequired(data.nextLevel === 'aal2' && data.currentLevel !== 'aal2')
  }
  useEffect(() => {
    setMfaRequired(null)
    if (!user?.id) return
    refreshMfa()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Ends every session for this account, on every device (this one too).
  // Other devices drop off within about an hour, when their short-lived
  // pass runs out and can't be renewed.
  async function signOutEverywhere() {
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) { console.error('[AuthContext] signOutEverywhere', error); return false }
    setUser(null)
    setProfile(null)
    setOrganizations([])
    return true
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, signOutEverywhere, mfaRequired, refreshMfa, refreshProfile, isAdmin: profile?.role === 'admin' || profile?.role === 'founder', isFounder: profile?.role === 'founder', organizations, refreshOrganizations: () => (user ? loadOrganizations(user.id) : Promise.resolve()), isOrgMember: organizations.length > 0, established, refreshEstablished: checkEstablished, profileError, retryProfile: () => user && ensureProfile(user) }}>
      {children}
    </AuthContext.Provider>
  )
}
