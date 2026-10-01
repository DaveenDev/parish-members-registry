// Edge Function: staff account management for the admin panel.
// The logic lives in handler.js (plain JS, unit tested under Node); this
// file only adapts it to Deno and HTTP.
//
// Deploy:  npx supabase functions deploy manage-staff --project-ref <your-project-ref>
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to every
// function automatically; nothing else needs configuring.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleStaffRequest } from './handler.js';

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

  const result = await handleStaffRequest({ admin, token, body });
  return json(result.status, result.body);
});
