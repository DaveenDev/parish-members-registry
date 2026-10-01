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
