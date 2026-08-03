import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../ThemeContext.jsx';

/** Trigger button + popover panel — used on the landing page and the admin sidebar. */
export function ThemePickerPopover({ align = 'right', placement = 'down', dark = false, label = 'Theme' }) {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = themes.find((t) => t.id === theme) || themes[0];

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Change color theme"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 transition ${
          dark ? 'bg-white/10 hover:bg-white/15 text-white/85' : 'bg-white/70 hover:bg-white shadow-cardSm text-parish-ink'
        }`}
      >
        <span className="w-5 h-5 rounded-full overflow-hidden flex-none border border-black/10">
          <span className="block w-full h-full" style={{ background: `linear-gradient(135deg, ${current.swatch[0]} 50%, ${current.swatch[1]} 50%)` }} />
        </span>
        <span className="font-semibold text-[12.5px] whitespace-nowrap">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-none transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute z-50 w-[230px] max-h-[70vh] overflow-auto bg-white rounded-2xl shadow-2xl border border-parish-border p-2 ${
            placement === 'up' ? 'mb-2' : 'mt-2'
          }`}
          style={{ [align]: 0, [placement === 'up' ? 'bottom' : 'top']: '100%' }}
        >
          {themes.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTheme(t.id); setOpen(false); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition"
                style={{ background: active ? 'var(--p-blue-tint)' : 'transparent' }}
              >
                <span className="w-6 h-6 rounded-full flex-none overflow-hidden border border-black/10">
                  <span className="block w-full h-full" style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }} />
                </span>
                <span className="font-semibold text-[13px] text-parish-ink">{t.label}</span>
                {active && <span className="ml-auto font-bold text-[12px] text-parish-blue">✓</span>}
              </button>
            );
          })}
        </div>
      )}
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
