// Edge Function: signed photo uploads to Cloudflare R2 for the Parish Website.
// The logic lives in handler.js (plain JS, unit tested under Node); this
// file only adapts it to Deno, HTTP and R2.
//
// Deploy:  npx supabase functions deploy media-upload --project-ref <your-project-ref>
// Secrets (npx supabase secrets set ...): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL. See docs/media-storage.md.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1';
import { handleMediaRequest } from './handler.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const env = (k: string) => (Deno.env.get(k) || '').trim();
const accountId = env('R2_ACCOUNT_ID');
const bucket = env('R2_BUCKET');
const publicBase = env('R2_PUBLIC_BASE_URL');
const configured = !!(accountId && bucket && publicBase && env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY'));

const s3 = configured
  ? new AwsClient({ accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' })
  : null;
const objectUrl = (key: string) => `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

const r2 = {
  configured,
  publicBase,
  /** A PUT link valid for 10 minutes; the browser must send the same Content-Type. */
  async signPut(key: string, contentType: string) {
    const url = new URL(objectUrl(key));
    url.searchParams.set('X-Amz-Expires', '600');
    const signed = await s3!.sign(new Request(url, { method: 'PUT', headers: { 'Content-Type': contentType } }), { aws: { signQuery: true } });
    return signed.url;
  },
  async remove(key: string) {
    const res = await s3!.fetch(objectUrl(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`R2 refused the delete (${res.status})`);
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request' });
  }

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await handleMediaRequest({ admin, token, body, r2 });
  return json(result.status, result.body);
});
