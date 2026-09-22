import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ensureDeviceKeypair } from '../lib/e2ee'

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

  async function ensureProfile(authUser) {
    const { data, error: fetchErr } = await supabase
      .from('helper_profiles')
      .select('*')
      .eq('user_id', authUser.id)
      .single()

    // PGRST116 = no row found, which is the expected "new user" case; anything
    // else is a real failure worth logging (RLS, network, etc).
    if (fetchErr && fetchErr.code !== 'PGRST116') {
      console.error('[AuthContext] ensureProfile fetch', fetchErr)
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
      ensureDeviceKeypair(authUser.id)
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

    // Village assignment: Login.jsx stashes the village the person picked at
    // signup here, same pending-in-localStorage pattern as the ambassador
    // data above (the profile row doesn't exist yet at signup time). If
    // nothing was stashed (e.g. there was only one active village to pick
    // from, so Login.jsx skipped the picker), fall back to whichever village
    // is marked as the default.
    const pendingVillageId = localStorage.getItem('vwb_pending_village_id')
    if (pendingVillageId) {
      insertData.village_id = pendingVillageId
    } else {
      const { data: defaultVillage, error: villageErr } = await supabase
        .from('villages')
        .select('id')
        .eq('is_default', true)
        .maybeSingle()
      if (villageErr) console.error('[AuthContext] ensureProfile:defaultVillage', villageErr)
      if (defaultVillage) insertData.village_id = defaultVillage.id
    }

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
      if (pendingVillageId) localStorage.removeItem('vwb_pending_village_id')
      setProfile(newProfile)
      loadOrganizations(authUser.id)
      applyPendingOrgInvite()
      ensureDeviceKeypair(authUser.id)
    } else {
      console.error('[AuthContext] ensureProfile insert failed', error)
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

  async function signUp(email, password, displayName, isAmbassador = false) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          is_hope_ambassador: isAmbassador,
        },
      },
    })
    return { data, error }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('[AuthContext] signOut', error)
    setUser(null)
    setProfile(null)
    setOrganizations([])
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile, isAdmin: profile?.role === 'admin' || profile?.role === 'founder', isFounder: profile?.role === 'founder', organizations, isOrgMember: organizations.length > 0 }}>
      {children}
    </AuthContext.Provider>
  )
}
