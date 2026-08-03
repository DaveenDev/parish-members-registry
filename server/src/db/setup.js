/**
 * `npm run db:setup` — create the schema and seed the reference data plus a
 * first staff account. Safe to re-run: it never touches parishioner records.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';
import { seedReferenceData, seedAdminUser } from './defaults.js';
import { describeTarget, countParishData, runScript } from './cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema ready.');

  await seedReferenceData(pool);

  const admin = await seedAdminUser(pool);
  console.log(
    admin.created
      ? `Seeded admin user: ${admin.email} / ${admin.password}`
      : `Admin user ${admin.email} already exists — password left unchanged.`
  );

  const counts = await countParishData(pool);
  console.log(`\nDatabase ready at ${describeTarget()}.`);

  if (counts.households === 0) {
    console.log('The register is empty. Load sample records with: npm run db:demo');
  } else {
    console.log(`Existing records kept: ${counts.households} household(s), ${counts.members} member(s).`);
  }
}

runScript(pool, main);
