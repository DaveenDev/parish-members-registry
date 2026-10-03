// Phone and computer notifications for parish staff (Web Push).
//
// The database (0034_staff_notifications.sql) calls this function through
// pg_net each time a notification is added — a request from the website,
// or the 7:00 AM summary — and it sends that notification to the devices of
// every account that may see it. Staff also call it from Settings →
// Notifications to get the push key and to send themselves a test.
//
// index.ts wires it to Deno; this file is plain JavaScript with its
// dependencies passed in, so it can be unit tested under Node.
//
// Actions:
//   setup    (signed-in staff)  returns { publicKey }. The first call makes
//            the push keys and records this function's address, so there are
//            no secrets to set by hand.
//   test     (signed-in staff)  a test notification to the caller's devices
//   deliver  (the database, with x-notify-secret)  sends notification `id`

// Same rule as manage-staff: a disabled login is "banned" until far in the future.
const isDisabled = (user, now) => !!user?.banned_until && new Date(user.banned_until) > now;

// Only the browsers' own push services: a subscription pointing anywhere
// else is never called.
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export function isPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

/** What the phone shows: no names or contact details, only the kind of request and its number. */
export function pushPayload(n) {
  const body = n.kind === 'digest' ? n.detail || '' : [n.ref_no, 'Tap to open'].filter(Boolean).join(' · ');
  return { title: n.title, body, url: n.link || '/admin', tag: `staff-${n.id}`, urgent: !!n.urgent };
}

/** The VAPID `sub`: the parish email, or else the website's address. */
export function contactFor(email, site, functionUrl) {
  const mail = String(email || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return `mailto:${mail}`;
  try {
    const url = new URL(site);
    if (url.protocol === 'https:') return url.origin;
  } catch { /* fall through */ }
  return new URL(functionUrl).origin;
}

/** Constant-time comparison, so the secret can't be guessed a character at a time. */
function sameSecret(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const fail = (status, error) => ({ status, body: { error } });
const MIGRATION = 'Run the 0034_staff_notifications.sql migration in Supabase first.';

async function readConfig(admin) {
  const { data, error } = await admin.from('notify_config').select('*').eq('id', 1).maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * The settings row with push keys and this function's address filled in.
 * Two staff turning notifications on at the same moment can't end up with
 * different keys: only the first key pair is kept.
 */
export async function ensureConfig(admin, { functionUrl, site, generateKeys }) {
  let cfg = await readConfig(admin);
  if (!cfg) return null;
  if (!cfg.vapid_public_key) {
    const keys = await generateKeys();
    await admin.from('notify_config')
      .update({ vapid_public_key: keys.publicKey, vapid_private_jwk: keys.privateJwk, updated_at: new Date().toISOString() })
      .eq('id', 1).is('vapid_public_key', null);
    cfg = await readConfig(admin);
  }
  const { data: parish } = await admin.from('parish_settings').select('email').eq('id', 1).maybeSingle();
  const contact = contactFor(parish?.email, site || cfg.contact, functionUrl);
  if (cfg.function_url !== functionUrl || cfg.contact !== contact) {
    await admin.from('notify_config').update({ function_url: functionUrl, contact, updated_at: new Date().toISOString() }).eq('id', 1);
    cfg = { ...cfg, function_url: functionUrl, contact };
  }
  return cfg;
}

async function staffCaller(admin, token, now) {
  if (!token) return { error: fail(401, 'Please sign in again') };
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return { error: fail(401, 'Please sign in again') };
  if (isDisabled(user, now)) return { error: fail(403, 'This account is disabled') };
  return { user };
}

/**
 * Send one payload to many subscriptions. Gone subscriptions (the phone
 * turned notifications off, or the app was removed) are deleted.
 */
export async function sendToAll(admin, subs, payload, cfg, push, now) {
  const vapid = { publicKey: cfg.vapid_public_key, privateJwk: cfg.vapid_private_jwk, subject: cfg.contact };
  let sent = 0;
  let removed = 0;
  let failed = 0;
  await Promise.all(subs.map(async (s) => {
    if (!isPushEndpoint(s.endpoint)) { failed += 1; return; }
    let status;
    try {
      status = await push(s, payload, vapid, { urgent: payload.urgent });
    } catch {
      failed += 1;
      return;
    }
    if (status === 404 || status === 410) {
      await admin.from('staff_push_subscriptions').delete().eq('id', s.id);
      removed += 1;
    } else if (status >= 200 && status < 300) {
      await admin.from('staff_push_subscriptions').update({ last_ok_at: now.toISOString() }).eq('id', s.id);
      sent += 1;
    } else {
      failed += 1;
    }
  }));
  return { sent, removed, failed };
}

export async function handleNotifyRequest({ admin, token, secret, body, functionUrl, push, generateKeys, now = new Date() }) {
  const action = body?.action;

  if (action === 'deliver') {
    const cfg = await readConfig(admin);
    if (!cfg || !sameSecret(secret, cfg.hook_secret)) return fail(401, 'Not allowed');
    if (!cfg.vapid_public_key) return ok({ sent: 0 });
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, 'Which notification?');
    const { data: n } = await admin.from('staff_notifications').select('*').eq('id', id).maybeSingle();
    if (!n) return fail(404, 'No such notification');
    if (n.pushed_at) return ok({ sent: 0, already: true });
    // Claim it first, so a repeated call can't send it twice.
    const { data: claimed } = await admin.from('staff_notifications')
      .update({ pushed_at: now.toISOString() }).eq('id', id).is('pushed_at', null).select('id');
    if (!claimed?.length) return ok({ sent: 0, already: true });
    const { data: subs, error } = await admin.rpc('notification_push_targets', { p_id: id });
    if (error) return fail(500, error.message);
    return ok(await sendToAll(admin, subs || [], pushPayload(n), cfg, push, now));
  }

  if (action !== 'setup' && action !== 'test') return fail(400, 'Unknown action');

  const caller = await staffCaller(admin, token, now);
  if (caller.error) return caller.error;
  const cfg = await ensureConfig(admin, { functionUrl, site: body.site, generateKeys });
  if (!cfg) return fail(500, MIGRATION);

  if (action === 'setup') return ok({ publicKey: cfg.vapid_public_key });

  // test: this device only when it says which one it is, else all of the caller's.
  let query = admin.from('staff_push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', caller.user.id);
  if (body.endpoint) query = query.eq('endpoint', String(body.endpoint));
  const { data: subs, error } = await query;
  if (error) return fail(500, error.message);
  if (!subs?.length) return fail(400, 'Turn on notifications on this device first.');
  const result = await sendToAll(admin, subs, {
    title: 'Notifications are on',
    body: 'New requests from the website will show up like this.',
    url: '/admin/settings/notifications',
    tag: 'staff-test',
    urgent: false,
  }, cfg, push, now);
  return ok(result);
}
