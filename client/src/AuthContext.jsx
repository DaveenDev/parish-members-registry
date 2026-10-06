import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';

const AuthContext = createContext(null);

async function loadProfile(session) {
  if (!session?.user) return null;
  const byId = (cols) => supabase.from('profiles').select(cols).eq('id', session.user.id).single();
  let { data, error } = await byId('name, role, is_admin, access, access_gkk');
  // Before 0014 there are no access columns, and before 0010 no is_admin;
  // still load the rest.
  if (error && /access/.test(error.message || '')) ({ data, error } = await byId('name, role, is_admin'));
  if (error && /is_admin/.test(error.message || '')) ({ data } = await byId('name, role'));
  return {
    id: session.user.id,
    email: session.user.email,
    name: data?.name || session.user.email,
    role: data?.role || '',
    isAdmin: !!data?.is_admin,
    // No staff profile at all means no access, as in the database (0062).
    access: data ? data.access || 'full' : 'none',
    accessGkk: data?.access_gkk || null,
    // Set by a staff admin on a new account or a password reset (manage-staff);
    // RequireAuth keeps the person on the change-password screen until it's cleared.
    mustChangePassword: !!session.user.user_metadata?.must_change_password,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // Auth events can arrive back to back (changing a password signs in again,
  // then updates the user); only the latest profile load may win, or a
  // slower earlier one could bring back stale details.
  const loadSeq = useRef(0);
  const applySession = useCallback(async (session) => {
    const seq = ++loadSeq.current;
    const profile = await loadProfile(session);
    // Ready only once the latest load has landed: otherwise pages could decide
    // "nobody signed in" from a superseded load, then change their mind.
    if (seq === loadSeq.current) { setUser(profile); setReady(true); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { applySession(session); });

    return () => sub.subscription.unsubscribe();
  }, [applySession]);

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || 'Invalid email or password');
    await applySession(data.session);
  }

  async function logout() {
    loadSeq.current++;
    await supabase.auth.signOut();
    setUser(null);
  }

  /** Re-read the signed-in account, e.g. right after changing the password. */
  async function refreshUser() {
    const { data: { session } } = await supabase.auth.getSession();
    await applySession(session);
  }

  return <AuthContext.Provider value={{ user, ready, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
