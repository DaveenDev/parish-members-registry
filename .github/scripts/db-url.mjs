// Tidies the SUPABASE_DB_URL secret for the backup workflow (backup.yml)
// and says what was wrong, without ever printing the secret.
//
// The Supabase CLI refuses a connection string it can't parse, and the usual
// reasons are copy-paste ones: spaces or a line break around it, quotes, the
// whole `psql "…"` command, a `DATABASE_URL=` in front, the [YOUR-PASSWORD]
// placeholder or its brackets left in, or a password with characters such as
// @ # / ? that must be URL-encoded in a connection string. Supabase → Connect
// also offers the same connection in other forms (JDBC, SQLAlchemy, .NET,
// Python/Go "user=… password=…", a Prisma .env block); those are turned into
// the plain postgresql:// form. This fixes what it safely can.
//
// The messages describe the expected form in words: GitHub hides anything
// shaped like scheme://user:password@ in the log, examples included.
//
// In the workflow: node .github/scripts/db-url.mjs
//   reads SUPABASE_DB_URL, masks the tidied string in the log and hands it to
//   later steps as DB_URL (via GITHUB_ENV); exits 1 with a message if it can't.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const EXPECTED = 'Use the Session pooler connection string from Supabase → Connect (type URI): it starts with postgresql:// and has the user, the database password, the host and port 5432 in it.';

/** { url, notes } with the tidied connection string, or { error }. */
export function normalizeDbUrl(raw) {
  const notes = [];
  let s = String(raw ?? '');
  if (s.trim() !== s) notes.push('removed spaces or line breaks around it');
  s = s.trim();
  if (!s) return { error: 'SUPABASE_DB_URL is empty.' };

  // Several lines: a .env block (Prisma's DATABASE_URL and DIRECT_URL, maybe
  // with # comments) or Python's one setting per line.
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length > 1) {
    const uris = lines.filter((l) => /postgres(?:ql)?(?:\+\w+)?:\/\//i.test(l));
    if (uris.length) {
      s = uris.find((l) => /:5432(?:[/?"']|$)/.test(l)) ?? uris[0];
      notes.push(`kept the one connection string out of the ${lines.length} lines in it`);
    } else {
      s = lines.join(' ');
    }
  } else if (lines.length === 1) {
    s = lines[0];
  }

  const psql = /^psql\s+(.+)$/is.exec(s);
  if (psql) { s = psql[1].trim(); notes.push('took the connection string out of the psql command'); }
  if (/^-(?:[hUpd]|-host|-username|-port|-dbname)\b/.test(s)) {
    return { error: `That's the psql command with -h/-U options, which leaves the password out. ${EXPECTED}` };
  }

  // DATABASE_URL=… / export SUPABASE_DB_URL="…" / url: …
  const assigned = /^(?:export\s+)?[A-Za-z_][\w.]*\s*(?:=|:\s)\s*(["']?(?:jdbc:)?postgres(?:ql)?(?:\+\w+)?:\/\/.*)$/is.exec(s);
  if (assigned) { s = assigned[1].trim(); notes.push('removed the name= in front of it'); }
  const quoted = /^(['"])(.*)\1;?$/s.exec(s);
  if (quoted) { s = quoted[2].trim(); notes.push('removed the quotes around it'); }

  if (/\[?YOUR[-_ ]PASSWORD\]?/i.test(s)) {
    return { error: 'It still has the [YOUR-PASSWORD] placeholder. Put the database password in its place (without the [ ]).' };
  }
  if (/^https?:\/\//i.test(s)) {
    return { error: `That's a web address (such as the Project URL), not the database connection string. ${EXPECTED}` };
  }

  let parts;
  const jdbc = /^jdbc:(postgres(?:ql)?:\/\/.*)$/is.exec(s);
  if (jdbc) {
    parts = fromJdbc(jdbc[1]);
    if (parts.error) return parts;
    notes.push('turned the JDBC form into a postgresql:// connection string');
  } else if (/^postgres(?:ql)?\+\w+:\/\//i.test(s)) {
    s = s.replace(/^(postgres(?:ql)?)\+\w+:/i, '$1:');
    notes.push('removed the SQLAlchemy driver name (+psycopg2) from the start');
  } else if (!/^\w[\w+.-]*:\/\//.test(s) && /\b(?:user(?:\s*id|name)?|uid)\s*=/i.test(s) && /\b(?:password|pwd)\s*=/i.test(s)) {
    parts = fromKeyValues(s);
    if (parts.error) return parts;
    notes.push('turned the "user=… password=… host=…" form into a postgresql:// connection string');
  }

  if (!parts) {
    // scheme://user:password@host[:port][/db][?query]; the password runs to
    // the last @, so an unencoded @ inside it is still found.
    const m = /^(postgres(?:ql)?):\/\/([^:@/]+):(.*)@([^@/?#]+)(\/[^?#]*)?(\?[^#]*)?$/is.exec(s);
    if (!m) return { error: shapeError(s) };
    const [, scheme, user, pass, host, path = '/postgres', query = ''] = m;
    parts = { scheme: scheme.toLowerCase(), user, pass, host, path, query };
  }
  let { scheme, user, pass, host, path, query } = parts;
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

  // Prisma's settings mean nothing to Postgres, which refuses unknown ones.
  if (query) {
    const kept = query.slice(1).split('&').filter((p) => p && !/^(?:pgbouncer|connection_limit|pool_timeout|schema)=/i.test(p));
    const tidied = kept.length ? `?${kept.join('&')}` : '';
    if (tidied !== query) { query = tidied; notes.push('removed Prisma-only settings (pgbouncer=…) from the end'); }
  }

  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  if (hostname.endsWith('.pooler.supabase.com') && !user.includes('.')) {
    return { error: 'With the Session pooler the user name is postgres. followed by the project reference (as in the string Supabase shows), not just postgres.' };
  }
  if (/^db\.[a-z0-9]+\.supabase\.co$/.test(hostname)) {
    notes.push('note: this is the Direct connection, which GitHub can\'t usually reach; use the Session pooler string if the dump fails');
  }
  if (/:6543$/.test(host)) {
    notes.push('note: port 6543 is the Transaction pooler; backups need the Session pooler (port 5432) if the dump fails');
  }
  return { url: `${scheme}://${user}:${encoded}@${host}${path}${query}`, notes };
}

// jdbc:postgresql://host:port/db?user=…&password=…
function fromJdbc(rest) {
  const m = /^(postgres(?:ql)?):\/\/([^/?#]+)(\/[^?#]*)?(?:\?(.*))?$/is.exec(rest);
  if (!m) return { error: `The JDBC form couldn't be read. ${EXPECTED}` };
  const [, scheme, host, path = '/postgres', query = ''] = m;
  const params = [];
  let user = '';
  let pass = '';
  // The password runs to the next &user= or the end, so an unencoded & in it
  // is kept when it comes last, as Supabase writes it.
  const pw = /(?:^|&)password=(.*?)(?=&user=|$)/is.exec(query);
  if (pw) pass = pw[1];
  for (const p of query.replace(pw?.[0] ?? '\0', '').split('&')) {
    const [k, ...v] = p.split('=');
    if (!k) continue;
    if (k.toLowerCase() === 'user') user = v.join('=');
    else params.push(p);
  }
  if (!user) return { error: `The JDBC form has no user=. ${EXPECTED}` };
  return { scheme: scheme.toLowerCase(), user: encodeUser(user), pass, host, path, query: params.length ? `?${params.join('&')}` : '' };
}

// libpq / Go / Python: user=… password=… host=… port=… dbname=…
// .NET: User Id=…;Password=…;Server=…;Port=…;Database=…
function fromKeyValues(s) {
  const values = {};
  if (/;\s*(?:password|pwd|server|host|port|database)\s*=/i.test(s)) {
    for (const p of s.split(';')) {
      const i = p.indexOf('=');
      if (i > 0) values[p.slice(0, i).trim().toLowerCase().replace(/\s+/g, '')] = p.slice(i + 1).trim();
    }
  } else {
    const re = /([A-Za-z_]+)\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\S*)/g;
    for (const [, k, v] of s.matchAll(re)) {
      values[k.toLowerCase()] = /^(['"]).*\1$/s.test(v) ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v;
    }
  }
  const pick = (...keys) => keys.map((k) => values[k]).find((v) => v);
  const user = pick('user', 'userid', 'username', 'uid');
  const pass = pick('password', 'pwd') ?? '';
  const host = pick('host', 'server', 'hostname');
  const port = pick('port') ?? '5432';
  const db = pick('dbname', 'database') ?? 'postgres';
  if (!user || !host) return { error: `It has user= and password= but no ${user ? 'host' : 'user'}. ${EXPECTED}` };
  return { scheme: 'postgresql', user: encodeUser(user), pass, host: `${host}:${port}`, path: `/${db}`, query: '' };
}

const encodeUser = (u) => encodeURIComponent(safeDecode(u));
function safeDecode(v) { try { return decodeURIComponent(v); } catch { return v; } }

// What's wrong with a string that isn't scheme://user:password@host…, said
// without repeating any of it (it may be only the password).
function shapeError(s) {
  const scheme = /^([a-z][a-z0-9+.-]{0,20}):\/\//i.exec(s)?.[1];
  if (scheme && !/^postgres(?:ql)?$/i.test(scheme)) {
    return `It starts with ${scheme}://, not postgresql://. ${EXPECTED}`;
  }
  if (scheme) {
    if (!s.includes('@')) return `There's no @ in it, so the user, password and host can't be told apart. ${EXPECTED}`;
    if (/^postgres(?:ql)?:\/\/[^:@/]*@/i.test(s)) {
      return 'The password is missing: it goes between the : after the user name and the @.';
    }
    return `It couldn't be read as user, password, host and port. ${EXPECTED}`;
  }
  return `It isn't a connection string (it doesn't start with postgresql://); the secret needs the whole string, not only the password or the host. ${EXPECTED}`;
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
