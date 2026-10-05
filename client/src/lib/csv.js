// Port of server/src/lib/util.js's toCsv() — CSV export now happens entirely
// in the browser since there's no backend left to stream a
// Content-Disposition response from.

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(row) : row[c.value])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename, rows, columns) {
  const csv = toCsv(rows, columns);
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

/**
 * Parse CSV text into rows of strings (quoted fields, "" escapes, commas
 * and newlines inside quotes, CRLF or LF). Blank lines stay (as rows of
 * empty strings) so row numbers match the file, except a final newline. A
 * leading byte-order mark (Excel's "CSV UTF-8") is ignored.
 */
export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
