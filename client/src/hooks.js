import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, downloadWithAuth } from './api.js';
import { useToast } from './ToastContext.jsx';
import { searchAndPage, readUrlState, mergeUrlState } from './lib/paging.js';

/**
 * Search + pagination state for a list that's already loaded in the page
 * (config lists, report tables). Typing resets to page 1.
 */
export function useClientList(items, toText, initialPageSize = 10) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  useEffect(() => { setPage(1); }, [query, pageSize]);
  const result = searchAndPage(items || [], { query, toText, page, pageSize });
  return { query, setQuery, page: result.page, setPage, pageSize, setPageSize, rows: result.rows, total: result.total };
}

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

/**
 * Admin-side check: true when another household already uses `name`
 * (ignoring case). `ownName` is the household's current name when editing,
 * so keeping it unchanged never warns. Errors resolve to "not taken", since
 * this only drives a warning, never a block.
 */
export function useHouseholdNameTaken(name, ownName = '') {
  const trimmed = String(name || '').trim();
  const debounced = useDebounced(trimmed, 400);
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    if (!debounced || debounced.toLowerCase() === String(ownName || '').trim().toLowerCase()) {
      setTaken(false);
      return;
    }
    let cancelled = false;
    api.householdNameAvailable(debounced)
      .then((ok) => { if (!cancelled) setTaken(!ok); })
      .catch(() => { if (!cancelled) setTaken(false); });
    return () => { cancelled = true; };
  }, [debounced, ownName]);
  return taken && debounced === trimmed;
}

/**
 * Run one of the CSV exports with a busy flag and an error toast, so a
 * failed or slow export doesn't look like a dead button. `busy` is the path
 * of the export in progress, or ''.
 */
export function useCsvExport() {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  async function run(path, filename) {
    setBusy(path);
    try {
      await downloadWithAuth(path, filename);
    } catch (e) {
      toast.error(e?.message || 'Could not export this data');
    } finally {
      setBusy('');
    }
  }
  return { busy, run };
}

/**
 * A list page's filters, search, sort and page kept in the address bar, so
 * a refresh, the Back button or a shared link brings back the same view.
 * `set(patch)` merges the patch and goes back to page 1 unless the patch
 * itself sets `page`. It replaces the history entry, so Back leaves the page
 * rather than undoing one filter at a time. See readUrlState for `allowed`.
 */
export function useUrlState(defaults, allowed) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params, defaults, allowed), [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((patch) => {
    setParams((prev) => mergeUrlState(prev, patch, defaults, allowed), { replace: true });
  }, [setParams]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, set];
}

/**
 * useClientList's search and paging for an in-memory list, driven by
 * useUrlState values `q`, `page` and `size` instead of local state.
 */
export function urlListPage(items, toText, url, setUrl) {
  const result = searchAndPage(items || [], { query: url.q, toText, page: url.page, pageSize: url.size });
  return {
    query: url.q, setQuery: (q) => setUrl({ q }),
    page: result.page, setPage: (page) => setUrl({ page }),
    pageSize: url.size, setPageSize: (size) => setUrl({ size }),
    rows: result.rows, total: result.total,
  };
}
