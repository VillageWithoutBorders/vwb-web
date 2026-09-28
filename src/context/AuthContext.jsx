import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { ensureDeviceKeypair, flushOutbox } from '../lib/e2ee'

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
async function applyPendingOrgInvite() {
  const pending = localStorage.getItem('vwb_pending_org_invite')
  if (!pending) return
  let invite = null
  try { invite = JSON.parse(pending) } catch (e) { console.error('Failed to parse pending org invite:', e) }
  if (!invite || !invite.token) { localStorage.removeItem('vwb_pending_org_invite'); return }
  const { error } = await supabase.rpc('accept_organization_invitation', {
    p_token: invite.token,
    p_name: invite.name,
    p_description: invite.description || null,
    p_contact_email: invite.contact_email || null,
    p_website_url: invite.website_url || null,
    p_social_link: invite.social_link || null,
  })
  if (error) { console.error('[AuthContext] applyPendingOrgInvite', error); return }
  localStorage.removeItem('vwb_pending_org_invite')
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        ensureProfile(session.user)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          ensureProfile(session.user)
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadOrganizations(userId) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, role, organizations ( id, name, approved )')
      .eq('user_id', userId)

    if (error) {
      console.error('[AuthContext] loadOrganizations', error)
      setOrganizations([])
      return
    }

    const approved = (data || [])
      .filter((row) => row.organizations && row.organizations.approved)
      .map((row) => ({ id: row.organizations.id, name: row.organizations.name, role: row.role }))

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

  async function ensureProfileOnce(authUser) {
    setProfileError('')
    const { data: rows, error: fetchErr } = await supabase
      .from('helper_profiles')
      .select('*')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: true })
      .limit(1)
    const data = rows?.[0] || null

    // A real failure (network, permissions). Don't guess that this is a new
    // person and try to create a second profile. Say so instead.
    if (fetchErr) {
      console.error('[AuthContext] ensureProfile fetch', fetchErr)
      setProfileError("We couldn't load your account. Check your connection and try again.")
      return
    }

    // Pending ambassador signup: Login.jsx stashes this in localStorage
    // because the profile row doesn't exist yet at signup time (the account
    // needs email confirmation first). Applied here as plain helper_profiles
    // columns, matching how Profile.jsx's own ambassador signup writes them.
    const pending = localStorage.getItem('vwb_ambassador_pending')
    let pendingData = null
    if (pending) {
      try { pendingData = JSON.parse(pending) } catch (e) { console.error('Failed to parse pending ambassador data:', e) }
    }

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
          if (applied) localStorage.removeItem('vwb_ambassador_pending')
          setProfile(updated)
        }
      } else {
        setProfile(data)
      }
      loadOrganizations(authUser.id)
      applyPendingOrgInvite()
      ensureDeviceKeypair(authUser.id).then(() => flushOutbox(authUser.id))
      checkBanned()
      checkEstablished()
      return
    }

    // No profile yet, create one
    const displayName = authUser.user_metadata?.display_name || ''
    const insertData = { user_id: authUser.id, display_name: displayName }
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

    const { data: newProfile, error } = await supabase
      .from('helper_profiles')
      .insert(insertData)
      .select()
      .single()

    if (!error) {
      if (pendingData) {
        const applied = await submitAmbassadorApplication(authUser.id, pendingData.how_known)
        if (applied) localStorage.removeItem('vwb_ambassador_pending')
      }
      try { localStorage.removeItem('vwb_pending_village_id') } catch {}
      setProfile(newProfile)
      loadOrganizations(authUser.id)
      applyPendingOrgInvite()
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
  async function signUp(email, password, displayName, isAmbassador = false, captchaToken = undefined) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken: captchaToken || undefined,
        data: {
          display_name: displayName,
          is_hope_ambassador: isAmbassador,
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
    const { error } = await supabase.auth.signOut()
    if (error) console.error('[AuthContext] signOut', error)
    setUser(null)
    setProfile(null)
    setOrganizations([])
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile, isAdmin: profile?.role === 'admin' || profile?.role === 'founder', isFounder: profile?.role === 'founder', organizations, isOrgMember: organizations.length > 0, established, refreshEstablished: checkEstablished, profileError, retryProfile: () => user && ensureProfile(user) }}>
      {children}
    </AuthContext.Provider>
  )
}
