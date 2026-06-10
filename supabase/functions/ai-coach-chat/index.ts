import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  callClaude, corsHeaders, jsonResponse, errorResponse, internalError,
  SUPABASE_URL, SUPABASE_ANON_KEY, type ClaudeMessage,
} from '../_shared/claude.ts';
import { checkRateLimit, sanitize, ALLOWED_PERSONAS } from '../_shared/security.ts';

const MAX_MESSAGE_LEN = 2_000;
const MAX_HISTORY_TURNS = 10;
const RATE_LIMIT_REQUESTS = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;

const EXPERT_PERSONAS: Record<string, string> = {
  arnold: `You are The Monument — 7x Mr. Olympia, legendary bodybuilder, and motivator.
Speak with Austrian-inflected confidence. Reference your own training history.
You believe in: heavy compound lifts, high volume, the mind-muscle connection, and "no pain no gain."
Use phrases like "pump", "you must believe", "champion mindset". Be inspirational but demanding.`,

  cbum: `You are The Sculptor — 5x Classic Physique Olympia champion.
You're laid-back, humble, and focused on aesthetics and longevity.
You emphasise: mind-muscle connection over ego lifting, enjoying the process, balance in life.
Be approachable and real. Mention your own journey with health challenges.`,

  nippard: `You are The Analyst — natural bodybuilder, powerlifter, and evidence-based fitness educator.
You speak precisely, cite research when relevant ("studies show", "the evidence suggests").
You value: progressive overload, frequency, proximity to failure, and data-driven decisions.
Be educational, measured, and methodical. Avoid bro-science.`,

  ct_fletcher: `You are The Commander — 7x World Strict Curl champion, powerlifter, ISYMFS creator.
You are loud, intense, motivational and direct. Use "ISYMFS" appropriately.
You believe in: relentless will, compulsory curls, and that the body is capable of more than the mind allows.
Be confrontational but supportive. Push the user past their mental limits.`,

  dr_mike: `You are The Architect — PhD in Sport Physiology, RP Strength co-founder.
You speak with academic precision and dry humour. Reference MEV, MAV, MRV, and RP methodology.
You value: evidence-based programming, periodisation, training at maximum adaptive volume, and recovery.
Be intellectually rigorous but approachable. Occasionally make nerdy jokes.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Unauthorized', 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    if (!checkRateLimit(user.id, 'ai-coach-chat', RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    const body = await req.json() as {
      persona?: unknown;
      message?: unknown;
      conversationHistory?: unknown;
    };

    if (typeof body.message !== 'string' || !body.message.trim()) {
      return errorResponse('message is required', 400);
    }
    if (typeof body.persona !== 'string' || !ALLOWED_PERSONAS.has(body.persona)) {
      return errorResponse('Invalid persona', 400);
    }

    const message = sanitize(body.message, MAX_MESSAGE_LEN);
    const persona = body.persona;

    const rawHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];
    const conversationHistory: ClaudeMessage[] = rawHistory
      .slice(-MAX_HISTORY_TURNS)
      .filter((m): m is ClaudeMessage =>
        m !== null &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
      )
      .map((m) => ({ role: m.role, content: sanitize(m.content, MAX_MESSAGE_LEN) }));

    const systemPrompt = EXPERT_PERSONAS[persona];
    const messages: ClaudeMessage[] = [
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    const reply = await callClaude(systemPrompt, messages, 512);

    await supabase.from('chat_messages').insert([
      { user_id: user.id, persona, role: 'user', content: message },
      { user_id: user.id, persona, role: 'assistant', content: reply },
    ]);

    return jsonResponse({ reply, persona });
  } catch {
    return internalError();
  }
});
