import React, { useEffect, useRef, useState } from 'react';

/**
 * Home's hero background: a slowly moving 3D gold cross in Our Lady of
 * Guadalupe's rays (heroGloryScene.js), behind the hero's text.
 *
 * It loads once the page is idle, so it never slows the hero down, and fades
 * in after its first frame. Left out on Data Saver and very low-memory
 * phones, and held still for "reduce motion". `anchorRef` is the hero's text
 * column, which the glory is centred on.
 */
export default function HeroGlory({ anchorRef, underBanner = false }) {
  const canvasRef = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const nav = navigator;
    if (nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory < 2)) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stop = null;
    let cancelled = false;

    function start() {
      import('./heroGloryScene.js')
        .then(({ startGlory }) => {
          const canvas = canvasRef.current;
          if (cancelled || !canvas) return;
          stop = startGlory(canvas, {
            still,
            place: placeGlory(anchorRef),
            observe: [anchorRef.current],
            onReady: () => setShown(true),
          });
        })
        .catch(() => {});
    }

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 2000 })
      : window.setTimeout(start, 700);
    return () => {
      cancelled = true;
      if (window.requestIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      stop?.();
    };
  }, [anchorRef]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`site-hero-glory${underBanner ? ' site-hero-glory--banner' : ''}${shown ? ' is-shown' : ''}`} />;
}

/**
 * Where the glory sits, in the canvas's pixels. On computers it is centred
 * on the text column, toward its right side so the photo's edge frames it;
 * on phones it is centred behind the text (`underBanner` fades it out
 * toward the photo banner above).
 */
function placeGlory(anchorRef) {
  return (rect) => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return { x: rect.width / 2, y: rect.height / 2, radius: Math.min(rect.width, rect.height) * 0.45 };
    const y = anchor.top + anchor.height / 2 - rect.top;
    if (window.matchMedia('(min-width: 1024px)').matches) {
      return {
        x: anchor.left + anchor.width * 0.7 - rect.left,
        y,
        radius: Math.min(rect.height * 0.45, 300),
      };
    }
    return { x: rect.width / 2, y, radius: Math.min(rect.width * 0.62, 260) };
  };
}
