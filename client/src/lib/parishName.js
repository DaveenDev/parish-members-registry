// The parish's name as every page shows it: the name saved in Parish Config
// (Settings → Parish Config → name), so another parish sets its own there
// instead of in the code. Pure, so the share previews (api/share.js) and the
// tests use it too.

// Shown when no name is saved (or while it loads on a first visit).
export const FALLBACK_PARISH_NAME = 'Parish Members Registry, Census & Website';

/**
 * The saved name split for a two-line heading: `name` is the big line and
 * `sub` the small one under it. A trailing "Quasi-Parish" or "Parish" moves
 * to `sub`, with the place after it when the name gives one ("Our Lady of
 * Guadalupe Quasi-Parish, Mua-an" → "Our Lady of Guadalupe" over
 * "Quasi-Parish · Mua-an"). `full` is the name as saved and `title` the
 * one-line form (the browser tab's). `saved` is the saved name alone, '' when
 * there's none, for text that reads better saying "the parish" than the fallback.
 */
export function parishTitle(saved) {
  const own = String(saved || '').trim();
  const full = own || FALLBACK_PARISH_NAME;
  const m = full.match(/^(.+?)\s+((?:Quasi-)?Parish)(?:\s*[,·]\s*(.+))?$/i);
  const name = m ? m[1] : full;
  const sub = m ? [m[2], m[3]].filter(Boolean).join(' · ') : '';
  return { name, sub, full, title: sub ? `${name} ${sub}` : name, saved: own };
}
