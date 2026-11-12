// Which PRO modules this copy of the app has: the module folders present in
// client/src/pro (the PRO foundation's registry). A free parish has no such
// folder, so the glob is empty and it sees every note; a PRO parish sees only
// what it is missing. Nothing is read from the database for this.
const files = Object.keys(import.meta.glob('../pro/*/*.{js,jsx}'));

/** Module ids from `../pro/<id>/<file>` paths. */
export const ownedModules = [...new Set(files.map((f) => /^\.\.\/pro\/([^/]+)\//.exec(f)?.[1]).filter(Boolean))];

// A PRO build's version file may also say when its updates run out.
const versionFile = Object.values(import.meta.glob('../pro/version.js', { eager: true }))[0];
export const PRO_UPDATES_UNTIL = versionFile?.PRO_UPDATES_UNTIL || null;
