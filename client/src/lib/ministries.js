// Ministries only men may serve in, such as Kaabag (ministries.men_only,
// 0038_men_only_ministries.sql). The database refuses to add anyone else;
// the admin pickers grey the choice out before that.

/** Used until the 0038 migration adds ministries.men_only. */
export const MEN_ONLY_FALLBACK = ['Kaabag'];

export const MEN_ONLY_NOTE = 'Men only';

/** Members' sex as stored ('Male' / 'Female'); anything else (or blank) isn't male. */
export const isMale = (sex) => sex === 'Male';

/**
 * True when a member of `sex` may not be added to ministry `name`.
 * `menOnly` is a Set of men-only ministry names (api.menOnlyMinistries).
 * `selected` (already in it) is never blocked, so it can still be removed.
 */
export function menOnlyBlocked(name, sex, menOnly, selected = false) {
  return !selected && !!menOnly?.has(name) && !isMale(sex);
}

export const menOnlyMessage = (name) => `${name} is for men only.`;
