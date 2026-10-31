// What each migration adds that a database can be checked for: its new
// tables, views, columns and functions. Used by `npm run release:db -- check`
// to tell whether a migration missing from a database's history was in fact
// run by hand (SQL Editor), before `-- mark` records it as applied.
//
// Only what a migration *adds* counts: a function an earlier file already
// created would be there either way, so it says nothing about this one.

// The version Supabase records: the file name up to the first underscore.
export const versionOf = (file) => file.split('_')[0];

// Comments and $$ … $$ bodies out, so a function's body isn't read as DDL.
function bare(sql) {
  return sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '')
    .replace(/--[^\n]*/g, '')
    .toLowerCase();
}

const inPublic = (schema) => !schema || schema === 'public';

function found(sql) {
  const s = bare(sql);
  const out = [];
  for (const m of s.matchAll(/create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/g)) {
    if (inPublic(m[1])) out.push({ kind: 'table', name: m[2] });
  }
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/g)) {
    if (inPublic(m[1])) out.push({ kind: 'view', name: m[2] });
  }
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(/g)) {
    if (inPublic(m[1])) out.push({ kind: 'function', name: m[2] });
  }
  for (const statement of s.split(';')) {
    const head = /^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/.exec(statement);
    if (!head || !inPublic(head[1])) continue;
    for (const m of statement.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/g)) {
      out.push({ kind: 'column', table: head[2], name: m[1] });
    }
  }
  return out;
}

// What a migration takes away, as marker keys: a later file dropping what an
// earlier one added means its absence says nothing about the earlier one.
function dropped(sql) {
  const s = bare(sql);
  const out = [];
  for (const m of s.matchAll(/drop\s+(table|(?:materialized\s+)?view|function)\s+(?:if\s+exists\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/g)) {
    if (inPublic(m[2])) out.push(`${m[1].replace(/^materialized\s+/, '')} ${m[3]}`);
  }
  for (const statement of s.split(';')) {
    const head = /^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/.exec(statement);
    if (!head || !inPublic(head[1])) continue;
    for (const m of statement.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/g)) out.push(`column ${head[2]}.${m[1]}`);
    for (const m of statement.matchAll(/rename\s+column\s+"?(\w+)"?\s+to/g)) out.push(`column ${head[2]}.${m[1]}`);
  }
  return out;
}

const keyOf = (m) => (m.kind === 'column' ? `column ${m.table}.${m.name}` : `${m.kind} ${m.name}`);

/**
 * [{ file, version, markers }] for `files` ([{ file, sql }], every migration
 * in order). A marker is { kind, name, table? } and only appears in the
 * first migration that adds it, and not at all once a later one drops it.
 */
export function migrationMarkers(files) {
  const owner = new Map();
  const entries = files.map(({ file }) => ({ file, version: versionOf(file), markers: [] }));
  files.forEach(({ sql }, i) => {
    // Drops first: a file that drops and re-creates something owns it again.
    for (const key of dropped(sql)) {
      const was = owner.get(key);
      if (!was) continue;
      was.markers = was.markers.filter((m) => keyOf(m) !== key);
      owner.delete(key);
    }
    for (const m of found(sql)) {
      const key = keyOf(m);
      if (owner.has(key)) continue;
      owner.set(key, entries[i]);
      entries[i].markers.push(m);
    }
  });
  return entries;
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

function presentSql(m) {
  if (m.kind === 'table' || m.kind === 'view') return `to_regclass(${lit(`public.${m.name}`)}) is not null`;
  if (m.kind === 'column') {
    return `exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = ${lit(m.table)} and column_name = ${lit(m.name)})`;
  }
  return `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${lit(m.name)})`;
}

/** One read-only query: a row { version, marker, present } per marker of `entries`. */
export function checkSql(entries) {
  const rows = entries.flatMap((e) => e.markers.map((m) => `select ${lit(e.version)} as version, ${lit(keyOf(m))} as marker, ${presentSql(m)} as present`));
  return rows.length ? `${rows.join('\nunion all\n')};` : "select null::text as version, null::text as marker, null::boolean as present where false;";
}

/**
 * Each entry's verdict from the query's rows: 'done' (everything it adds is
 * there), 'not run' (none of it), 'partly', or 'unknown' (it only changes
 * what earlier ones added). `missing` lists what isn't there.
 */
export function verdicts(entries, rows) {
  return entries.map((e) => {
    const mine = rows.filter((r) => r.version === e.version);
    const missing = mine.filter((r) => !r.present).map((r) => r.marker);
    let verdict = 'unknown';
    if (mine.length) verdict = missing.length === 0 ? 'done' : missing.length === mine.length ? 'not run' : 'partly';
    return { ...e, verdict, missing };
  });
}

/**
 * The last migration that can be marked applied: the run of 'done' ones from
 * the start (with 'unknown' ones between them, which ran in order with them),
 * up to the first that isn't there. null when the first checkable one isn't.
 */
export function lastDone(checked) {
  let last = null;
  for (const c of checked) {
    if (c.verdict === 'not run' || c.verdict === 'partly') break;
    if (c.verdict === 'done') last = c.version;
  }
  return last;
}
