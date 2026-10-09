// A GKK's structure (0081_gkk_structure_leaders.sql): the GKK Structure's
// positions, the same for every GKK, and the GKK's people in each one. The
// GKK leader fills it in and sends it; the parish office approves it. Pure
// helpers for the structure tab and its printout, so they can be tested.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The positions top to bottom as on the paper form: each one followed by
 * the ones under it, siblings in order, with `depth` (0 at the top) and
 * `hasChildren`. Positions whose parent is missing come out at the top.
 */
export function positionRows(positions) {
  const list = positions || [];
  const ids = new Set(list.map((p) => p.id));
  const kids = new Map();
  for (const p of list) {
    const parent = p.parentId != null && ids.has(p.parentId) && p.parentId !== p.id ? p.parentId : null;
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(p);
  }
  const out = [];
  const seen = new Set();
  const walk = (parent, depth) => {
    for (const p of kids.get(parent) || []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ ...p, depth, hasChildren: (kids.get(p.id) || []).length > 0 });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  // Anything in a loop (shouldn't happen: the editor refuses one).
  for (const p of list) if (!seen.has(p.id)) out.push({ ...p, depth: 0, hasChildren: false });
  return out;
}

/** "Padua, Analiza L." from a member's name parts; a typed name as typed. */
export function formalName(o) {
  if (!o) return '';
  const last = clean(o.lastName);
  const first = clean(o.firstName);
  if (!last || !first) return clean(o.name);
  const middle = clean(o.middleName);
  const initial = middle ? ` ${middle[0].toUpperCase()}.` : '';
  const suffix = clean(o.suffix);
  return `${last}${suffix ? ` ${suffix}` : ''}, ${first}${initial}`;
}

/** "Analiza Padua", the name as the website shows it. */
export const displayName = (o) => clean(o?.name) || [o?.firstName, o?.lastName, o?.suffix].map(clean).filter(Boolean).join(' ');

/** "January 18, 1972" for a yyyy-mm-dd birthdate, '' without one. */
export function birthdateText(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob || ''));
  if (!m) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** "one person", "2 people", "any number" for a position's limit. */
export const maxText = (max) => (max == null ? 'any number' : max === 1 ? 'one person' : `up to ${max}`);

/** The same person: the same member, or the same typed name. */
export function samePerson(a, b) {
  if (a.memberId || b.memberId) return !!a.memberId && a.memberId === b.memberId;
  return clean(a.name).toLowerCase() === clean(b.name).toLowerCase();
}

/** What's wrong before saving (the database checks the same), or ''. */
export function structureProblem(positions, officers) {
  const byId = new Map((positions || []).map((p) => [p.id, p]));
  const seen = new Map();
  for (const o of officers || []) {
    const p = byId.get(o.nodeId);
    if (!p) return 'A position here is no longer on the GKK Structure. Reload the page.';
    if (!o.memberId && !clean(o.name)) return `Type the full name for ${p.title}, or pick a member`;
    if (clean(o.name).length > 120) return 'Keep names under 120 characters';
    if (clean(o.note).length > 60) return `Keep the note by ${displayName(o)} under 60 characters`;
    const here = seen.get(o.nodeId) || [];
    if (here.some((x) => samePerson(x, o))) return `${displayName(o)} is in ${p.title} twice`;
    here.push(o);
    seen.set(o.nodeId, here);
    if (p.max != null && here.length > p.max) return `${p.title} takes ${p.max === 1 ? 'one person' : `${p.max} people`} at most`;
  }
  return '';
}

/** The officers as save_gkk_structure() takes them, in the order of the positions. */
export function savePayload(positions, officers) {
  const rank = new Map(positionRows(positions).map((p, i) => [p.id, i]));
  return [...(officers || [])]
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (rank.get(a.o.nodeId) ?? 1e9) - (rank.get(b.o.nodeId) ?? 1e9) || a.i - b.i)
    .map(({ o }) => ({
      nodeId: o.nodeId,
      memberId: o.memberId || null,
      name: clean(o.name) || null,
      note: clean(o.note) || null,
    }));
}

/** A comparable form of a list of officers, for "unsaved changes". */
export const snapshot = (positions, officers) => JSON.stringify(savePayload(positions, officers));

/**
 * What a draft changes from the approved structure, position by position:
 * [{ id, title, added: [name], removed: [name] }], only positions that change.
 */
export function structureChanges(positions, live, draft) {
  const out = [];
  for (const p of positionRows(positions)) {
    const before = (live || []).filter((o) => o.nodeId === p.id);
    const after = (draft || []).filter((o) => o.nodeId === p.id);
    const added = after.filter((o) => !before.some((b) => samePerson(b, o))).map(displayName);
    const removed = before.filter((o) => !after.some((a) => samePerson(a, o))).map(displayName);
    if (added.length || removed.length) out.push({ id: p.id, title: p.title, added, removed });
  }
  return out;
}

/**
 * The other positions each person holds: Map of officer key → [titles],
 * for the "also: President" hint. Keyed by member id ("m12") or typed name.
 */
export function otherPositions(positions, officers) {
  const title = new Map((positions || []).map((p) => [p.id, p.title]));
  const key = (o) => (o.memberId ? `m${o.memberId}` : `n${clean(o.name).toLowerCase()}`);
  const held = new Map();
  for (const o of officers || []) {
    const k = key(o);
    if (!held.has(k)) held.set(k, []);
    held.get(k).push(o.nodeId);
  }
  return (o) => (held.get(key(o)) || []).filter((id) => id !== o.nodeId).map((id) => title.get(id)).filter(Boolean);
}

/** The structure's status for the GKK leader, in one line. */
export function statusText(state) {
  if (!state?.status) return state?.approvedAt ? 'Approved, on the website' : 'Not sent yet';
  return { draft: 'Draft, not sent yet', submitted: 'Sent, waiting for the parish office', returned: 'Sent back by the parish office' }[state.status] || '';
}
