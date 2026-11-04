import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

/*
 * The look is two separate choices, saved together as "theme/accent"
 * (e.g. "sage/terracotta") in parish_settings.theme (0014) and on the device:
 * - the theme: the background colours of the page and of its cards, panels
 *   and sections (the --c-* surface tokens in index.css, data-theme on <html>);
 * - the accent: buttons, links, active states, headings and the website's
 *   navbar (the --p-* tokens, data-accent on <html>), kept to the colours of
 *   the parish logo.
 */
export const THEMES = [
  { id: 'parchment', label: 'Parchment', swatch: ['#f7f2e8', '#fffdf8'] },
  { id: 'white', label: 'White', swatch: ['#f6f7f8', '#ffffff'] },
  { id: 'champagne', label: 'Champagne', swatch: ['#f6e8d0', '#fff9ef'] },
  { id: 'sage', label: 'Sage', swatch: ['#e4ebdc', '#f9fbf6'] },
];
export const ACCENTS = [
  { id: 'navy', label: 'Navy', swatch: ['#34589c'] },
  { id: 'emerald', label: 'Emerald', swatch: ['#1f6d4c'] },
  { id: 'ocean', label: 'Ocean', swatch: ['#14707a'] },
  { id: 'terracotta', label: 'Terracotta', swatch: ['#a65034'] },
];

export const DEFAULT_LOOK = 'parchment/navy';
// Saved before the theme and the accent were separate choices. Every one of
// them had the parchment background, so they keep looking the same.
const LEGACY = {
  classic: 'parchment/navy',
  emerald: 'parchment/emerald',
  ocean: 'parchment/ocean',
  terracotta: 'parchment/terracotta',
};

/** "theme/accent" (or an old single theme id) as { theme, accent }, else null. */
export function parseLook(value) {
  if (!value) return null;
  const [theme, accent] = (LEGACY[value] || String(value)).split('/');
  if (!THEMES.some((t) => t.id === theme) || !ACCENTS.some((a) => a.id === accent)) return null;
  return { theme, accent };
}
const normalize = (value) => {
  const look = parseLook(value);
  return look ? `${look.theme}/${look.accent}` : null;
};
export const joinLook = (theme, accent) => `${theme}/${accent}`;

/** "Sage · Terracotta" for a saved look. */
export function lookLabel(value) {
  const { theme, accent } = parseLook(value) || parseLook(DEFAULT_LOOK);
  return `${THEMES.find((t) => t.id === theme).label} · ${ACCENTS.find((a) => a.id === accent).label}`;
}

const STORAGE_KEY = 'pmr_theme';
// The parish look as last loaded, so a page opens in it instead of
// flashing the default while it loads again.
const PARISH_KEY = 'pmr_parish_theme';
const MODE_KEY = 'pmr_mode';
export const MODES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']];

const ThemeContext = createContext(null);

// Storage can be blocked (private windows, strict settings); fall back to defaults.
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* not saved */ } };
const saved = (key) => normalize(read(key));

/**
 * Theme, accent and light/dark mode. The public website, the registration
 * form and the census portal always show the parish look (Parish Config,
 * 0014 migration): the one the parish secretary (full access) picked, else
 * Parchment · Navy. Inside the admin panel, which calls useAdminTheme(),
 * another staff member may pick their own look for this device. Dark mode
 * only applies inside the admin panel too (useAdminColorMode()).
 *
 * `theme`, `deviceTheme` and `parishTheme` hold whole looks ("theme/accent").
 */
export function ThemeProvider({ children }) {
  const [deviceTheme, setDeviceTheme] = useState(() => saved(STORAGE_KEY));
  const [parishTheme, setParishThemeState] = useState(() => saved(PARISH_KEY));
  const [inAdmin, setInAdmin] = useState(false);
  const [mode, setModeState] = useState(() => (MODES.some(([k]) => k === read(MODE_KEY)) ? read(MODE_KEY) : 'light'));
  // What this account sees in the admin panel (and the pickers show as chosen).
  const theme = deviceTheme || parishTheme || DEFAULT_LOOK;
  const shown = inAdmin ? theme : parishTheme || DEFAULT_LOOK;

  function setParishTheme(value) {
    const next = normalize(value);
    write(PARISH_KEY, next);
    setParishThemeState(next);
  }

  useEffect(() => {
    api.publicParishTheme().then(setParishTheme).catch(() => {});
  }, []);

  useEffect(() => {
    const look = parseLook(shown);
    document.documentElement.setAttribute('data-theme', look.theme);
    document.documentElement.setAttribute('data-accent', look.accent);
    // The phone's browser bar matches the navbar.
    const nav = getComputedStyle(document.documentElement).getPropertyValue('--p-nav').trim();
    if (nav) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nav);
  }, [shown]);

  function setTheme(value) {
    const next = normalize(value);
    if (!next) return;
    write(STORAGE_KEY, next);
    setDeviceTheme(next);
  }
  /** Forget this device's choice and follow the parish look again. */
  function followParishTheme() {
    write(STORAGE_KEY, null);
    setDeviceTheme(null);
  }
  function setMode(m) {
    write(MODE_KEY, m);
    setModeState(m);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, deviceTheme, parishTheme, setParishTheme, followParishTheme, setInAdmin, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Show this device's own look, if it picked one, while the calling component (the admin layout) is mounted. */
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
