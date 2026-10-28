// The prayer wall (0100 migration): requests for prayer from parishioners.
// The person asking chooses whether it may show on the website and until
// when; staff approve each one before it does. The rules here are the
// database's own (prayer_request_is_public, request_inbox_counts), so the
// admin and the website agree with what the public functions return.
import { addDays, todayIso } from './website.js';

/** The longest a request may show on the website, in days from today. Same as submit_prayer_request(). */
export const PRAYER_MAX_DAYS = 90;

// Values are what the database stores (0012's check constraint).
export const PRAYER_TYPES = ['For the sick', 'Thanksgiving', 'For the departed', 'Special intention'];
export const PRAYER_STATUSES = ['New', 'Prayed for', 'Archived'];

/** What the website calls each kind. */
export const PRAYER_TYPE_LABELS = {
  'For the sick': 'Para sa masakiton',
  Thanksgiving: 'Pagpasalamat',
  'For the departed': 'Para sa namatay',
  'Special intention': 'Espesyal nga intensyon',
};
export const prayerTypeLabel = (type) => PRAYER_TYPE_LABELS[type] || PRAYER_TYPE_LABELS['Special intention'];

export const PRAYER_WALL = '/komunidad/pag-ampo';
export const PRAYER_FORM = '/serbisyo/hangyo/pag-ampo';
export const prayerPath = (id) => `${PRAYER_WALL}/${id}`;

/** The first and last day a person may choose for "show until", from `today` (YYYY-MM-DD). */
export function showUntilBounds(today = todayIso()) {
  return { min: today, max: addDays(today, PRAYER_MAX_DAYS) };
}

/** Whether `iso` is a "show until" date the database accepts today. */
export function validShowUntil(iso, today = todayIso()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
  const { min, max } = showUntilBounds(today);
  return iso >= min && iso <= max;
}

/**
 * Whether the website shows request `r` on `today`: the person asked for
 * it, staff approved it, it isn't archived and its last day hasn't passed.
 * Same rule as prayer_request_is_public() in 0100.
 */
export function isShownNow(r, today = todayIso()) {
  return !!(r && r.allow_public && r.show_publicly && r.status !== 'Archived' && r.show_until && r.show_until >= today);
}

/**
 * Whether request `r` is waiting for staff: one for the website that nobody
 * has decided on yet, or a private one not yet prayed for. Same rule as the
 * prayers count in request_inbox_counts() (0100).
 */
export function needsAttention(r) {
  if (!r) return false;
  if (r.allow_public) return !r.show_publicly && !r.reviewed_at && r.status !== 'Archived';
  return r.status === 'New';
}

/** Where request `r` stands with the website, for its row in the admin. */
export function websiteState(r, today = todayIso()) {
  if (!r?.allow_public) return 'private';
  if (isShownNow(r, today)) return 'shown';
  if (r.show_publicly && r.status !== 'Archived') return 'ended'; // approved, but its date has passed (or none set)
  if (needsAttention(r)) return 'review';
  return 'hidden';
}

/** A request's heading on the website: who it's for, else its kind. */
export function prayerTitle(r) {
  const who = String(r?.for_name || '').trim();
  return who ? `Para kang ${who}` : prayerTypeLabel(r?.type ?? r?.intention_type);
}

/** Who asked, as the website shows it: their name only when they chose that. */
export const prayerFrom = (r) => String(r?.name || '').trim() || 'Usa ka parokyano';

// ---- "Nag-ampo ko" -----------------------------------------------------------

const VISITOR_KEY = 'pmr_prayer_visitor';
/** The browser's id, as prayer_visitor_key() in 0100 accepts it. */
export const validVisitorId = (s) => /^[A-Za-z0-9-]{16,64}$/.test(String(s || ''));

function newVisitorId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let memoryId = null;

/**
 * This browser's random id for counting "Nag-ampo ko" once per request. Kept
 * in localStorage; where that's blocked (a private window), one for this
 * visit. Never tied to a name.
 */
export function prayerVisitorId() {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (validVisitorId(saved)) return saved;
    const id = newVisitorId();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    if (!memoryId) memoryId = newVisitorId();
    return memoryId;
  }
}
