import { useCallback, useEffect, useState } from 'react';

// Public pages share their data for the visit: switching tabs or going back
// shows what was already loaded instead of fetching again over slow mobile
// data. A failed load isn't kept, so "Sulayi pag-usab" really retries.
const cache = new Map();

function load(key, loader) {
  if (!cache.has(key)) {
    const p = Promise.resolve().then(loader);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

/** { data, loading, error, reload } for `loader`, cached under `key`. */
export function usePublicData(key, loader) {
  const [state, setState] = useState({ data: undefined, loading: true, error: '' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, loading: true, error: '' }));
    load(key, loader)
      .then((data) => live && setState({ data, loading: false, error: '' }))
      .catch((e) => live && setState({ data: undefined, loading: false, error: e?.message || 'Wala ma-load' }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => { cache.delete(key); setNonce((n) => n + 1); }, [key]);
  return { ...state, reload };
}
