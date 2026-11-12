import React, { useEffect, useState } from 'react';

/**
 * Home hero's glow: soft gold ink that follows the mouse across the hero and
 * cools to the theme's blue as it fades (React Bits' Glow Cursor, in
 * GlowCursor.jsx). It sits over the photo and the 3D glory, under the text,
 * and never takes a click: the light is drawn from window pointer events.
 *
 * Only on computers with a mouse, from the desktop width up. On phones there
 * is no pointer to follow. Left out on Data Saver, on low-memory devices and
 * for "reduce motion", and loaded once the page is idle so it never slows
 * the hero. It stops drawing by itself when the hero is scrolled away, the
 * tab is hidden or the light has faded.
 *
 * `toneRef` is an element inside the parish's theme, read once for its gold
 * and blue so the light matches whichever theme the parish chose.
 */
const WANTED = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
const STILL = '(prefers-reduced-motion: reduce)';

export default function HeroGlowCursor({ toneRef }) {
  const [fits, setFits] = useState(false);
  const [Glow, setGlow] = useState(null);
  const [tones, setTones] = useState(null);

  // Whether this device should have it, followed as the window resizes.
  useEffect(() => {
    const nav = navigator;
    if (nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory < 4)) return undefined;
    const wanted = window.matchMedia(WANTED);
    const still = window.matchMedia(STILL);
    const check = () => setFits(wanted.matches && !still.matches);
    check();
    wanted.addEventListener?.('change', check);
    still.addEventListener?.('change', check);
    return () => {
      wanted.removeEventListener?.('change', check);
      still.removeEventListener?.('change', check);
    };
  }, []);

  // Load it after the page is idle, the first time it fits.
  useEffect(() => {
    if (!fits || Glow) return undefined;
    let cancelled = false;
    function load() {
      import('./GlowCursor.jsx')
        .then((mod) => {
          if (cancelled) return;
          const style = window.getComputedStyle(toneRef?.current || document.documentElement);
          const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
          setTones({ fresh: read('--p-gold-light', '#e4c06a'), cool: read('--p-blue', '#34589c') });
          setGlow(() => mod.default);
        })
        .catch(() => {});
    }
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(load, { timeout: 2500 })
      : window.setTimeout(load, 900);
    return () => {
      cancelled = true;
      if (window.requestIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [fits, Glow, toneRef]);

  if (!fits || !Glow || !tones) return null;
  return (
    <div aria-hidden="true" className="site-hero-glow">
      <Glow
        theme="light"
        color={tones.fresh}
        secondaryColor={tones.cool}
        intensity={1}
        trailWidth={6}
        linger={1.4}
        glow={1.3}
        hotspot={0.4}
        followSpeed={0.6}
        quality="medium"
        maxDevicePixelRatio={1.5}
        clickBurst
      />
    </div>
  );
}
