// The website's Downloads page (0096 migration): song lyrics (the songs
// table) and forms the parish office shares (download_files, with the files
// in the public "downloads" bucket of Supabase Storage, as "<uuid>.<ext>").

/** Suggested song categories, in the order the website lists them; staff can add others. */
export const SONG_CATEGORIES = ['Kasaulogan sa GKK', 'Bible Service', 'Kasagarang Kanta'];

/** Suggested file categories, in the order the website lists them; staff can add others. */
export const FILE_CATEGORIES = ['GKK Forms', 'Manual Census Forms', 'Other Forms'];

export const DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;

// Keep in sync with the bucket's allowed_mime_types in 0096.
const TYPES = {
  'application/pdf': { ext: 'pdf', label: 'PDF' },
  'application/msword': { ext: 'doc', label: 'Word' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', label: 'Word' },
  'application/vnd.ms-excel': { ext: 'xls', label: 'Excel' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', label: 'Excel' },
  'image/jpeg': { ext: 'jpg', label: 'Photo' },
  'image/png': { ext: 'png', label: 'Photo' },
};
const BY_EXTENSION = { jpeg: 'image/jpeg', ...Object.fromEntries(Object.entries(TYPES).map(([type, t]) => [t.ext, type])) };

/** For the file picker. */
export const DOWNLOAD_ACCEPT = Object.values(TYPES).map((t) => `.${t.ext}`).concat('.jpeg').join(',');

/**
 * The content type to store `file` ({ name, type, size }) under, or throws
 * with a message for the person uploading. Phones sometimes leave the type
 * blank, so the file name's extension decides then.
 */
export function downloadFileType(file) {
  const ext = String(file?.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  const type = TYPES[file?.type] ? file.type : BY_EXTENSION[ext];
  if (!type) throw new Error(`${file?.name || 'That file'} isn't a PDF, Word, Excel or photo file`);
  if (!file.size) throw new Error(`${file.name} looks empty`);
  if (file.size > DOWNLOAD_MAX_BYTES) throw new Error(`${file.name} is over 20 MB`);
  return type;
}

/** Where the file goes in the bucket: "<uuid>.<ext>". */
export function downloadFilePath(contentType, uuid) {
  return `${uuid}.${TYPES[contentType]?.ext || 'bin'}`;
}

/** "PDF", "Word", "Excel" or "Photo" for a file's badge; the extension for anything else. */
export function fileKindLabel(contentType, fileName = '') {
  return TYPES[contentType]?.label || (String(fileName).match(/\.([a-z0-9]+)$/i)?.[1] || 'File').toUpperCase();
}

/** Whether a browser shows the file itself (so the website offers "Ablihi" as well as download). */
export const opensInBrowser = (contentType) => contentType === 'application/pdf' || /^image\//.test(contentType || '');

/**
 * Lyrics as typed or pasted, tidied for saving: no spaces at line ends,
 * Windows line breaks made plain, at most one blank line between stanzas,
 * none at the start or end.
 */
export function cleanLyrics(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n').map((l) => l.replace(/[ \t\u00a0]+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The stanzas of a song's lyrics, split at blank lines. */
export const stanzas = (lyrics) => cleanLyrics(lyrics).split(/\n\s*\n/).filter(Boolean);

/** A song's first line, for the list (its title is often the same, so the list shows both). */
export const firstLine = (lyrics) => cleanLyrics(lyrics).split('\n')[0] || '';

/** Lower case with accents taken off, so "Ginoo" finds "ginóo" and "Santo Niño" finds "santo nino". */
export const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Whether `song` matches every word of the search `q`, in its title, composer, language, note or lyrics. */
export function songMatches(song, q) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${song.title} ${song.composer || ''} ${song.language || ''} ${song.note || ''} ${song.lyrics}`).replace(/\s+/g, ' ');
  return words.every((w) => hay.includes(w));
}

/** Suggested song languages (0097); staff can type another. */
export const SONG_LANGUAGES = ['Bisaya', 'English', 'Tagalog', 'Latin'];
const LANGUAGE_CODES = { bisaya: 'ceb', cebuano: 'ceb', binisaya: 'ceb', english: 'en', tagalog: 'tl', filipino: 'fil', latin: 'la', hiligaynon: 'hil', ilonggo: 'hil', spanish: 'es' };

/** The language's code for search engines ("Bisaya" → "ceb"), or undefined for one not known. */
export const languageCode = (name) => LANGUAGE_CODES[fold(name).trim()];

/** A title as it reads in a web address: "Ginoo, Kaloy-i Kami!" → "ginoo-kaloy-i-kami". */
export function slugify(title) {
  return fold(title).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

/**
 * A song's page: "/downloads/kanta/12-ginoo-kaloy-i-kami". The number finds
 * the song; the title in the address tells people and search engines what
 * it is. Old or shortened addresses ("/downloads/kanta/12") still work.
 */
export function songPath(song) {
  const slug = slugify(song.title);
  return `/downloads/kanta/${song.id}${slug ? `-${slug}` : ''}`;
}

/** The song's id from the page address's last part ("12-ginoo-kaloy-i-kami" → 12), or null. */
export function songIdFromParam(param) {
  const m = String(param || '').match(/^(\d{1,9})(?:-|$)/);
  return m ? Number(m[1]) : null;
}

/** "Composer · Language" under a song's title; the language only when it isn't Bisaya. */
export function songByline(song) {
  const lang = song.language && fold(song.language) !== 'bisaya' ? song.language : '';
  return [song.composer, lang].filter(Boolean).join(' · ');
}

/** The song as plain text, for the download: title, composer, lyrics, and where it came from. */
export function songText(song, url) {
  const head = [song.title, song.composer ? `Composer: ${song.composer}` : ''].filter(Boolean).join('\n');
  return `${head}\n\n${stanzas(song.lyrics).join('\n\n')}\n${url ? `\nFrom ${url}\n` : ''}`;
}

/** A file name for the downloaded lyrics: "Ginoo Kaloy-i Kami.txt". */
export const songFileName = (song) => `${String(song.title).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Kanta'}.txt`;

/**
 * The song as structured data (schema.org MusicComposition with its lyrics),
 * so search engines know the page is a song's lyrics, by whom and in what
 * language.
 */
export function songJsonLd({ song, url, parishName }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'MusicComposition',
    name: song.title,
    url,
    composer: song.composer ? { '@type': 'Person', name: song.composer } : undefined,
    inLanguage: languageCode(song.language) || undefined,
    genre: 'Catholic hymn',
    keywords: (song.categories || []).join(', ') || undefined,
    lyrics: { '@type': 'CreativeWork', text: stanzas(song.lyrics).join('\n\n'), inLanguage: languageCode(song.language) || undefined },
    publisher: parishName ? { '@type': 'Organization', name: parishName } : undefined,
  };
  return JSON.parse(JSON.stringify(data)); // drops the undefined ones
}

/** As songMatches, for a file: its title, category, description and file name. */
export function fileMatches(file, q) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${file.title} ${file.category} ${file.description || ''} ${file.file_name}`);
  return words.every((w) => hay.includes(w));
}

/**
 * Categories in the order to show them: the suggested ones first (in their
 * order), then any others staff typed, A–Z. Repeats and blanks are dropped.
 */
export function orderCategories(names, suggested) {
  const seen = new Map();
  for (const n of names) {
    const name = String(n || '').trim();
    if (name && !seen.has(fold(name))) seen.set(fold(name), name);
  }
  const rank = (name) => {
    const i = suggested.findIndex((s) => fold(s) === fold(name));
    return i < 0 ? suggested.length : i;
  };
  return [...seen.values()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });

/** Songs A–Z by title. */
export const sortSongs = (songs) => [...songs].sort(byTitle);

/**
 * Files grouped by category for the website: [{ category, files }], the
 * categories ordered by orderCategories, each one's files A–Z.
 */
export function groupFiles(files) {
  const cats = orderCategories(files.map((f) => f.category), FILE_CATEGORIES);
  return cats
    .map((category) => ({ category, files: files.filter((f) => fold(f.category.trim()) === fold(category)).sort(byTitle) }))
    .filter((g) => g.files.length);
}
