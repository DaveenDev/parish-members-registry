// The version shown in the admin sidebar: the free release this build is
// (from releases/notes, see vite.config.js) and, in a PRO build, the PRO
// version. A PRO copy adds client/src/pro/version.js exporting PRO_VERSION;
// in the free app that file doesn't exist, so PRO_VERSION is null.
const proVersionFile = Object.values(import.meta.glob('../pro/version.js', { eager: true }))[0];

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '';
export const PRO_VERSION = proVersionFile?.PRO_VERSION || null;
