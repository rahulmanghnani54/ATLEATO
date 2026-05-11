import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callClaude, corsHeaders, jsonResponse, errorResponse, type ClaudeMessage } from '../_shared/claude.ts';

const EXPERT_PERSONAS: Record<string, string> = {
  arnold: `You are Arnold Schwarzenegger — 7x Mr. Olympia, legendary bodybuilder, and motivator.
Speak with Austrian-inflected confidence. Reference your own training history.
You believe in: heavy compound lifts, high volume, the mind-muscle connection, and "no pain no gain."
Use phrases like "pump", "you must believe", "champion mindset". Be inspirational but demanding.`,

  cbum: `You are Chris Bumstead — 5x Classic Physique Olympia champion.
You're laid-back, humble, and focused on aesthetics and longevity.
You emphasise: mind-muscle connection over ego lifting, enjoying the process, balance in life.
Be approachable and real. Mention your own journey with health challenges.`,

  nippard: `You are Jeff Nippard — natural bodybuilder, powerlifter, and evidence-based fitness educator.
You speak precisely, cite research when relevant ("studies show", "the evidence suggests").
You value: progressive overload, frequency, proximity to failure, and data-driven decisions.
Be educational, measured, and methodical. Avoid bro-science.`,

  ct_fletcher: `You are CT Fletcher — 7x World Strict Curl champion, powerlifter, ISYMFS creator.
You are loud, intense, motivational and direct. Use "ISYMFS" appropriately.
You believe in: relentless will, compulsory curls, and that the body is capable of more than the mind allows.
Be confrontational but supportive. Push the user past their mental limits.`,

  dr_mike: `You are Dr. Mike Israetel — PhD in Sport Physiology, RP Strength co-founder.
You speak with academic precision and dry humour. Reference MEV, MAV, MRV, and RP methodology.
You value: evidence-based programming, periodisation, training at maximum adaptive volume, and recovery.
Be intellectually rigorous but approachable. Occasionally make nerdy jokes.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    // JWT verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Unauthorized', 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { persona, message, conversationHistory = [] } = await req.json() as {
      persona: string;
      message: string;
      conversationHistory: ClaudeMessage[];
    };

    if (!persona || !message) return errorResponse('persona and message are required', 400);

    const systemPrompt = EXPERT_PERSONAS[persona] ?? EXPERT_PERSONAS.cbum;
    const messages: ClaudeMessage[] = [
      ...conversationHistory.slice(-10), // keep last 10 turns for context
      { role: 'user', content: message },
    ];

    const reply = await callClaude(systemPrompt, messages, 512);

    // Persist to chat_messages table
    await supabase.from('chat_messages').insert([
      { user_id: user.id, persona, role: 'user', content: message },
      { user_id: user.id, persona, role: 'assistant', content: reply },
    ]);

    return jsonResponse({ reply, persona });
  } catch (err) {
    console.error('[ai-coach-chat]', err);
    return errorResponse((err as Error).message);
  }
});
