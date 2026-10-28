// Tidies the R2_ACCOUNT_ID and R2_BACKUP_BUCKET secrets for the backup
// workflow (backup.yml) and says what was wrong, without printing them.
//
// The R2 address is https://<account id>.r2.cloudflarestorage.com, and
// Cloudflare refuses the connection outright (an "SSL handshake failure")
// when the part before .r2.cloudflarestorage.com isn't a real account ID.
// The usual slips: the whole S3 API address or the dashboard address pasted
// in place of the ID, spaces or quotes, the Access Key ID in its place, or
// the S3 API address with the bucket on the end pasted as the bucket name.
// This fixes what it safely can. A bucket made in the EU jurisdiction lives
// at <account id>.eu.r2.cloudflarestorage.com; giving that address keeps it.
//
// In the workflow: node .github/scripts/r2-target.mjs
//   reads R2_ACCOUNT_ID, R2_BACKUP_BUCKET and AWS_ACCESS_KEY_ID, hands later
//   steps R2_ENDPOINT and R2_BUCKET (via GITHUB_ENV); exits 1 with a message
//   if it can't.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const WHERE_ID = 'Cloudflare → R2 Object Storage → Overview → Account ID (or Account Details → API → Account ID)';

/** { endpoint, account, bucket, notes } or { error }. */
export function normalizeR2({ accountId, bucket, accessKeyId } = {}) {
  const notes = [];

  let a = unquote(accountId);
  if (!a) return { error: 'R2_ACCOUNT_ID is empty.' };
  let jurisdiction = '';
  let bucketInAddress = '';
  const dash = /^(?:https?:\/\/)?dash\.cloudflare\.com\/([0-9a-f]{32})(?:[/?#]|$)/i.exec(a);
  if (dash) {
    a = dash[1];
    notes.push('R2_ACCOUNT_ID: took the Account ID out of the dashboard address');
  } else if (/[./:]/.test(a)) {
    const m = /^(?:https?:\/\/)?([^/?#]+)(?:\/([^/?#]*))?/i.exec(a);
    const host = m[1].toLowerCase();
    if (host.endsWith('.r2.dev')) {
      return { error: `R2_ACCOUNT_ID is a public r2.dev address. It needs the Account ID: ${WHERE_ID}. (The backup bucket should have no public address at all.)` };
    }
    const r2 = /^([0-9a-f]{32})(?:\.(eu|fedramp))?\.r2\.cloudflarestorage\.com$/.exec(host);
    if (!r2) {
      return { error: `R2_ACCOUNT_ID should be only the Account ID (32 digits and letters a–f), not an address: ${WHERE_ID}.` };
    }
    [, a, jurisdiction = ''] = r2;
    bucketInAddress = m[2] ?? '';
    notes.push('R2_ACCOUNT_ID: took the Account ID out of the S3 API address');
    if (jurisdiction) notes.push(`R2_ACCOUNT_ID: kept the ${jurisdiction.toUpperCase()} jurisdiction of the address`);
  }
  if (/^[0-9A-F]{32}$/i.test(a) && a !== a.toLowerCase()) a = a.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(a)) {
    const other = /[^0-9a-f]/i.test(a) ? ', and some of them aren\'t digits or the letters a–f' : '';
    return { error: `R2_ACCOUNT_ID should be the 32-character Account ID; this one has ${a.length} characters${other}. Copy it from ${WHERE_ID}.` };
  }
  if (a === unquote(accessKeyId).toLowerCase()) {
    return { error: `R2_ACCOUNT_ID is the same as R2_ACCESS_KEY_ID. Put the Account ID in R2_ACCOUNT_ID: ${WHERE_ID}.` };
  }

  let b = unquote(bucket);
  if (!b) b = bucketInAddress;
  if (!b) return { error: 'R2_BACKUP_BUCKET is empty.' };
  const url = /^(?:s3:\/\/|https?:\/\/[^/?#]+\/)(.*)$/i.exec(b);
  if (url) { b = url[1]; notes.push('R2_BACKUP_BUCKET: took the bucket name out of the address'); }
  if (b.includes('/')) {
    b = b.split('/').find(Boolean) ?? '';
    notes.push('R2_BACKUP_BUCKET: kept only the bucket name, before the /');
  }
  if (/[A-Z]/.test(b)) { b = b.toLowerCase(); notes.push('R2_BACKUP_BUCKET: bucket names are lower case, so it was lower-cased'); }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(b)) {
    return { error: 'R2_BACKUP_BUCKET should be just the bucket\'s name as Cloudflare → R2 lists it, e.g. parish-backups (3 to 63 lower-case letters, digits and hyphens).' };
  }

  const endpoint = `https://${a}.${jurisdiction ? `${jurisdiction}.` : ''}r2.cloudflarestorage.com`;
  return { endpoint, account: a, bucket: b, notes };
}

function unquote(v) {
  const s = String(v ?? '').trim();
  return (/^(['"])(.*)\1$/s.exec(s)?.[2] ?? s).trim();
}

// Run as a script (the workflow), not when imported (the tests).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { endpoint, account, bucket, notes, error } = normalizeR2({
    accountId: process.env.R2_ACCOUNT_ID,
    bucket: process.env.R2_BACKUP_BUCKET,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  });
  if (error) {
    console.log(`::error::${error} No backup was made (see docs/backups.md).`);
    process.exit(1);
  }
  console.log(`::add-mask::${account}`);
  console.log(`::add-mask::${bucket}`);
  for (const n of notes) console.log(`::notice::${n}.`);
  if (!notes.length) console.log('R2_ACCOUNT_ID and R2_BACKUP_BUCKET look right.');
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `R2_ENDPOINT=${endpoint}\nR2_BUCKET=${bucket}\n`);
}
