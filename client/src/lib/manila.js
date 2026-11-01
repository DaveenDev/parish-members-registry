// The parish's clock. The parish is in the Philippines, but many
// parishioners read the website from abroad (Saudi, Dubai, the US…), so
// "today", "the next Mass" and "open now" go by Manila time wherever the
// visitor is, the same as the database's parish_today(). Pure, so tested
// (client/test/manila.test.js).

export const PARISH_TIME_ZONE = 'Asia/Manila';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARISH_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parts(now) {
  const out = {};
  for (const p of fmt.formatToParts(now)) out[p.type] = p.value;
  return out;
}

/** Today in the Philippines, as YYYY-MM-DD, wherever the visitor is. */
export function manilaToday(now = new Date()) {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * The time in Manila as a Date whose own getters (getDay, getHours…) read
 * Manila's wall clock, for the code that works out "today" and "now" with
 * them. Only for reading the clock: don't send it anywhere as an instant.
 */
export function manilaNow(now = new Date()) {
  const p = parts(now);
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
}
