import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { rememberAccount, updateAccountInfo, forgetAccount } from '../lib/accounts'
import { isManagerTitle } from '../lib/titles'

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
  //
  // IMPORTANT (fixes the "portal resets to home when I switch browser tabs"
  // bug): Supabase quietly re-validates the login every time the tab regains
  // focus, and fires this listener again even though the SAME person is still
  // signed in. If we replaced our session state each time, the app would
  // briefly flash "Loading…", every screen would unmount, and the user would
  // land back on the home view. So we only accept a new session object when
  // the signed-in USER actually changes (sign in, sign out, user switch) —
  // silent token refreshes are ignored.
  useEffect(() => {
    let active = true
    const keepIfSameUser = (prev, next) =>
      prev?.user?.id && next?.user?.id === prev.user.id ? prev : next

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession((prev) => keepIfSameUser(prev, data.session))
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) rememberAccount(s) // keeps the account picker's tokens fresh
      setSession((prev) => keepIfSameUser(prev, s))
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

  // Load the profile when the signed-in USER changes — keyed to the user id,
  // not the session object, so token refreshes never re-trigger it.
  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    supabase
      .from('profiles')
      .select('id, full_name, role, group_id, dealership_id, authorized_dealer_id, title')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!active) return
        if (error) console.error('Could not load profile:', error.message)
        if (data) updateAccountInfo(userId, { full_name: data.full_name, role: data.role })
        setProfile(data ?? null)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null, // 'dealership' | 'installer' | 'admin'
    groupId: profile?.group_id ?? null,
    dealershipId: profile?.dealership_id ?? null,
    dealerId: profile?.authorized_dealer_id ?? null,
    title: profile?.title ?? null,
    // Store managers (any preset title containing "Manager") may add users,
    // edit retail, and apply discounts. The database enforces the same rule.
    isManager: profile?.role === 'dealership' && isManagerTitle(profile?.title),
    loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    // Signing out also removes this person from the login screen's account
    // picker — "sign out" should mean gone, not "one click from returning".
    signOut: () => {
      if (session?.user?.id) forgetAccount(session.user.id)
      return supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
