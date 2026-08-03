/**
 * Shared helpers for the database maintenance scripts.
 *
 * These scripts delete parishioner records, so the guards here are deliberate:
 * nothing destructive runs without an explicit --yes, and production needs a
 * second flag on top of that.
 */

/** Parse `--flag` style arguments into a set. */
export function parseFlags(argv = process.argv.slice(2)) {
  return new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.toLowerCase()));
}

/** Which database the pool is actually pointed at, for confirmation prompts. */
export function describeTarget() {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Never print the password component.
    try {
      const u = new URL(url);
      return `${u.hostname}:${u.port || 5432}/${u.pathname.replace(/^\//, '')}`;
    } catch {
      return 'the database in DATABASE_URL';
    }
  }
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || 5432;
  const name = process.env.PGDATABASE || 'parish_registry';
  return `${host}:${port}/${name}`;
}

/** How many parishioner records exist right now. */
export async function countParishData(db) {
  const { rows } = await db.query(
    `SELECT (SELECT count(*) FROM households) AS households,
            (SELECT count(*) FROM members)    AS members`
  );
  return { households: Number(rows[0].households), members: Number(rows[0].members) };
}

/**
 * Refuse to run a destructive command unless it was confirmed.
 * Prints what would happen and exits 1 when the guard is not satisfied.
 */
export function requireConfirmation(flags, { action, target, counts, command, extraFlags = '' }) {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !flags.has('--i-know-this-is-production')) {
    console.error(`Refusing to ${action} while NODE_ENV=production.`);
    console.error('If you are certain, re-run with --yes --i-know-this-is-production.');
    process.exit(1);
  }

  if (!flags.has('--yes')) {
    console.log(`This will ${action} on ${target}.`);
    console.log(`Currently stored: ${counts.households} household(s), ${counts.members} member(s).`);
    const script = command || process.env.npm_lifecycle_event || 'db:reset';
    console.log('\nNothing has been changed. Re-run with --yes to confirm:');
    console.log(`  npm run ${script} --${extraFlags ? ` ${extraFlags}` : ''} --yes`);
    process.exit(1);
  }
}

/** Run a script's main function with consistent error handling and pool cleanup. */
export function runScript(pool, main) {
  main()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err.message || err);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
