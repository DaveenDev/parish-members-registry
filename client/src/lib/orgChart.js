// Organization Structure charts (00571_org_chart.sql): the tree helpers the
// admin editor and the website chart share. Pure, so they can be unit tested.
//
// The editor works on positions keyed by `key` (the database id as a string,
// or a temporary key for a position not saved yet) with `parentKey` pointing
// at the position above (null at the top).

/** A temporary key for a new position. */
export const NEW_PREFIX = 'new-';
export const isNewKey = (key) => String(key).startsWith(NEW_PREFIX);

/** "JD" for "Juan Dela Cruz", "M" for "Maria": a photo's stand-in. */
export function nameInitials(name) {
  const words = String(name || '').trim().split(/\s+/)
    .filter((w) => /\p{L}/u.test(w) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  if (!words.length) return '';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

/** Text that goes inside the website chart's HTML, which comes from the database. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Only an https link may go into an <img src> on the website. */
export function safePhotoUrl(url) {
  const u = String(url || '').trim();
  return /^https:\/\//i.test(u) ? u : '';
}

/** A Map of key → the keys directly under it. */
function childrenOf(nodes) {
  const map = new Map();
  for (const n of nodes) {
    if (n.parentKey == null) continue;
    if (!map.has(n.parentKey)) map.set(n.parentKey, []);
    map.get(n.parentKey).push(n.key);
  }
  return map;
}

/** Every key below `key`, however far down. */
export function descendantKeys(nodes, key) {
  const kids = childrenOf(nodes);
  const out = new Set();
  const stack = [...(kids.get(key) || [])];
  while (stack.length) {
    const k = stack.pop();
    if (out.has(k)) continue;
    out.add(k);
    stack.push(...(kids.get(k) || []));
  }
  return out;
}

/** True when putting `childKey` under `parentKey` would place it under itself. */
export function wouldCreateCycle(nodes, childKey, parentKey) {
  if (parentKey == null) return false;
  if (parentKey === childKey) return true;
  return descendantKeys(nodes, childKey).has(parentKey);
}

/** The first position found above itself (a loop), or null. */
export function findCycle(nodes) {
  const parent = new Map(nodes.map((n) => [n.key, n.parentKey ?? null]));
  for (const n of nodes) {
    const seen = new Set([n.key]);
    let p = parent.get(n.key);
    while (p != null && parent.has(p)) {
      if (seen.has(p)) return n;
      seen.add(p);
      p = parent.get(p);
    }
  }
  return null;
}

export const hasCycle = (nodes) => findCycle(nodes) !== null;

/** The positions without `key`; the ones directly under it move up to its parent. */
export function removeLiftingChildren(nodes, key) {
  const gone = nodes.find((n) => n.key === key);
  if (!gone) return nodes;
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => (n.parentKey === key ? { ...n, parentKey: gone.parentKey ?? null } : n));
}

/**
 * Each position's place among its siblings, left to right on the canvas
 * (then top to bottom): { key: 0, … }. This is the order the website shows.
 */
export function siblingOrder(nodes) {
  const groups = new Map();
  for (const n of nodes) {
    const g = n.parentKey ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(n);
  }
  const order = {};
  for (const list of groups.values()) {
    [...list]
      .sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0) || String(a.key).localeCompare(String(b.key)))
      .forEach((n, i) => { order[n.key] = i; });
  }
  return order;
}

/** The editor's positions as save_org_chart() takes them. A parent that isn't in the chart becomes none. */
export function savePayload(nodes) {
  const keys = new Set(nodes.map((n) => n.key));
  const order = siblingOrder(nodes);
  const round = (v) => (Number.isFinite(v) ? Math.round(v) : null);
  return nodes.map((n) => ({
    key: String(n.key),
    id: isNewKey(n.key) ? null : Number(n.key),
    parentKey: n.parentKey != null && keys.has(n.parentKey) ? String(n.parentKey) : null,
    title: (n.title || '').trim(),
    positionName: n.positionName || null,
    gkkRole: n.gkkRole || null,
    // GKK Structure: how many people the position takes (null: any number, 0081).
    maxHolders: Number.isInteger(n.maxHolders) && n.maxHolders > 0 ? n.maxHolders : null,
    memberId: n.memberId || null,
    holderName: (n.holderName || '').trim() || null,
    photoUrl: n.photoUrl || null,
    note: (n.note || '').trim() || null,
    sortOrder: order[n.key] ?? 0,
    x: round(n.x),
    y: round(n.y),
  }));
}

/** org_nodes rows (with an embedded `member`) as editor positions. */
export function fromRows(rows) {
  return (rows || []).map((r) => ({
    key: String(r.id),
    parentKey: r.parent_id == null ? null : String(r.parent_id),
    title: r.position_name || r.title || '',
    positionName: r.position_name || null,
    gkkRole: r.gkk_role || null,
    // Before 0081 every position took one person.
    maxHolders: r.max_holders === undefined ? 1 : r.max_holders,
    memberId: r.member_id || null,
    memberName: r.member ? [r.member.first_name, r.member.last_name, r.member.suffix].filter(Boolean).join(' ') : '',
    holderName: r.holder_name || '',
    photoUrl: r.photo_url || '',
    note: r.note || '',
    sortOrder: r.sort_order ?? 0,
    x: r.pos_x,
    y: r.pos_y,
  }));
}

/**
 * What saving a chart did to holders' Katungdanan sa Parish
 * (save_org_chart's `roles`), in one line; '' when nothing changed.
 */
export function parishRoleNote(changes) {
  if (!changes?.length) return '';
  const parts = changes.map((c) => `${c.name || 'A member'}: ${c.to || 'none'}`);
  return `Katungdanan sa Parish updated in the registry. ${parts.join('; ')}.`;
}

/** The name shown on a position in the editor: the member, else the typed name. */
export function holderOf(n) {
  return n.memberName || n.holderName || '';
}

export const HIDDEN_ROOT = '__root';

/**
 * A published chart's nodes ({ id, parentId, title, holders, photo, note },
 * siblings in order) as d3-org-chart rows: string ids, a parent that isn't
 * in the chart becomes none, and several top positions share a hidden root
 * (the chart draws one tree).
 */
export function toD3Rows(nodes) {
  const list = nodes || [];
  const ids = new Set(list.map((n) => String(n.id)));
  const rows = list.map((n, i) => ({
    ...n,
    id: String(n.id),
    parentId: n.parentId != null && ids.has(String(n.parentId)) && String(n.parentId) !== String(n.id) ? String(n.parentId) : null,
    order: i,
  }));
  // A loop can't be drawn: cut it where it closes.
  const loop = findCycle(rows.map((r) => ({ key: r.id, parentKey: r.parentId })));
  if (loop) rows.find((r) => r.id === loop.key).parentId = null;
  const tops = rows.filter((r) => r.parentId == null);
  if (tops.length <= 1) return rows;
  return [{ id: HIDDEN_ROOT, parentId: null, hidden: true, title: '', holders: [], order: -1 }, ...rows.map((r) => (r.parentId == null ? { ...r, parentId: HIDDEN_ROOT } : r))];
}
