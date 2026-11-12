import React, { useEffect, useState } from 'react';

/**
 * Home hero's glow: warm white light that follows the mouse across the hero
 * and cools to gold as it fades, like candlelight or a halo (React Bits' Glow
 * Cursor, in GlowCursor.jsx). It sits over the photo and the 3D glory, under
 * the text, and never takes a click: the light is drawn from window pointer
 * events.
 *
 * It is drawn as light (screen blend), not ink, so it brightens what is
 * under it: strongest over the photo, a faint warmth over the pale side.
 * The colours are fixed rather than the theme's, so it is the same light
 * whichever theme the parish chose.
 *
 * Only on computers with a mouse, from the desktop width up. On phones there
 * is no pointer to follow. Left out on Data Saver, on low-memory devices and
 * for "reduce motion", and loaded once the page is idle so it never slows
 * the hero. It stops drawing by itself when the hero is scrolled away, the
 * tab is hidden or the light has faded.
 */
const WANTED = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
const STILL = '(prefers-reduced-motion: reduce)';
const FRESH = '#fff8e1'; // warm white where it is drawn
const COOL = '#ffc93c'; // gold as it fades

export default function HeroGlowCursor() {
  const [fits, setFits] = useState(false);
  const [Glow, setGlow] = useState(null);

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
        .then((mod) => { if (!cancelled) setGlow(() => mod.default); })
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
  }, [fits, Glow]);

  if (!fits || !Glow) return null;
  return (
    <div aria-hidden="true" className="site-hero-glow">
      <Glow
        theme="dark"
        blendMode="screen"
        color={FRESH}
        secondaryColor={COOL}
        intensity={1.2}
        trailWidth={5}
        linger={1.4}
        glow={1.6}
        hotspot={0.8}
        followSpeed={0.6}
        quality="medium"
        maxDevicePixelRatio={1.5}
        clickBurst
      />
    </div>
  );
}
