import { useEffect, useRef, useState } from 'react';

/** Debounce a rapidly-changing value — used so typing in search doesn't fire a request per keystroke. */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Run an async loader and track loading/error state, ignoring results from
 * superseded calls so fast filter changes can't render stale rows.
 */
export function useAsyncData(loader, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const call = ++latest.current;
    setLoading(true);
    setError('');
    Promise.resolve(loader())
      .then((res) => {
        if (call !== latest.current) return;
        setData(res);
      })
      .catch((e) => {
        if (call !== latest.current) return;
        setError(e?.message || 'Could not load data');
      })
      .finally(() => {
        if (call === latest.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}
