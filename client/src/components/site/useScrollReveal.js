import { useEffect } from 'react';

// What rises into view on the website as it's scrolled to: the cards (the
// shadow-card classes), headings, and anything marked data-reveal (a heading
// with its eyebrow, a card with its share button). A block inside one that
// already moves stays put with it. Menus, dialogs and buttons never move.
const TARGETS = 'h2, .shadow-card, .shadow-cardSm, [data-reveal]';
const SKIP = 'nav, header, [role="dialog"], [data-no-reveal]';
// Blocks that come into view together follow one another, this far apart, up to MAX_STAGGER.
const STAGGER_MS = 80;
const MAX_STAGGER = 6;

/**
 * Scroll reveal for the public website's pages, inside `rootRef`. Only what
 * is below the screen when it appears waits for the visitor to scroll to it,
 * so a page's first screen is never held back (it has the page's own fade,
 * animate-fadeUp), and content that loads later is picked up as it arrives.
 * Nothing moves with reduced motion, or in a browser without
 * IntersectionObserver.
 */
export function useScrollReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const io = new IntersectionObserver((entries) => {
      const shown = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
      shown.forEach((e, i) => {
        const el = e.target;
        io.unobserve(el);
        el.style.animationDelay = `${Math.min(i, MAX_STAGGER) * STAGGER_MS}ms`;
        el.classList.add('site-reveal-in');
        // Back to plain once it's in, so no transform is left behind for sticky or fixed children.
        const done = (ev) => {
          if (ev.target !== el) return;
          el.removeEventListener('animationend', done);
          el.classList.remove('site-reveal', 'site-reveal-in');
          el.style.animationDelay = '';
        };
        el.addEventListener('animationend', done);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });

    let frame = 0;
    const scan = () => {
      frame = 0;
      const fold = window.innerHeight;
      for (const el of root.querySelectorAll(TARGETS)) {
        if (el.hasAttribute('data-rv')) continue;
        // Marked whether it moves or not, so what's inside it is left alone either way.
        el.setAttribute('data-rv', '');
        if (el.parentElement?.closest('[data-rv]') || el.closest(SKIP) || el.matches('button')) continue;
        if (el.getBoundingClientRect().top < fold) continue;
        el.classList.add('site-reveal');
        io.observe(el);
      }
    };
    // A frame later, so a new page is measured after the layout has scrolled it to the top.
    const later = () => { if (!frame) frame = requestAnimationFrame(scan); };
    later();
    const mo = new MutationObserver(later);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      io.disconnect();
      for (const el of root.querySelectorAll('.site-reveal')) el.classList.remove('site-reveal', 'site-reveal-in');
    };
  }, [rootRef]);
}
