import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('pmr_token');
    if (!token) { setReady(true); return; }
    api.me().then((res) => setUser(res.user)).catch(() => localStorage.removeItem('pmr_token')).finally(() => setReady(true));
  }, []);

  async function login(email, password) {
    const { token, user } = await api.login(email, password);
    localStorage.setItem('pmr_token', token);
    setUser(user);
  }

  function logout() {
    localStorage.removeItem('pmr_token');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
