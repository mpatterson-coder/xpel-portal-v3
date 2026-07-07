import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// This is the real replacement for the old UI role switcher. The logged-in
// user's role now comes from the database (the profiles table), and the
// database itself enforces what that role can see. The UI can READ role to
// decide which screens to show, but it can no longer GRANT a role.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Track the auth session.
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Whenever we have a session, load that user's profile (role + tenancy).
  useEffect(() => {
    if (!session?.user) return
    let active = true
    setLoading(true)
    supabase
      .from('profiles')
      .select('id, full_name, role, group_id, dealership_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return
        if (error) console.error('Could not load profile:', error.message)
        setProfile(data ?? null)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [session])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null, // 'dealership' | 'installer' | 'admin'
    groupId: profile?.group_id ?? null,
    dealershipId: profile?.dealership_id ?? null,
    loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
