import React, { createContext, useContext, useEffect, useState } from 'react';

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

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.some((t) => t.id === saved) ? saved : DEFAULT_THEME;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function setTheme(id) {
    if (!THEMES.some((t) => t.id === id)) return;
    localStorage.setItem(STORAGE_KEY, id);
    setThemeState(id);
  }

  return <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
