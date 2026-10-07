// Tidies the SUPABASE_DB_URL secret for the backup workflow (backup.yml)
// and says what was wrong, without ever printing the secret.
//
// The Supabase CLI refuses a connection string it can't parse, and the usual
// reasons are copy-paste ones: spaces or a line break around it, quotes, the
// whole `psql "…"` command, the [YOUR-PASSWORD] placeholder or its brackets
// left in, or a password with characters such as @ # / ? that must be
// URL-encoded in a connection string. This fixes what it safely can.
//
// In the workflow: node .github/scripts/db-url.mjs
//   reads SUPABASE_DB_URL, masks the tidied string in the log and hands it to
//   later steps as DB_URL (via GITHUB_ENV); exits 1 with a message if it can't.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** { url, notes } with the tidied connection string, or { error }. */
export function normalizeDbUrl(raw) {
  const notes = [];
  let s = String(raw ?? '');
  if (s.trim() !== s) notes.push('removed spaces or line breaks around it');
  s = s.trim();
  if (!s) return { error: 'SUPABASE_DB_URL is empty.' };

  const psql = /^psql\s+(.+)$/is.exec(s);
  if (psql) { s = psql[1].trim(); notes.push('took the connection string out of the psql command'); }
  const quoted = /^(['"])(.*)\1$/s.exec(s);
  if (quoted) { s = quoted[2].trim(); notes.push('removed the quotes around it'); }

  if (/\[?YOUR-PASSWORD\]?/i.test(s)) {
    return { error: 'It still has the [YOUR-PASSWORD] placeholder. Put the database password in its place (without the [ ]).' };
  }

  // scheme://user:password@host[:port][/db][?query]; the password runs to the
  // last @, so an unencoded @ inside it is still found.
  const m = /^(postgres(?:ql)?):\/\/([^:@/]+):(.*)@([^@/?#]+)(\/[^?#]*)?(\?[^#]*)?$/s.exec(s);
  if (!m) {
    return { error: 'It doesn\'t look like postgresql://USER:PASSWORD@HOST:PORT/postgres. Copy the Session pooler string again from Supabase → Connect.' };
  }
  const [, scheme, user, rawPass, host, path = '/postgres', query = ''] = m;
  let pass = rawPass;
  if (!pass) return { error: 'The password is missing: it goes between the : after the user name and the @.' };

  const bracketed = /^\[(.+)\]$/s.exec(pass);
  if (bracketed) { pass = bracketed[1]; notes.push('removed the [ ] around the password'); }

  // Already URL-encoded (or nothing to encode)? Keep it; otherwise encode it.
  let encoded = pass;
  let alreadyEncoded = false;
  try { alreadyEncoded = encodeURIComponent(decodeURIComponent(pass)) === pass; } catch { /* a bare % */ }
  if (!alreadyEncoded) {
    encoded = encodeURIComponent(pass);
    notes.push('URL-encoded special characters in the password');
  }

  if (/:6543$/.test(host)) {
    notes.push('note: port 6543 is the Transaction pooler; backups need the Session pooler (port 5432) if the dump fails');
  }
  return { url: `${scheme}://${user}:${encoded}@${host}${path}${query}`, notes };
}

// Run as a script (the workflow), not when imported (the tests).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { url, notes, error } = normalizeDbUrl(process.env.SUPABASE_DB_URL);
  if (error) {
    console.log(`::error::SUPABASE_DB_URL: ${error} No backup was made (see docs/backups.md).`);
    process.exit(1);
  }
  console.log(`::add-mask::${url}`);
  for (const n of notes) console.log(`::notice::SUPABASE_DB_URL: ${n}.`);
  if (!notes.length) console.log('SUPABASE_DB_URL looks right.');
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `DB_URL=${url}\n`);
}
