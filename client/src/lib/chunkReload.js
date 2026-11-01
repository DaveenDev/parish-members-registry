// A page's code that fails to download: on a weak signal, or after a deploy
// while the site was open (the old file names are gone). One quiet reload
// fetches the new index.html and its files; a second failure within a minute
// is left to the error screen, so a phone that's offline doesn't loop.

const KEY = 'pmr_chunk_reload';
const WINDOW_MS = 60_000;

/** Whether `err` is a failed download of a page's code (a dynamic import). */
export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

/**
 * True (and the time noted) when a reload is worth trying: none in the last
 * minute. `storage` is sessionStorage, or anything with getItem/setItem.
 */
export function shouldReload(storage, now = Date.now()) {
  try {
    const last = Number(storage.getItem(KEY)) || 0;
    if (now - last < WINDOW_MS) return false;
    storage.setItem(KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** Reload once for a failed page download; false when it already tried. */
export function reloadForNewCode() {
  if (typeof window === 'undefined' || !shouldReload(window.sessionStorage)) return false;
  window.location.reload();
  return true;
}
