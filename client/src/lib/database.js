// Which Supabase project this build of the site talks to.
//
// The live registry is one project; the training site (olgqp-training) and
// local dev point at a test project instead, through VITE_SUPABASE_URL. Any
// project other than the live one gets the "Training site" banner, so nobody
// mistakes practice data for the real registry. If the registry ever moves
// to a new Supabase project, change LIVE_PROJECT_ID here too.

export const LIVE_PROJECT_ID = 'rmlkowkbonbrtaqocsvo';

/** The project ID in https://<project id>.supabase.co, or '' for anything else. */
export function projectIdFromUrl(url) {
  try {
    return /^([a-z0-9]+)\.supabase\.co$/i.exec(new URL(url).hostname)?.[1] || '';
  } catch {
    return '';
  }
}

/** True when the site is connected to a database other than the live registry. */
export function isTrainingDatabase(url) {
  if (!url) return false;
  return projectIdFromUrl(url).toLowerCase() !== LIVE_PROJECT_ID;
}
