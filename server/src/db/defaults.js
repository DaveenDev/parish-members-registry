import bcrypt from 'bcryptjs';

/**
 * Reference data every install needs: the pick-lists the registration wizard
 * and admin filters read from, plus a first staff account to sign in with.
 * Shared by `db:setup` and `db:reset --all` so the two cannot drift apart.
 */

export const DEFAULT_GKKS = ['GKK San Lorenzo Ruiz', 'GKK San Pedro Calungsod', 'GKK San Isidro', 'GKK Sto. Niño'];
export const DEFAULT_MINISTRIES = ['Choir', 'Lector & Commentator', 'Catechist', 'Altar Servers', 'Ushers & Collectors', 'Sacristan / Money Counters', 'Kaabag'];
export const DEFAULT_ORGS = ['Youth Ministry', 'Knights of Columbus', "Catholic Women's League", 'Legion of Mary', 'Parish Pastoral Council', 'Couples for Christ (CFC)'];

/** Parish profile and the GKK/ministry/organization pick-lists. Idempotent. */
export async function seedReferenceData(db) {
  await db.query(
    `INSERT INTO parish_settings (id, name, address, contact, email)
     VALUES (1, 'Our Lady of Guadalupe', 'Purok 3, Mua-an, Kidapawan City, North Cotabato', '', '')
     ON CONFLICT (id) DO NOTHING`
  );

  await db.query('INSERT INTO email_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');

  for (const name of DEFAULT_GKKS) {
    await db.query('INSERT INTO gkks (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  for (const name of DEFAULT_MINISTRIES) {
    await db.query('INSERT INTO ministries (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  for (const name of DEFAULT_ORGS) {
    await db.query('INSERT INTO organizations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
}

/**
 * Create the initial staff account. Returns what was used so the caller can
 * print it. Existing accounts are left alone — this never resets a password.
 */
export async function seedAdminUser(db) {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@parishregistry.org';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ParishAdmin123!';

  // The stock credentials are published in this repo's README. Seeding them
  // into a live register would hand the parish's data to anyone who looked.
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set explicitly when seeding a production database — ' +
        'the default password is public.'
    );
  }

  const hash = await bcrypt.hash(password, 10);

  const result = await db.query(
    `INSERT INTO admin_users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, hash, 'Ma. Assumpta R.', 'Parish Secretary']
  );

  return { email, password, created: result.rowCount > 0 };
}
