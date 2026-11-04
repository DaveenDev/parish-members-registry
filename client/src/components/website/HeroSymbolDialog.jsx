import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { Modal } from '../admin.jsx';
import { GhostButton, PrimaryButton, Spinner } from '../ui.jsx';
import { useToast } from '../../ToastContext.jsx';
import { HERO_POSITIONS, HERO_SYMBOLS, HERO_SYMBOL_OFF, heroPositionLabel, heroPositionOf, heroSymbolLabel, heroSymbolOf } from '../../lib/heroSymbols.js';

/**
 * Parish Website → "Home page 3D" (beside Visit website): which 3D object
 * sits in the gold rays behind the home page's hero, or none, and where it
 * sits on computers (left, center or right). Picking one shows it moving in
 * the preview; Save puts it on the website.
 * `viewOnly` accounts can look but not save.
 */
export default function HeroSymbolDialog({ onClose, viewOnly }) {
  const toast = useToast();
  const [saved, setSaved] = useState(null); // null while loading
  const [ready, setReady] = useState(true); // false before the 0117 migration
  const [positionReady, setPositionReady] = useState(true); // false before the 0118 migration
  const [picked, setPicked] = useState(null);
  const [savedPosition, setSavedPosition] = useState('left');
  const [position, setPosition] = useState('left');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getSettings()
      .then(({ settings }) => {
        const value = heroSymbolOf(settings.hero_symbol);
        const where = heroPositionOf(settings.hero_position);
        setReady('hero_symbol' in settings);
        setPositionReady('hero_position' in settings);
        setSaved(value);
        setPicked(value);
        setSavedPosition(where);
        setPosition(where);
      })
      .catch((e) => { toast.error(e.message || 'Could not load the settings'); onClose(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const symbolDirty = picked !== saved;
  const positionDirty = position !== savedPosition;
  const dirty = symbolDirty || positionDirty;

  async function save() {
    setBusy(true);
    try {
      // Only what changed, so a database before 0118 can still save the object.
      const patch = {};
      if (symbolDirty) patch.hero_symbol = picked;
      if (positionDirty) patch.hero_position = position;
      const res = await api.updateSettings(patch);
      const value = heroSymbolOf(res.settings.hero_symbol);
      const where = heroPositionOf(res.settings.hero_position);
      setSaved(value);
      setSavedPosition(where);
      toast.success(value === HERO_SYMBOL_OFF
        ? 'The home page no longer shows a 3D object'
        : symbolDirty
          ? `The home page now shows the ${heroSymbolLabel(value)}${positionDirty ? `, on the ${heroPositionLabel(where).toLowerCase()}` : ''}`
          : `The ${heroSymbolLabel(value)} now sits on the ${heroPositionLabel(where).toLowerCase()} of the home page`);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not save the 3D object');
    } finally {
      setBusy(false);
    }
  }

  const options = [...HERO_SYMBOLS, { key: HERO_SYMBOL_OFF, label: 'Off', note: 'No 3D object: the home page keeps its plain background.' }];
  const saveLabel = !dirty ? 'Saved'
    : !symbolDirty ? `Put it on the ${heroPositionLabel(position).toLowerCase()}`
      : `Use ${picked === HERO_SYMBOL_OFF ? 'no object' : `the ${heroSymbolLabel(picked)}`}`;

  return (
    <Modal title="Home page 3D object" onClose={onClose} maxWidth={860}>
      {saved === null ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : (
        <>
          <p className="m-0 mb-4 text-[13.5px] text-parish-muted leading-relaxed">
            A gold object in the rays behind the home page's welcome, slowly moving. Choose the one that suits the parish's patron or devotion, or turn it off.
            It is left out on phones saving data, and held still for visitors who turn motion off.
          </p>
          {!ready && (
            <div role="note" className="mb-4 px-4 py-3 rounded-xl border border-parish-warnBorder bg-parish-warnBg text-parish-warnStrong text-[13.5px] font-medium">
              Run the <strong>0117_hero_symbol.sql</strong> migration in Supabase to choose the object. Until then the home page shows the crucifix.
            </div>
          )}
          <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)] md:items-start">
            <SymbolPreview symbol={picked} />
            <div role="radiogroup" aria-label="3D object" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {options.map((o) => {
                const on = picked === o.key;
                return (
                  <button
                    key={o.key} type="button" role="radio" aria-checked={on} onClick={() => setPicked(o.key)}
                    className={`appearance-none text-left cursor-pointer rounded-xl px-3.5 py-2.5 border-[1.5px] transition ${on ? 'border-parish-blue bg-[var(--p-blue-tint)]' : 'border-parish-line2 bg-parish-card hover:border-[var(--p-blue-border)]'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden className={`w-4 h-4 flex-none rounded-full border-2 ${on ? 'border-parish-blue bg-parish-blue shadow-[inset_0_0_0_2px_white]' : 'border-parish-borderStrong'}`} />
                      <span className="font-bold text-[14px] text-parish-ink">{o.label}</span>
                      {o.key === saved && <span className="ml-auto text-[11.5px] font-semibold text-parish-muted">On the website</span>}
                    </span>
                    <span className="block mt-0.5 pl-6 text-[12.5px] leading-snug text-parish-muted">{o.note}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {picked !== HERO_SYMBOL_OFF && (
            <PositionPicker value={position} onChange={setPosition} saved={savedPosition} disabled={!ready || !positionReady} needsMigration={ready && !positionReady} />
          )}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {viewOnly && <span className="text-[13px] text-parish-muted">Your account can look but not change this.</span>}
            <GhostButton type="button" onClick={onClose} className="ml-auto px-5 py-2.5 text-[14px]">{dirty ? 'Cancel' : 'Close'}</GhostButton>
            {!viewOnly && (
              <PrimaryButton type="button" onClick={save} disabled={busy || !dirty || !ready} className="px-6 py-2.5 text-[14px]">
                {busy ? 'Saving…' : saveLabel}
              </PrimaryButton>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * Left, center or right: where the object sits across the hero on computers,
 * each drawn as a small hero with the text on the left and the object's spot.
 */
function PositionPicker({ value, onChange, saved, disabled, needsMigration }) {
  return (
    <div className="mt-5">
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <span id="hero-position-label" className="font-bold text-[14px] text-parish-ink">Position</span>
        <span className="text-[12.5px] text-parish-muted">On computers. On phones it always sits behind the text, in the middle.</span>
      </div>
      {needsMigration && (
        <div role="note" className="mb-3 px-4 py-3 rounded-xl border border-parish-warnBorder bg-parish-warnBg text-parish-warnStrong text-[13.5px] font-medium">
          Run the <strong>0118_hero_position.sql</strong> migration in Supabase to move the object. Until then it sits on the left.
        </div>
      )}
      <div role="radiogroup" aria-labelledby="hero-position-label" className="grid grid-cols-3 gap-2 max-w-[520px]">
        {HERO_POSITIONS.map((p) => {
          const on = value === p.key;
          const dot = { left: '34%', center: '50%', right: '76%' }[p.key];
          return (
            <button
              key={p.key} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(p.key)}
              className={`appearance-none text-left rounded-xl px-3 py-2.5 border-[1.5px] transition disabled:opacity-55 disabled:cursor-not-allowed ${disabled ? '' : 'cursor-pointer'} ${on ? 'border-parish-blue bg-[var(--p-blue-tint)]' : 'border-parish-line2 bg-parish-card enabled:hover:border-[var(--p-blue-border)]'}`}
            >
              <span aria-hidden className="relative block h-11 mb-2 rounded-md border border-parish-line2 overflow-hidden" style={{ background: 'var(--site-hero-bg)' }}>
                <span className="absolute left-[10%] top-[30%] w-[34%] h-[6px] rounded-full bg-parish-borderStrong opacity-70" />
                <span className="absolute left-[10%] top-[52%] w-[24%] h-[4px] rounded-full bg-parish-borderStrong opacity-50" />
                <span className="absolute top-1/2 w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: dot, background: 'radial-gradient(circle, #e8c25a 0 30%, rgba(232,194,90,.35) 31% 100%)' }} />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-[13.5px] text-parish-ink">{p.label}</span>
                {p.key === saved && <span className="ml-auto text-[11px] font-semibold text-parish-muted">Saved</span>}
              </span>
              <span className="block mt-0.5 text-[12px] leading-snug text-parish-muted">{p.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The chosen object moving in its rays, on the home page's background. */
function SymbolPreview({ symbol }) {
  const canvasRef = useRef(null);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const off = symbol === HERO_SYMBOL_OFF;

  useEffect(() => {
    if (off) return undefined;
    let stop = null;
    let cancelled = false;
    setShown(false);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('../site/heroGloryScene.js')
      .then(({ startGlory }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        stop = startGlory(canvas, {
          symbol,
          still,
          place: (rect) => ({ x: rect.width / 2, y: rect.height / 2, radius: Math.min(rect.width, rect.height) * 0.48 }),
          onReady: () => setShown(true),
        });
        if (!stop) setFailed(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [symbol, off]);

  return (
    <div className="relative aspect-square w-full max-w-[300px] mx-auto rounded-2xl overflow-hidden border border-parish-line2" style={{ background: 'var(--site-hero-bg)' }}>
      {off || failed ? (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-[13px] text-parish-muted">
          {off ? 'The home page shows its plain background, with no 3D object.' : 'This browser can’t show the 3D preview.'}
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} aria-label={`Preview: ${heroSymbolLabel(symbol)}`} role="img" className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-0'}`} />
          {!shown && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
        </>
      )}
    </div>
  );
}
