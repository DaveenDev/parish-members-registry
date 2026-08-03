import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_GKKS = ['GKK San Lorenzo Ruiz', 'GKK San Pedro Calungsod', 'GKK San Isidro', 'GKK Sto. Niño'];
const DEFAULT_MINISTRIES = ['Choir', 'Lector & Commentator', 'Catechist', 'Altar Servers', 'Ushers & Collectors', 'Sacristan / Money Counters', 'Kaabag'];
const DEFAULT_ORGS = ['Youth Ministry', 'Knights of Columbus', "Catholic Women's League", 'Legion of Mary', 'Parish Pastoral Council', 'Couples for Christ (CFC)'];

async function main() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema ready.');

  await pool.query(
    `INSERT INTO parish_settings (id, name, address, contact, email)
     VALUES (1, 'Our Lady of Guadalupe', 'Purok 3, Mua-an, Kidapawan City, North Cotabato', '', '')
     ON CONFLICT (id) DO NOTHING`
  );

  for (const name of DEFAULT_GKKS) {
    await pool.query('INSERT INTO gkks (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  for (const name of DEFAULT_MINISTRIES) {
    await pool.query('INSERT INTO ministries (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  for (const name of DEFAULT_ORGS) {
    await pool.query('INSERT INTO organizations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@parishregistry.org';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ParishAdmin123!';
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [email, hash, 'Ma. Assumpta R.', 'Parish Secretary']
  );
  console.log(`Seeded admin user: ${email} / ${password}`);

  console.log('Database setup complete.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
