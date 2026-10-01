import { PARTNERED_STATUSES } from '../constants.js';

export const WEDDING_FIELDS = ['matType', 'hasMatrimony', 'matDate', 'matChurch'];

/**
 * Keep each Spouse in step with the head (members[0]): they share the head's
 * Married / Live-in status and, when both are married, the same wedding. The
 * `civilFromHead` / `weddingFromHead` flags mark values that were filled in
 * automatically; once the spouse's own answer is edited by hand it's left
 * alone. Returns the same member objects when nothing needs to change.
 */
export function syncSpouses(members) {
  const head = members[0];
  if (!head) return members;
  return members.map((m, idx) => {
    if (idx === 0 || m.relationship !== 'Spouse') return m;
    let next = m;
    if (PARTNERED_STATUSES.includes(head.civilStatus) && (m.civilFromHead || !m.civilStatus) && m.civilStatus !== head.civilStatus) {
      next = { ...next, civilStatus: head.civilStatus, civilFromHead: true };
    }
    if (head.civilStatus === 'Married' && next.civilStatus === 'Married' && head.matType && (next.weddingFromHead || !next.matType)) {
      const differs = WEDDING_FIELDS.some((f) => next[f] !== head[f]);
      if (differs) next = { ...next, ...Object.fromEntries(WEDDING_FIELDS.map((f) => [f, head[f]])), weddingFromHead: true };
    }
    return next;
  });
}
