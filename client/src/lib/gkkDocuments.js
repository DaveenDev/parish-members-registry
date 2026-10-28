// A GKK's important documents (0044 migration): land titles, deeds, tax
// declarations… kept as files in the private "gkk-documents" bucket of
// Supabase Storage, under "<gkk id>/<uuid>.<ext>". Only full-access staff and
// the GKK's own leader can reach them.

// Keep in sync with the gkk_documents.kind check in 0044.
export const GKK_DOCUMENT_KINDS = ['Land title', 'Deed of donation', 'Deed of sale', 'Tax declaration', 'Survey plan', 'Other'];

export const GKK_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

// Keep in sync with the bucket's allowed_mime_types in 0044.
const TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const BY_EXTENSION = { jpeg: 'image/jpeg', ...Object.fromEntries(Object.entries(TYPES).map(([type, ext]) => [ext, type])) };

/** For the file picker. */
export const GKK_DOCUMENT_ACCEPT = Object.values(TYPES).map((ext) => `.${ext}`).concat('.jpeg').join(',');

/**
 * The content type to store `file` ({ name, type, size }) under, or throws
 * with a message for the person uploading. Phones sometimes leave the type
 * blank, so the file name's extension decides then.
 */
export function gkkDocumentType(file) {
  const ext = String(file?.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  const type = TYPES[file?.type] ? file.type : BY_EXTENSION[ext];
  if (!type) throw new Error(`${file?.name || 'That file'} isn't a PDF, photo or Word file`);
  if (!file.size) throw new Error(`${file.name} looks empty`);
  if (file.size > GKK_DOCUMENT_MAX_BYTES) throw new Error(`${file.name} is over 20 MB`);
  return type;
}

/** Where the file goes in the bucket: "<gkk id>/<uuid>.<ext>". */
export function gkkDocumentPath(gkkId, contentType, uuid) {
  return `${gkkId}/${uuid}.${TYPES[contentType] || 'bin'}`;
}

/** A starting title from the file name: "TCT-1234 scan.pdf" → "TCT-1234 scan". */
export function titleFromFileName(name) {
  return String(name || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** 1536 → "1.5 KB", 2_500_000 → "2.4 MB". */
export function fmtFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
