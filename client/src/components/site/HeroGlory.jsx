import React, { useEffect, useRef, useState } from 'react';

/**
 * Home's hero background: a slowly moving 3D gold object (`symbol`, a
 * lib/heroSymbols.js key: the crucifix unless the parish chose another) in
 * Our Lady of Guadalupe's rays (heroGloryScene.js), behind the hero's text.
 *
 * It loads once the page is idle, so it never slows the hero down, and fades
 * in after its first frame. Left out on Data Saver and very low-memory
 * phones, and held still for "reduce motion". `anchorRef` is the hero's text
 * column, which the glory is placed against; `position` ('left', 'center' or
 * 'right', the parish's choice) says where on computers. `bannerRef` is the
 * phones' photo banner, when there is one: there the glory sits in front of
 * the photo, in its middle, instead of behind the text.
 */
export default function HeroGlory({ anchorRef, bannerRef, symbol = 'crucifix', position = 'left', underBanner = false }) {
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
            symbol,
            still,
            place: placeGlory(anchorRef, position, bannerRef),
            observe: [anchorRef.current, bannerRef?.current],
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
  }, [anchorRef, bannerRef, symbol, position]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`site-hero-glory${underBanner ? ' site-hero-glory--banner' : ''}${shown ? ' is-shown' : ''}`} />;
}

/**
 * Where the glory sits, in the canvas's pixels. On computers, by `position`:
 * left is on the text column, toward its right side so the photo's edge
 * frames it; center is the middle of the hero; right is the middle of the
 * empty column beside the text, over the photo. On phones it is centred in
 * front of the photo banner when there is one (`bannerRef`; the CSS fades it
 * out below the banner so it stays off the text), else behind the text.
 */
function placeGlory(anchorRef, position = 'left', bannerRef = null) {
  return (rect) => {
    const el = anchorRef.current;
    const anchor = el?.getBoundingClientRect();
    if (!anchor) return { x: rect.width / 2, y: rect.height / 2, radius: Math.min(rect.width, rect.height) * 0.45 };
    const y = anchor.top + anchor.height / 2 - rect.top;
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const radius = Math.min(rect.height * 0.45, 300);
      if (position === 'center') return { x: rect.width / 2, y, radius };
      if (position === 'right' && el.parentElement) {
        // The hero's grid: the text column, a gap, then the empty column up to the padding.
        const grid = el.parentElement;
        const style = window.getComputedStyle(grid);
        const start = anchor.right + (parseFloat(style.columnGap) || 0);
        const end = grid.getBoundingClientRect().right - (parseFloat(style.paddingRight) || 0);
        return { x: (start + end) / 2 - rect.left, y, radius };
      }
      return { x: anchor.left + anchor.width * 0.7 - rect.left, y, radius };
    }
    const banner = bannerRef?.current?.getBoundingClientRect();
    if (banner && banner.height) {
      return { x: rect.width / 2, y: banner.top + banner.height / 2 - rect.top, radius: Math.min(rect.width * 0.5, banner.height * 0.72) };
    }
    return { x: rect.width / 2, y, radius: Math.min(rect.width * 0.62, 260) };
  };
}
