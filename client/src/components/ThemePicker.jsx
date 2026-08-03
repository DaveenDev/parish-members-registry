import React from 'react';
import { useTheme } from '../ThemeContext.jsx';

/** Compact row of swatches — used on the public landing page and the admin topbar. */
export function ThemeSwatches({ className = '' }) {
  const { theme, setTheme, themes } = useTheme();
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          onClick={() => setTheme(t.id)}
          className="w-5 h-5 rounded-full overflow-hidden flex-none transition"
          style={{
            border: '2px solid rgba(127,127,127,.35)',
            boxShadow: theme === t.id ? '0 0 0 2px currentColor' : 'none',
            color: theme === t.id ? t.swatch[0] : 'transparent',
          }}
        >
          <span className="block w-full h-full" style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }} />
        </button>
      ))}
    </div>
  );
}

/** Full labeled picker — used in Parish Config → Appearance. */
export function ThemePickerGrid() {
  const { theme, setTheme, themes } = useTheme();
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
      {themes.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
            style={{
              border: active ? '2px solid var(--p-blue)' : '2px solid #e0d6c1',
              background: active ? 'var(--p-blue-tint)' : '#fdfbf6',
            }}
          >
            <span className="w-8 h-8 rounded-full flex-none overflow-hidden border border-black/10">
              <span className="block w-full h-full" style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }} />
            </span>
            <span className="font-semibold text-[13.5px] text-parish-ink">{t.label}</span>
            {active && <span className="ml-auto font-bold text-[12px] text-parish-blue">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
