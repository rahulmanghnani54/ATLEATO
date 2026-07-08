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
  arnold: `You are The Monument — Monument eralympia, legendary bodybuilder, and motivator.
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

  dr_mike: `You are The Architect — periodization expert, volume-landmark periodization expert.
You speak with academic precision and dry humour. Reference MEV, MAV, MRV, and RP methodology.
You value: evidence-based programming, periodisation, training at maximum adaptive volume, and recovery.
Be intellectually rigorous but approachable. Occasionally make nerdy jokes.`,
};

// Shared rules appended to EVERY persona so replies feel like a real coach, not
// a chatbot. Keeps them in character, concise, actionable, and safe.
const COACHING_DIRECTIVE = `
── HOW TO COACH ──
- You are THIS user's personal coach inside the Evulto app. Use the profile facts
  below to make every reply specific to THEM — their name, goal, program, and
  recent training. Never give generic advice you'd give a stranger.
- Be concise and punchy: 2–5 short sentences for most replies. Lead with the
  answer, then one actionable next step. Only go long if they ask for a full plan.
- Stay 100% in character. Never say you are an AI, a language model, or "as The
  Sculptor". Just BE the coach.
- Safety: you are not a doctor. If they mention sharp pain, injury, dizziness,
  chest pain, or disordered eating, tell them to stop and see a medical
  professional — do not diagnose or prescribe.
- Motivate honestly. Celebrate real progress from their stats; don't invent it.`;

const GOAL_LABEL: Record<string, string> = {
  lose_fat: 'lose fat / cut', build_muscle: 'build muscle / bulk',
  recomp: 'body recomposition', maintain: 'maintain', strength: 'build strength',
};

/** Fetch a compact snapshot of who this user is, for the system prompt. */
async function buildUserContext(
  // deno-lint-ignore no-explicit-any
  supabase: any, userId: string, personaName: string,
): Promise<string> {
  const guard = <T,>(p: PromiseLike<T>) =>
    Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
  try {
    const [profileRes, workoutsRes, prsRes] = await Promise.all([
      guard(supabase.from('profiles').select('full_name, goal, weight_kg, height_cm, activity_level, date_of_birth').eq('id', userId).single()),
      guard(supabase.from('workout_logs').select('date, total_volume_kg').eq('user_id', userId).order('date', { ascending: false }).limit(10)),
      guard(supabase.from('personal_records').select('exercise_name, one_rep_max_kg').eq('user_id', userId).order('one_rep_max_kg', { ascending: false }).limit(3)),
    ]);
    const p = (profileRes as any)?.data;
    const workouts = ((workoutsRes as any)?.data ?? []) as { date: string; total_volume_kg: number | null }[];
    const prs = ((prsRes as any)?.data ?? []) as { exercise_name: string; one_rep_max_kg: number }[];

    const lines: string[] = [`── WHO YOU'RE COACHING ──`];
    if (p?.full_name) lines.push(`Name: ${p.full_name}`);
    if (p?.goal) lines.push(`Goal: ${GOAL_LABEL[p.goal] ?? p.goal}`);
    if (p?.weight_kg || p?.height_cm) lines.push(`Body: ${p.weight_kg ?? '?'}kg, ${p.height_cm ?? '?'}cm`);
    if (p?.activity_level) lines.push(`Activity level: ${p.activity_level}`);
    lines.push(`Following: The ${personaName}'s program (you).`);
    if (workouts.length) {
      const last = workouts[0]?.date;
      const trainedThisWeek = workouts.filter((w) => Date.now() - new Date(w.date).getTime() < 7 * 864e5).length;
      lines.push(`Training: ${trainedThisWeek} session(s) in the last 7 days; last workout ${last}.`);
    } else {
      lines.push(`Training: no logged workouts yet — they may be just starting. Encourage the first session.`);
    }
    if (prs.length) lines.push(`Recent PRs: ${prs.map((r) => `${r.exercise_name} ~${Math.round(r.one_rep_max_kg)}kg`).join(', ')}.`);
    return lines.join('\n');
  } catch {
    return ''; // context is a bonus — never fail the reply over it
  }
}

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

    // Persona voice + universal coaching rules + THIS user's real snapshot.
    const personaName = persona === 'cbum' ? 'Sculptor' : persona === 'arnold' ? 'Monument'
      : persona === 'nippard' ? 'Analyst' : persona === 'ct_fletcher' ? 'Commander' : 'Architect';
    const userContext = await buildUserContext(supabase, user.id, personaName);
    const systemPrompt =
      EXPERT_PERSONAS[persona] + '\n' + COACHING_DIRECTIVE + (userContext ? '\n\n' + userContext : '');

    const messages: ClaudeMessage[] = [
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    const reply = await callClaude(systemPrompt, messages, 600);

    await supabase.from('chat_messages').insert([
      { user_id: user.id, persona, role: 'user', content: message },
      { user_id: user.id, persona, role: 'assistant', content: reply },
    ]);

    return jsonResponse({ reply, persona });
  } catch (e) {
    // Log the FULL cause server-side (visible in Supabase → Edge Functions →
    // Logs) — includes Anthropic's error body so we can see exactly why it failed.
    const anyErr = e as any;
    console.error('[ai-coach-chat] failed:', anyErr?.message, anyErr?.anthropicBody ?? '');
    // Surface ONLY the safe status string (e.g. "Claude API error 401") to the
    // client for diagnosis — never the key or the raw Anthropic body.
    const msg = anyErr?.message;
    if (typeof msg === 'string' && msg.startsWith('Claude API error')) {
      return errorResponse(msg, 502);
    }
    return internalError();
  }
});
