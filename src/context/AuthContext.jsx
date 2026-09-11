import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext({})

export function useAuth() {
  return useContext(AuthContext)
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
            is_hope_ambassador: true,
            skills: pendingData.skills,
            availability: pendingData.availability,
            interests: pendingData.interests,
            radius_miles: pendingData.radius_miles,
            is_available: true,
          })
          .eq('user_id', authUser.id)
          .select()
          .single()

        if (error) {
          console.error('Failed to apply pending ambassador signup:', error)
          setProfile(data)
        } else {
          localStorage.removeItem('vwb_ambassador_pending')
          setProfile(updated)
        }
      } else {
        setProfile(data)
      }
      loadOrganizations(authUser.id)
      return
    }

    // No profile yet, create one
    const displayName = authUser.user_metadata?.display_name || ''
    const insertData = { user_id: authUser.id, display_name: displayName }
    if (pendingData) {
      insertData.is_hope_ambassador = true
      insertData.skills = pendingData.skills
      insertData.availability = pendingData.availability
      insertData.interests = pendingData.interests
      insertData.radius_miles = pendingData.radius_miles
      insertData.is_available = true
    }
    const { data: newProfile, error } = await supabase
      .from('helper_profiles')
      .insert(insertData)
      .select()
      .single()

    if (!error) {
      if (pendingData) localStorage.removeItem('vwb_ambassador_pending')
      setProfile(newProfile)
      loadOrganizations(authUser.id)
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
