// Mints a short-lived signed WebSocket URL for the ElevenLabs Conversational AI
// agent, so the app can start a live voice call WITHOUT ever holding the API key.
// The key (ELEVENLABS_API_KEY) is a server-side Supabase secret. Only
// authenticated users get a URL (protects your ElevenLabs credits from abuse).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Public identifier (not secret) — safe to hardcode. Move to env later if you
// add per-persona agents.
const AGENT_ID = 'agent_9901kvsp6pzafbc8r5nab212nh45';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors() });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // Require a logged-in user (don't let anyone burn your ElevenLabs minutes).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Defensively trim — a trailing space/newline from a dashboard paste makes
    // ElevenLabs reject the key with 401.
    const apiKey = (ELEVENLABS_API_KEY || '').trim();
    if (!apiKey) return json({ error: 'Voice not configured (ELEVENLABS_API_KEY missing)' }, 500);
    console.log('[elevenlabs-signed-url] key length:', apiKey.length, 'agent:', AGENT_ID);

    // The React Native SDK connects over WebRTC, which needs a CONVERSATION
    // TOKEN (not a WebSocket signed URL). Mint one for our private agent.
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${AGENT_ID}`,
      { headers: { 'xi-api-key': apiKey } },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('[elevenlabs-signed-url] ElevenLabs error', resp.status, body);
      // Surface ElevenLabs' reason (the error body, not the key) so it's diagnosable.
      return json({ error: `ElevenLabs ${resp.status}: ${body.slice(0, 200)}` }, 502);
    }
    const data = await resp.json();
    if (!data?.token) {
      console.error('[elevenlabs-signed-url] no token in response', JSON.stringify(data));
      return json({ error: 'No conversation token returned' }, 502);
    }
    return json({ conversationToken: data.token, agentId: AGENT_ID });
  } catch (e) {
    console.error('[elevenlabs-signed-url] failed', (e as any)?.message ?? e);
    return json({ error: 'Internal error' }, 500);
  }
});
