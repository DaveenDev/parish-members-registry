// Cloudflare Worker entry (wrangler.jsonc `main`). The Supabase URL and anon
// key are the public ones the site itself is built with: `npm run build`
// writes them to supabase.gen.js from .env.production (vite.config.js), so
// there's nothing to type into Cloudflare. Settings given to the Worker in
// Cloudflare (Variables) win, should a project ever need different ones.

import { handle } from './app.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase.gen.js';

export default {
  fetch(request, env) {
    return handle(request, env, {
      url: env.VITE_SUPABASE_URL || SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY,
    });
  },
};
