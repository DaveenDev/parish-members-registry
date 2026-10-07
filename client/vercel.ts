// Vercel config (replaces vercel.json so the /media proxy can differ per site).
//
// /media/<key> is fetched from the photo bucket's public r2.dev address on
// Vercel's servers, because some internet providers block r2.dev
// (docs/media-storage.md). Each Vercel project points it at its own bucket
// with the MEDIA_ORIGIN environment variable, e.g. the training site at the
// testing bucket. Without it, the live site's bucket is used.
import type { VercelConfig } from '@vercel/config/v1';

const LIVE_MEDIA_ORIGIN = 'https://pub-25d83e20c5f14fc0b2f81d3476651579.r2.dev';

const mediaOrigin = (process.env.MEDIA_ORIGIN || LIVE_MEDIA_ORIGIN).trim().replace(/\/+$/, '');
if (!/^https:\/\/[^/\s]+$/.test(mediaOrigin)) {
  throw new Error(`MEDIA_ORIGIN must be just the bucket's address, like https://pub-….r2.dev (got "${mediaOrigin}")`);
}

export const config: VercelConfig = {
  rewrites: [
    { source: '/media/:path*', destination: `${mediaOrigin}/:path*` },
    { source: '/(.*)', destination: '/index.html' },
  ],
  headers: [
    {
      source: '/media/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ],
};
