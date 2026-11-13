// Vercel Function: /sitemap.xml (vercel.json), from server/sitemap.js.

import { sitemapResponse } from '../server/sitemap.js';

export async function GET(request) {
  return sitemapResponse({
    origin: new URL(request.url).origin,
    supabase: { url: process.env.VITE_SUPABASE_URL, anonKey: process.env.VITE_SUPABASE_ANON_KEY },
  });
}
