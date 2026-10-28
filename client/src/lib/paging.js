/**
 * Page numbers to show for `page` of `pageCount`: always the first and last
 * page, `around` pages either side of the current one, and 'gap' where pages
 * are skipped — e.g. [1, 'gap', 4, 5, 6, 'gap', 60]. A gap of a single page
 * shows that page instead, since "…" would take the same space.
 */
export function pageWindow(page, pageCount, around = 1) {
  if (pageCount <= 1) return [1];
  const keep = new Set([1, pageCount]);
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= pageCount) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) out.push('gap');
    out.push(p);
  });
  return out;
}

/**
 * Search + paginate a list that's already in memory. `toText(item)` returns
 * the text to match; every word of the query must appear (case-insensitive).
 * `page` is clamped so a shrinking result never lands on an empty page.
 */
export function searchAndPage(items, { query = '', toText = String, page = 1, pageSize = 10 } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length
    ? items.filter((item) => {
        const text = String(toText(item) ?? '').toLowerCase();
        return words.every((w) => text.includes(w));
      })
    : items;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    rows: matches.slice((current - 1) * pageSize, current * pageSize),
    total: matches.length,
    page: current,
  };
}

/**
 * Read every row of a query that the server caps per request (Supabase
 * returns at most 1,000 rows by default). `fetchPage(from, to)` resolves to
 * `{ data, error }` for the inclusive row range; pages are requested until
 * one comes back short. The query must have a stable order, or rows can be
 * skipped or repeated between pages.
 */
export async function fetchAllPages(fetchPage, chunkSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += chunkSize) {
    const { data, error } = await fetchPage(from, from + chunkSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < chunkSize) return { data: rows, error: null };
  }
}

/**
 * Page state (filters, search, sort, page) read from the address bar.
 * `defaults` lists every key and its default; a number default means the
 * value must be a positive whole number. `allowed` optionally lists the
 * valid values for a key. Unknown keys and invalid values fall back to the
 * default, so a hand-edited or stale link never breaks the page.
 */
export function readUrlState(params, defaults, allowed = {}) {
  const out = { ...defaults };
  for (const [key, def] of Object.entries(defaults)) {
    const raw = params.get(key);
    if (raw === null) continue;
    const value = typeof def === 'number' ? Number(raw) : raw;
    if (typeof def === 'number' && !(Number.isInteger(value) && value > 0)) continue;
    if (allowed[key] && !allowed[key].includes(value)) continue;
    out[key] = value;
  }
  return out;
}

/** The query-string entries for `values`, leaving out defaults so a clean page has a clean address. */
export function writeUrlState(values, defaults) {
  const out = {};
  for (const [key, def] of Object.entries(defaults)) {
    const value = values[key];
    if (value === undefined || value === null || String(value) === String(def)) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * The query string after applying `patch` to a list's URL state: back to
 * page 1 unless the patch sets `page`, defaults left out, and keys the list
 * doesn't own (e.g. the page's ?tab=) kept as they were.
 */
export function mergeUrlState(params, patch, defaults, allowed = {}) {
  const next = { ...readUrlState(params, defaults, allowed), ...patch };
  if (!('page' in patch) && 'page' in defaults) next.page = defaults.page;
  const others = Object.fromEntries([...params].filter(([key]) => !(key in defaults)));
  return { ...others, ...writeUrlState(next, defaults) };
}
