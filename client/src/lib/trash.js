// What the Trash (Settings → Trash) holds, how long it keeps it, and where each
// kind goes back to. The database side is 0014 (households and members) and
// 0103 (requests, donors and website content).

/** An entry is removed for good this many months after it was deleted (0103). */
export const TRASH_KEEP_MONTHS = 3;

/**
 * Every kind in the Trash: its name for the badge, the filter group it belongs
 * to ('household' | 'member' | 'request' | 'website') and the badge colour.
 */
export const TRASH_KINDS = {
  household: { label: 'Household', group: 'household', tone: 'gold' },
  member: { label: 'Member', group: 'member', tone: 'blue' },
  certificate_request: { label: 'Certificate request', group: 'request', tone: 'green' },
  sacrament_request: { label: 'Sacrament request', group: 'request', tone: 'green' },
  prayer_request: { label: 'Prayer request', group: 'request', tone: 'green' },
  blood_request: { label: 'Blood request', group: 'request', tone: 'red' },
  blood_donor: { label: 'Blood donor', group: 'request', tone: 'red' },
  announcement: { label: 'Announcement', group: 'website', tone: 'gray' },
  bulletin: { label: 'Bulletin', group: 'website', tone: 'gray' },
  event: { label: 'Event', group: 'website', tone: 'gray' },
  article: { label: 'Blog article', group: 'website', tone: 'gray' },
  history_article: { label: 'History chapter', group: 'website', tone: 'gray' },
  song: { label: 'Song', group: 'website', tone: 'gray' },
};

/** What the Trash page's filter offers: [value, label]. */
export const TRASH_FILTERS = [
  ['All', 'Everything'],
  ['household', 'Households'],
  ['member', 'Members'],
  ['request', 'Requests and donors'],
  ['website', 'Website content'],
];

export const trashKindLabel = (kind) => TRASH_KINDS[kind]?.label || kind;
export const trashGroup = (kind) => TRASH_KINDS[kind]?.group || 'website';

/** When an entry deleted at `deletedAt` is removed for good: the same date a database `+ 3 months` gives (a short month clamps). */
export function trashExpiry(deletedAt) {
  const d = new Date(deletedAt);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + TRASH_KEEP_MONTHS);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Whole days left before an entry is removed for good; 0 on the last day. */
export function trashDaysLeft(deletedAt, now = Date.now()) {
  return Math.max(0, Math.ceil((trashExpiry(deletedAt).getTime() - now) / 86400000));
}

/** "12 days left", "1 day left", "Last day". */
export function trashDaysLeftText(deletedAt, now = Date.now()) {
  const n = trashDaysLeft(deletedAt, now);
  if (n === 0) return 'Removed for good today';
  return `${n} ${n === 1 ? 'day' : 'days'} left`;
}

const refOf = (label) => String(label || '').split(' · ')[0];

/**
 * The admin page that shows a restored entry. Households and members open the
 * Households and Members lists on their name, a request opens its queue on
 * its reference number, website content opens its tab.
 */
export function trashOpenPath(row) {
  const q = encodeURIComponent(row.label || '');
  const ref = encodeURIComponent(refOf(row.label));
  switch (row.kind) {
    case 'household': return `/admin/households?status=All&q=${q}`;
    case 'member': return `/admin/members?q=${q}`;
    case 'certificate_request': return `/admin/requests?view=all&q=${ref}`;
    case 'sacrament_request': return `/admin/requests?tab=sacraments&view=All&q=${ref}`;
    case 'prayer_request': return `/admin/requests?tab=prayers&view=all&q=${ref}`;
    case 'blood_request':
    case 'blood_donor': return '/admin/requests?tab=blood&view=all';
    case 'announcement': return '/admin/website?tab=announcements';
    case 'bulletin': return '/admin/website?tab=bulletin';
    case 'event': return '/admin/website?tab=events';
    case 'article': return '/admin/website?tab=articles';
    case 'history_article': return '/admin/website?tab=history';
    case 'song': return '/admin/website?tab=downloads&kind=songs';
    default: return '/admin/settings/trash';
  }
}

/**
 * What a delete confirm says about the Trash. `withWhat` names what goes along:
 * trashNote(' with its photos') is "It goes to the Trash with its photos for 3
 * months, where staff with full access can put it back."
 */
export function trashNote(withWhat = '') {
  return `It goes to the Trash${withWhat} for ${TRASH_KEEP_MONTHS} months, where staff with full access can put it back.`;
}

/** The website content tables whose deletes go to the Trash (0103); Mass times and Downloads' forms don't. */
export const TRASHED_WEBSITE_TABLES = ['announcements', 'bulletins', 'events', 'articles', 'history_articles', 'songs'];

/** Whether deleting this kind for good also removes photos from storage. */
export const trashKindHasFiles = (kind) => kind === 'event' || kind === 'article' || kind === 'history_article';

/**
 * The photo addresses in a trashed row (`data.row` of a deleted_records entry):
 * an event's cover, a blog article's photos, a history chapter's photos and
 * video. These stay in storage while the entry is in the Trash.
 */
export function trashFiles(kind, row) {
  if (!row) return [];
  const gallery = (row.photos || []).map((p) => p?.url);
  let urls = [];
  if (kind === 'event') urls = [row.photo_url];
  else if (kind === 'article') urls = [row.photo_url, ...gallery];
  else if (kind === 'history_article') urls = [row.photo_url, row.body_photo_url, row.video_url, ...gallery];
  return [...new Set(urls.filter(Boolean))];
}

/** The confirm text for deleting one entry for good. */
export function trashPurgeMessage(row) {
  if (row.kind === 'household') return 'The household and its members are removed permanently and can’t be restored.';
  if (row.kind === 'member') return 'The member is removed permanently and can’t be restored.';
  if (trashKindHasFiles(row.kind)) return 'It is removed permanently, with its photos, and can’t be restored.';
  return 'It is removed permanently and can’t be restored.';
}

/** The toast after a restore: where the entry went back to. */
export function trashRestoredText(row) {
  const group = trashGroup(row.kind);
  if (group === 'household' || group === 'member') return `${row.label} is back in the registry`;
  if (group === 'request') return `${row.label} is back in Requests`;
  return `${row.label} is back under Parish Website`;
}
