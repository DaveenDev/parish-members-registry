import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

export const THEMES = [
  { id: 'classic', label: 'Gold & Navy', swatch: ['#34589c', '#c39b4e'] },
  { id: 'emerald', label: 'Emerald & Champagne', swatch: ['#1f6d4c', '#c2a45a'] },
  { id: 'burgundy', label: 'Burgundy & Champagne', swatch: ['#7a2e3a', '#c9a45c'] },
  { id: 'royal', label: 'Royal Purple & Gold', swatch: ['#5b3a8a', '#c9a24c'] },
  { id: 'ocean', label: 'Ocean Teal & Sand', swatch: ['#14707a', '#c79a5a'] },
  { id: 'terracotta', label: 'Terracotta & Sage', swatch: ['#b0563a', '#8a9a5b'] },
  { id: 'slate', label: 'Slate & Copper', swatch: ['#3d5166', '#b5651d'] },
  { id: 'rose', label: 'Rose & Charcoal', swatch: ['#9c3f60', '#b99a6a'] },
];

const DEFAULT_THEME = 'classic';
const STORAGE_KEY = 'pmr_theme';
const MODE_KEY = 'pmr_mode';
export const MODES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']];

const ThemeContext = createContext(null);

// Storage can be blocked (private windows, strict settings); fall back to defaults.
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* not saved */ } };
const isTheme = (id) => THEMES.some((t) => t.id === id);

/**
 * Color theme and light/dark mode. The theme is the one chosen on this
 * device, else the parish default from Parish Config (0014 migration), else
 * Gold & Navy. Dark mode only applies inside the admin panel, which calls
 * useAdminColorMode(); the public pages stay light.
 */
export function ThemeProvider({ children }) {
  const [deviceTheme, setDeviceTheme] = useState(() => (isTheme(read(STORAGE_KEY)) ? read(STORAGE_KEY) : null));
  const [parishTheme, setParishTheme] = useState(null);
  const [mode, setModeState] = useState(() => (MODES.some(([k]) => k === read(MODE_KEY)) ? read(MODE_KEY) : 'light'));
  const theme = deviceTheme || parishTheme || DEFAULT_THEME;

  useEffect(() => {
    api.publicParishTheme().then((t) => { if (isTheme(t)) setParishTheme(t); }).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function setTheme(id) {
    if (!isTheme(id)) return;
    write(STORAGE_KEY, id);
    setDeviceTheme(id);
  }
  /** Forget this device's choice and follow the parish default again. */
  function followParishTheme() {
    write(STORAGE_KEY, null);
    setDeviceTheme(null);
  }
  function setMode(m) {
    write(MODE_KEY, m);
    setModeState(m);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES, deviceTheme, parishTheme, setParishTheme, followParishTheme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
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
