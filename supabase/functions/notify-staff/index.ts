// Edge Function: phone and computer notifications for parish staff (Web
// Push). The logic lives in handler.js and webpush.js (plain JS, unit tested
// under Node); this file only adapts it to Deno and HTTP.
//
// Deploy (the database calls it without a login, so JWT checking is off;
// handler.js checks the caller itself):
//   npx supabase functions deploy notify-staff --no-verify-jwt --project-ref <your-project-ref>
// There are no secrets to set: the push keys are made on first use and kept
// in notify_config (0034 migration). See docs/notifications.md.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleNotifyRequest } from './handler.js';
import { generateVapidKeys, sendPush } from './webpush.js';

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const FUNCTION_URL = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/notify-staff`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request' });
  }

  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await handleNotifyRequest({
    admin,
    token: (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''),
    secret: req.headers.get('x-notify-secret') || '',
    body,
    functionUrl: FUNCTION_URL,
    push: sendPush,
    generateKeys: generateVapidKeys,
  });
  return json(result.status, result.body);
});
