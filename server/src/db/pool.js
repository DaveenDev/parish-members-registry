import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.PGHOST || 'localhost',
  port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT) || 5432,
  user: process.env.DATABASE_URL ? undefined : process.env.PGUSER || 'postgres',
  password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD || 'postgres',
  database: process.env.DATABASE_URL ? undefined : process.env.PGDATABASE || 'parish_registry',
});

export const query = (text, params) => pool.query(text, params);
