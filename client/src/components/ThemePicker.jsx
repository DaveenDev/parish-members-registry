import React, { useEffect, useRef, useState } from 'react';
import { useTheme, MODES, THEMES, ACCENTS, parseLook, joinLook } from '../ThemeContext.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { can } from '../lib/access.js';
import { api } from '../api.js';

/**
 * Picking a theme or an accent in the admin panel. For the parish secretary
 * (full access) it becomes the parish look, which the public website, the
 * registration form and every device without its own choice show; for
 * other staff it's this device's admin panel only. `choose` takes a whole
 * look ("theme/accent").
 */
export function useChooseTheme() {
  const { setTheme, setParishTheme, followParishTheme, parishTheme } = useTheme();
  const user = useAuth()?.user;
  const toast = useToast();
  const forParish = !!user && can(user, 'settings');

  async function choose(look) {
    if (!forParish) { setTheme(look); return; }
    const before = parishTheme;
    // Shown at once; put back if it can't be saved.
    followParishTheme();
    setParishTheme(look);
    try {
      const res = await api.updateSettings({ theme: look });
      if (res.settings.theme !== look) throw new Error('Run the 0014_roles_activity_trash.sql migration in Supabase to save a parish theme');
    } catch (e) {
      setParishTheme(before);
      setTheme(look);
      toast.error(`Only this device changed: ${e.message || 'could not save the parish theme'}`);
    }
  }
  return { choose, forParish };
}

/** The current look split in two, and a chooser for each half. */
function useLookParts() {
  const { theme: look } = useTheme();
  const { choose } = useChooseTheme();
  const { theme, accent } = parseLook(look);
  return {
    theme,
    accent,
    pickTheme: (id) => { if (id !== theme) choose(joinLook(id, accent)); },
    pickAccent: (id) => { if (id !== accent) choose(joinLook(theme, id)); },
  };
}

/** Light / Dark / Auto segmented control for the admin panel. */
export function ModeSwitch() {
  const { mode, setMode } = useTheme();
  return (
    <div role="radiogroup" aria-label="Light or dark" className="inline-flex rounded-lg border-[1.5px] border-parish-borderSoft overflow-hidden bg-parish-field">
      {MODES.map(([k, label]) => (
        <button
          key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
          className={`appearance-none border-none cursor-pointer px-3 py-1.5 font-semibold text-[12.5px] ${mode === k ? 'bg-parish-fill text-white' : 'bg-transparent text-parish-text2'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A dot: a theme's page and card (split), or an accent's full colour (solid). */
function Swatch({ colors, size = 24 }) {
  return (
    <span className="rounded-full flex-none overflow-hidden border border-black/15" style={{ width: size, height: size }}>
      <span className="block w-full h-full" style={{ background: `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1] || colors[0]} 50%)` }} />
    </span>
  );
}

/** Trigger button + popover panel — used in the admin sidebar. */
export function ThemePickerPopover({ align = 'right', placement = 'down', dark = false, label = 'Theme', showMode = false }) {
  const { theme, accent, pickTheme, pickAccent } = useLookParts();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const currentTheme = THEMES.find((t) => t.id === theme);
  const currentAccent = ACCENTS.find((a) => a.id === accent);

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

  const row = (item, active, onPick) => (
    <button
      key={item.id}
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onPick(item.id)}
      className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition"
      style={{ background: active ? 'var(--p-blue-tint)' : 'transparent' }}
    >
      <Swatch colors={item.swatch} size={22} />
      <span className="font-semibold text-[13px] text-parish-ink">{item.label}</span>
      {active && <span className="ml-auto font-bold text-[12px] text-parish-blue">✓</span>}
    </button>
  );
  const heading = (text) => <div className="px-2.5 pt-1.5 pb-1 font-bold text-[10.5px] tracking-[.12em] uppercase text-parish-muted">{text}</div>;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Change the theme and accent"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 transition ${
          dark ? 'bg-white/10 hover:bg-white/15 text-white/85' : 'bg-white/70 hover:bg-parish-surface shadow-cardSm text-parish-ink'
        }`}
      >
        <span className="flex -space-x-1.5">
          <Swatch colors={currentTheme.swatch} size={20} />
          <Swatch colors={currentAccent.swatch} size={20} />
        </span>
        <span className="font-semibold text-[12.5px] whitespace-nowrap">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-none transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute z-50 w-[230px] max-h-[70vh] overflow-auto bg-parish-surface rounded-2xl shadow-2xl border border-parish-border p-2 ${
            placement === 'up' ? 'mb-2' : 'mt-2'
          }`}
          style={{ [align]: 0, [placement === 'up' ? 'bottom' : 'top']: '100%' }}
        >
          {showMode && <div className="px-1 pt-1 pb-2.5 mb-1 border-b border-parish-line2"><ModeSwitch /></div>}
          <div role="radiogroup" aria-label="Theme">
            {heading('Theme')}
            {THEMES.map((t) => row(t, t.id === theme, pickTheme))}
          </div>
          <div role="radiogroup" aria-label="Accent" className="mt-1.5 pt-1.5 border-t border-parish-line2">
            {heading('Accent')}
            {ACCENTS.map((a) => row(a, a.id === accent, pickAccent))}
          </div>
        </div>
      )}
    </div>
  );
}

function PickerGroup({ title, hint, items, current, onPick }) {
  return (
    <div role="radiogroup" aria-label={title}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <span className="font-semibold text-[13.5px] text-parish-text2">{title}</span>
        <span className="text-[12.5px] text-parish-muted">{hint}</span>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        {items.map((t) => {
          const active = current === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPick(t.id)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
              style={{
                border: active ? '2px solid var(--p-blue)' : '2px solid rgb(var(--c-border-soft))',
                background: active ? 'var(--p-blue-tint)' : 'rgb(var(--c-field))',
              }}
            >
              <Swatch colors={t.swatch} size={32} />
              <span className="font-semibold text-[13.5px] text-parish-ink">{t.label}</span>
              {active && <span className="ml-auto font-bold text-[12px] text-parish-blue">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Full labeled picker — used in Parish Config → Appearance. */
export function ThemePickerGrid() {
  const { theme, accent, pickTheme, pickAccent } = useLookParts();
  return (
    <div className="flex flex-col gap-4">
      <PickerGroup title="Theme" hint="Page, card and section backgrounds" items={THEMES} current={theme} onPick={pickTheme} />
      <PickerGroup title="Accent" hint="Buttons, links and the website navbar" items={ACCENTS} current={accent} onPick={pickAccent} />
    </div>
  );
}
