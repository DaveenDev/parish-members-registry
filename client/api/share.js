// Vercel Function: link previews for Facebook, Messenger, Viber and other
// preview robots (server/share.js). vercel.json sends only those robots here
// (by user agent), with the address asked for in ?path=. Reads the database
// with the project's VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY settings.

import { shareResponse } from '../server/share.js';

export async function GET(request) {
  const url = new URL(request.url);
  return shareResponse({
    origin: url.origin,
    pathname: url.searchParams.get('path') || '/',
    // A sacrament guide's ?guide=: Vercel passes the address's query along.
    guide: url.searchParams.get('guide') || '',
    indexHtml: () => fetch(`${url.origin}/index.html`, { signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.text() : null)),
    supabase: { url: process.env.VITE_SUPABASE_URL, anonKey: process.env.VITE_SUPABASE_ANON_KEY },
  });
}
