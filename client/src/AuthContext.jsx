import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';

const AuthContext = createContext(null);

async function loadProfile(session) {
  if (!session?.user) return null;
  const { data } = await supabase.from('profiles').select('name, role').eq('id', session.user.id).single();
  return { id: session.user.id, email: session.user.email, name: data?.name || session.user.email, role: data?.role || '' };
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
