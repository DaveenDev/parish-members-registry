// The setup checklist for a new parish office account (the parish
// secretary): the parish settings still to fill in, each ticked off by
// itself once it's set, or marked done by the person. Shown as a pop-up once
// a day until they choose "Don't show again", and at the top of Parish
// Config until every step is done. Pure, so it can be unit tested.
import { can } from './access.js';

/**
 * Every step: `need` is the access rule (lib/access.js) the account must
 * have to see it, `done(facts)` whether the parish has it already. `counts`
 * are null when they couldn't be read, so a step is never ticked by mistake.
 */
export const SETUP_STEPS = [
  {
    key: 'logo', need: 'settings', label: 'Upload the parish logo',
    note: 'Shown on the sign-in page, the sidebar and printed sheets.',
    to: '/admin/settings', done: ({ settings }) => !!settings?.logo,
  },
  {
    key: 'photo', need: 'settings', label: 'Add a parish photo',
    note: 'The big picture on the website home page: the church front or a parish gathering.',
    to: '/admin/settings', done: ({ settings }) => !!settings?.hero_image,
  },
  {
    key: 'gkks', need: 'settings', label: 'Add the GKKs',
    note: 'Households and members are grouped by GKK.',
    to: '/admin/settings?tab=gkk', done: ({ counts }) => counts?.gkks > 0,
  },
  {
    key: 'contact', need: 'editWebsite', label: 'Enter the office address, phone and email',
    note: 'On the website\'s contact page and printed sheets.',
    to: '/admin/website?tab=office',
    done: ({ settings: s }) => !!(s?.address && (s.mobile || s.contact) && s.email),
  },
  {
    key: 'hours', need: 'editWebsite', label: 'Set the office hours',
    note: 'The website says whether the office is open now.',
    to: '/admin/website?tab=office', done: ({ settings }) => Array.isArray(settings?.office_hours),
  },
  {
    key: 'map', need: 'editWebsite', label: 'Pin the church on the map',
    note: 'The map and directions on the website\'s contact page.',
    to: '/admin/website?tab=office',
    done: ({ settings: s }) => (s?.latitude != null && s?.longitude != null) || !!s?.map_url,
  },
  {
    key: 'messenger', need: 'editWebsite', label: 'Add your Messenger',
    note: 'Parishioners message the office from the website\'s chat button.',
    to: '/admin/website?tab=office', done: ({ settings }) => !!settings?.secretary_messenger,
  },
  {
    key: 'mass', need: 'editWebsite', label: 'Enter the Mass schedule',
    note: 'The Mass times on the website.',
    to: '/admin/website?tab=mass', done: ({ counts }) => counts?.mass > 0,
  },
  {
    key: 'sacraments', need: 'editWebsite', label: 'Write the sacrament guides',
    note: 'What families need for a baptism, wedding and the other sacraments.',
    to: '/admin/website?tab=sacraments', done: ({ counts }) => counts?.sacraments > 0,
  },
];

/**
 * The steps this account sees, each with `doneBy`: 'parish' when the setting
 * is there, 'you' when the person marked it done, '' when it's still to do.
 * `saved` is the account's checklist (setupSaved).
 */
export function setupSteps({ user, settings, counts, saved }) {
  const marked = new Set(saved?.done || []);
  return SETUP_STEPS.filter((s) => can(user, s.need)).map(({ done, need, ...s }) => {
    const auto = !!settings && done({ settings, counts });
    return { ...s, doneBy: auto ? 'parish' : marked.has(s.key) ? 'you' : '' };
  });
}

/** How many of `steps` are still to do. */
export const stepsLeft = (steps) => steps.filter((s) => !s.doneBy).length;

/** The account's saved checklist (user.setupChecklist, from its sign-in details): { done: [step keys], hide: bool }. */
export function setupSaved(s) {
  return { done: Array.isArray(s?.done) ? s.done.filter((k) => typeof k === 'string') : [], hide: !!s?.hide };
}

/** `saved` with step `key` marked done (or not). */
export function markStep(saved, key, done) {
  const rest = (saved?.done || []).filter((k) => k !== key);
  return { ...saved, done: done ? [...rest, key] : rest };
}

/** Today as YYYY-MM-DD on this device's clock. */
export function localDay(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Whether the pop-up opens: something is still to do, the person hasn't
 * chosen "Don't show again", and it hasn't opened yet today (`lastShown`).
 */
export function popupDue({ steps, saved, lastShown, today }) {
  return stepsLeft(steps) > 0 && !saved?.hide && lastShown !== today;
}
