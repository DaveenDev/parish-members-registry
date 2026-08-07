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

  /**
   * Changing a password invalidates every token issued before it, including the
   * one this tab is holding. The server returns a replacement — store it, or
   * the next request 401s and the user is bounced to the sign-in page.
   */
  async function changePassword(currentPassword, newPassword) {
    const res = await api.changePassword(currentPassword, newPassword);
    if (res?.token) localStorage.setItem('pmr_token', res.token);
    return res;
  }

  function logout() {
    localStorage.removeItem('pmr_token');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, ready, login, logout, changePassword }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
