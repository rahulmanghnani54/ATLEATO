// Supabase Edge Function — delete-account
//
// Google Play requires an in-app account-deletion path. The app calls this with
// the signed-in user's JWT; we verify it, then hard-delete the auth user with the
// service role. The schema cascades: profiles.id -> auth.users ON DELETE CASCADE,
// and every user table -> profiles(id) / auth.users ON DELETE CASCADE — so
// removing the auth user erases ALL of the user's data in a single operation.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !serviceRole) return json({ error: 'Server not configured' }, 500);

    // 1. Identify the caller from their JWT — never trust a client-supplied id.
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid or expired session' }, 401);

    // 2. Hard-delete the auth user with the service role. ON DELETE CASCADE wipes
    //    the profile + every user-owned table.
    const admin = createClient(url, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true, deleted: user.id }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
