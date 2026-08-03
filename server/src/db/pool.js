import pg from 'pg';
import '../env.js';

const { Pool, types } = pg;

// DATE columns (oid 1082) default to JS Date objects parsed in local time, then
// serialize to UTC ISO strings — shifting the date by a day in timezones ahead
// of UTC. Keep them as plain "YYYY-MM-DD" strings instead.
types.setTypeParser(1082, (val) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.PGHOST || 'localhost',
  port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT) || 5432,
  user: process.env.DATABASE_URL ? undefined : process.env.PGUSER || 'postgres',
  password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD || 'postgres',
  database: process.env.DATABASE_URL ? undefined : process.env.PGDATABASE || 'parish_registry',
});

export const query = (text, params) => pool.query(text, params);
