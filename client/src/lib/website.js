// Option lists and helpers for the Parish Website admin page. The values
// match the check constraints in supabase/migrations/0011_website_content.sql.

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MASS_KINDS = ['Mass', 'Anticipated Mass', 'Confession', 'Adoration', 'Other'];
export const MASS_LANGUAGES = ['Bisaya', 'English', 'Bisaya & English'];
export const DEFAULT_LOCATION = 'Main church';

export const ANNOUNCEMENT_CATEGORIES = ['Parish', 'GKK', 'Ministry', 'Schedule change'];

export const EVENT_TYPES = ['Fiesta', 'Novena', 'Recollection / Retreat', 'GKK Rotation', 'Seminar', 'Meeting', 'Other'];

export const EVENT_TONES = {
  Fiesta: 'gold',
  Novena: 'blue',
  'Recollection / Retreat': 'green',
  'GKK Rotation': 'blue',
  Seminar: 'gray',
  Meeting: 'gray',
  Other: 'gray',
};

/** "17:30:00" or "17:30" → "5:30 PM". */
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/** "17:30:00" → "17:30", the value an <input type="time"> expects. */
export function toTimeInput(t) {
  return t ? String(t).slice(0, 5) : '';
}

/** Today as YYYY-MM-DD in the browser's (the parish office's) time zone. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD plus `days`. */
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The Sunday on or before `iso` (bulletins are filed by the week's Sunday). */
export function sundayOf(iso) {
  const d = new Date(`${iso}T00:00`);
  return addDays(iso, -d.getDay());
}

/** Office hours for a parish that hasn't set them yet: Mon–Fri 8–5 with lunch, Sat 8–12, closed Sunday. */
export function defaultOfficeHours() {
  return DAYS.map((_, i) => {
    if (i === 0) return { closed: true, open: '', close: '', break_from: '', break_to: '' };
    if (i === 6) return { closed: false, open: '08:00', close: '12:00', break_from: '', break_to: '' };
    return { closed: false, open: '08:00', close: '17:00', break_from: '12:00', break_to: '13:00' };
  });
}

/** Saved office hours, padded to 7 days so older or partial data still edits cleanly. */
export function normalizeOfficeHours(saved) {
  if (!Array.isArray(saved) || saved.length !== 7) return defaultOfficeHours();
  return saved.map((d) => ({
    closed: !!d?.closed,
    open: d?.open || '',
    close: d?.close || '',
    break_from: d?.break_from || '',
    break_to: d?.break_to || '',
  }));
}

/** Where an announcement stands today: Draft, Scheduled, Expired or Live. */
export function announcementState(a, today = todayIso()) {
  if (!a.published) return 'Draft';
  if (a.publish_on > today) return 'Scheduled';
  if (a.expires_on && a.expires_on < today) return 'Expired';
  return 'Live';
}

export const STATE_TONES = { Draft: 'gray', Scheduled: 'blue', Expired: 'red', Live: 'green', Published: 'green' };
