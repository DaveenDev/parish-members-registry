import React, { createContext, useContext, useEffect, useState } from 'react';
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
    access: data?.access || 'full',
    accessGkk: data?.access_gkk || null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(await loadProfile(session));
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(await loadProfile(session));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || 'Invalid email or password');
    setUser(await loadProfile(data.session));
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
