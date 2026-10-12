import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

// Kept to the colors of the parish logo. A device or parish default saved with a
// theme that was taken out falls back to the parish default, then Gold & Navy.
export const THEMES = [
  { id: 'classic', label: 'Gold & Navy', swatch: ['#34589c', '#c39b4e'] },
  { id: 'emerald', label: 'Emerald & Champagne', swatch: ['#1f6d4c', '#c2a45a'] },
  { id: 'ocean', label: 'Ocean Teal & Sand', swatch: ['#14707a', '#c79a5a'] },
  { id: 'terracotta', label: 'Terracotta & Sage', swatch: ['#b0563a', '#8a9a5b'] },
];

const DEFAULT_THEME = 'classic';
const STORAGE_KEY = 'pmr_theme';
// The parish theme as last loaded, so a page opens in it instead of
// flashing Gold & Navy while it loads again.
const PARISH_KEY = 'pmr_parish_theme';
const MODE_KEY = 'pmr_mode';
export const MODES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']];

const ThemeContext = createContext(null);

// Storage can be blocked (private windows, strict settings); fall back to defaults.
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* not saved */ } };
const isTheme = (id) => THEMES.some((t) => t.id === id);
const saved = (key) => (isTheme(read(key)) ? read(key) : null);

/**
 * Color theme and light/dark mode. The public website, the registration
 * form and the census portal always show the parish theme (Parish Config,
 * 0014 migration): the one the parish secretary (full access) picked, else
 * Gold & Navy. Inside the admin panel, which calls useAdminTheme(), another
 * staff member may pick their own theme for this device. Dark mode only
 * applies inside the admin panel too (useAdminColorMode()).
 */
export function ThemeProvider({ children }) {
  const [deviceTheme, setDeviceTheme] = useState(() => saved(STORAGE_KEY));
  const [parishTheme, setParishThemeState] = useState(() => saved(PARISH_KEY));
  const [inAdmin, setInAdmin] = useState(false);
  const [mode, setModeState] = useState(() => (MODES.some(([k]) => k === read(MODE_KEY)) ? read(MODE_KEY) : 'light'));
  // What this account sees in the admin panel (and the pickers show as chosen).
  const theme = deviceTheme || parishTheme || DEFAULT_THEME;
  const shown = inAdmin ? theme : parishTheme || DEFAULT_THEME;

  function setParishTheme(id) {
    const next = isTheme(id) ? id : null;
    write(PARISH_KEY, next);
    setParishThemeState(next);
  }

  useEffect(() => {
    api.publicParishTheme().then(setParishTheme).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', shown);
  }, [shown]);

  function setTheme(id) {
    if (!isTheme(id)) return;
    write(STORAGE_KEY, id);
    setDeviceTheme(id);
  }
  /** Forget this device's choice and follow the parish theme again. */
  function followParishTheme() {
    write(STORAGE_KEY, null);
    setDeviceTheme(null);
  }
  function setMode(m) {
    write(MODE_KEY, m);
    setModeState(m);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES, deviceTheme, parishTheme, setParishTheme, followParishTheme, setInAdmin, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Show this device's own theme, if it picked one, while the calling component (the admin layout) is mounted. */
export function useAdminTheme() {
  const { setInAdmin } = useTheme();
  useEffect(() => {
    setInAdmin(true);
    return () => setInAdmin(false);
  }, [setInAdmin]);
}

/** Apply the chosen light/dark mode to <html> while the calling component (the admin layout) is mounted. */
export function useAdminColorMode() {
  const { mode } = useTheme();
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && !!media?.matches);
      document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
    };
    apply();
    media?.addEventListener?.('change', apply);
    return () => {
      media?.removeEventListener?.('change', apply);
      document.documentElement.removeAttribute('data-mode');
    };
  }, [mode]);
}
