import { paragraphs } from './site.js';

// The History page (Parish Website → History, 0068): one main article, then
// chapters in order of year. Shared by the admin tab and the public page.

export const HISTORY_PAGE = '/simbahan/kasaysayan';

/** Chapters oldest first; the same year keeps the order they were added in. */
export function sortChapters(rows) {
  return [...rows].filter((r) => !r.is_main).sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id - b.id);
}

/** What the timeline shows for a chapter: its own label ("1950–1965", "Hunyo 1952") or its year. */
export function historyWhen(row) {
  const label = String(row?.date_label || '').trim();
  return label || (row?.year != null ? String(row.year) : '');
}

/** The opening paragraph of an article, for the excerpt on Ang Simbahan. */
export function openingParagraph(text) {
  return paragraphs(text)[0] || '';
}

/** The anchor of a chapter on the History page (/simbahan/kasaysayan#tuig-12). */
export const chapterAnchor = (row) => `tuig-${row.id}`;

/** A year typed in the admin: a whole number from 1000 to 2999, or null. */
export function parseYear(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1000 && n <= 2999 ? n : null;
}
