import pg from 'pg';
import '../env.js';

const { Pool, types } = pg;

// DATE columns (oid 1082) default to JS Date objects parsed in local time, then
// serialize to UTC ISO strings — shifting the date by a day in timezones ahead
// of UTC. Keep them as plain "YYYY-MM-DD" strings instead.
types.setTypeParser(1082, (val) => val);

/**
 * Managed Postgres (Supabase, Neon, Render) terminates TLS with a certificate
 * this process has no root for, so verification has to be off unless a CA is
 * supplied. Local Postgres has no TLS at all. Default: on for remote hosts,
 * off for localhost — override with PGSSLMODE=require / disable.
 */
function sslConfig() {
  const mode = (process.env.PGSSLMODE || '').toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'no-verify' || mode === 'require' || mode === 'prefer') {
    return { rejectUnauthorized: false };
  }

  const host = process.env.DATABASE_URL
    ? (() => {
        try {
          return new URL(process.env.DATABASE_URL).hostname;
        } catch {
          return '';
        }
      })()
    : process.env.PGHOST || 'localhost';

  const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  return isLocal ? false : { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.PGHOST || 'localhost',
  port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT) || 5432,
  user: process.env.DATABASE_URL ? undefined : process.env.PGUSER || 'postgres',
  password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD || 'postgres',
  database: process.env.DATABASE_URL ? undefined : process.env.PGDATABASE || 'parish_registry',
  ssl: sslConfig(),
  // Supabase's free pooler allows few connections and a sleeping free web
  // service should not hold them open.
  max: Number(process.env.PGPOOL_MAX) || 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

// A dropped backend (Supabase pausing, a pooler restart) emits 'error' on an
// idle client. Unhandled, that takes the whole process down.
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

export const query = (text, params) => pool.query(text, params);
