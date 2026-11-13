// The database as the public site reads it: the REST API with the public
// (anon) key, under the same row-level security as any visitor. Shared by
// the link previews and the sitemap, on Vercel (api/) and Cloudflare (worker/).

/**
 * A reader for one project. `url` and `anonKey` are the site's own
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Without them every read gives
 * null, so the caller falls back to what it can say without the database.
 */
export function supabaseReader({ url, anonKey, timeoutMs = 4000 }) {
  const base = String(url || '').replace(/\/+$/, '');
  const key = String(anonKey || '');

  async function rest(path, init = {}) {
    if (!base || !key) return null;
    const res = await fetch(`${base}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? res.json() : null;
  }

  const rpc = (fn, args = {}) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  return { rest, rpc };
}
