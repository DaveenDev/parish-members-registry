import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';

const AuthContext = createContext(null);

/**
 * The signed-in account with its staff profile. With `recheck` (a re-read
 * while signed in) it gives null when the profile can't be read, so a dropped
 * connection never takes an account's access away.
 */
async function loadProfile(session, { recheck = false } = {}) {
  if (!session?.user) return null;
  const byId = (cols) => supabase.from('profiles').select(cols).eq('id', session.user.id).single();
  // A GKK leader's GKK by id, with its current name (0063).
  let { data, error } = await byId('name, role, is_admin, access, access_gkk_id, gkk:gkks(name)');
  // Before 0063 the GKK is saved by name, before 0014 there are no access
  // columns, and before 0010 no is_admin; still load the rest.
  if (error && /access_gkk_id|gkks/.test(error.message || '')) ({ data, error } = await byId('name, role, is_admin, access, access_gkk'));
  if (error && /access/.test(error.message || '')) ({ data, error } = await byId('name, role, is_admin'));
  if (error && /is_admin/.test(error.message || '')) ({ data } = await byId('name, role'));
  if (recheck && !data) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: data?.name || session.user.email,
    role: data?.role || '',
    isAdmin: !!data?.is_admin,
    // No staff profile, or one without an access level, means no access, as in
    // the database (0062, 0065). Before 0014 there is no access column at all.
    access: !data ? 'none' : 'access' in data ? data.access || 'none' : 'full',
    accessGkkId: data?.access_gkk_id || null,
    accessGkk: data?.gkk?.name || data?.access_gkk || null,
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

  // Re-read the account whenever the admin comes back to the tab, so a change
  // made meanwhile (a GKK renamed, an access level changed) shows without
  // signing in again. Only a real change re-renders the pages.
  useEffect(() => {
    if (!user) return undefined;
    async function recheck() {
      if (document.visibilityState !== 'visible') return;
      const seq = loadSeq.current;
      const { data: { session } } = await supabase.auth.getSession();
      const fresh = await loadProfile(session, { recheck: true });
      if (fresh && seq === loadSeq.current && JSON.stringify(fresh) !== JSON.stringify(user)) setUser(fresh);
    }
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  }, [user]);

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
