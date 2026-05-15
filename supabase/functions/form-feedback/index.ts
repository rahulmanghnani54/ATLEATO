import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  callClaude, corsHeaders, jsonResponse, errorResponse, internalError,
  SUPABASE_URL, SUPABASE_ANON_KEY,
} from '../_shared/claude.ts';
import { checkRateLimit, sanitize } from '../_shared/security.ts';

const MAX_EXERCISE_NAME_LEN = 100;
const MAX_ISSUE_LEN = 200;
const MAX_ISSUES_COUNT = 10;
const MAX_PERSONA_LEN = 50;

const PERSONA_VOICES: Record<string, string> = {
  cbum: 'Chris Bumstead (Classic Physique GOAT): calm, technical, mentions symmetry and aesthetics. Prefix your response with "CBUM SAYS".',
  arnold: 'Arnold Schwarzenegger: confident, motivational, occasionally references pumping iron and the mind-muscle connection. Prefix with "ARNOLD SAYS".',
  nippard: 'Jeff Nippard: science-based, precise, references degrees and research. Prefix with "NIPPARD SAYS".',
  ct_fletcher: 'CT Fletcher: intense, no-nonsense, uses direct commands. Prefix with "CT SAYS".',
  dr_mike: 'Dr Mike Israetel: evidence-based, friendly, references MEV/MRV concepts. Prefix with "DR MIKE SAYS".',
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

    // Form coach fires on error corrections with a 15s cooldown — allow higher rate
    if (!checkRateLimit(user.id, 'form-feedback', 30, 60_000)) {
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    const body = await req.json() as {
      exerciseName?: unknown;
      detectedIssues?: unknown;
      persona?: unknown;
      angles?: unknown;
    };

    if (typeof body.exerciseName !== 'string' || !body.exerciseName.trim()) {
      return errorResponse('exerciseName required', 400);
    }

    const exerciseName = sanitize(body.exerciseName, MAX_EXERCISE_NAME_LEN);

    const rawIssues = Array.isArray(body.detectedIssues) ? body.detectedIssues : [];
    const detectedIssues = rawIssues
      .filter((i): i is string => typeof i === 'string')
      .slice(0, MAX_ISSUES_COUNT)
      .map((i) => sanitize(i, MAX_ISSUE_LEN));

    const personaKey =
      typeof body.persona === 'string'
        ? sanitize(body.persona.toLowerCase(), MAX_PERSONA_LEN)
        : 'cbum';
    const personaVoice = PERSONA_VOICES[personaKey] ?? PERSONA_VOICES.cbum;

    // Structured angle data — sanitize keys and values
    const angles: Record<string, number> = {};
    if (body.angles && typeof body.angles === 'object') {
      for (const [k, v] of Object.entries(body.angles as Record<string, unknown>)) {
        const safeKey = sanitize(String(k), 40);
        if (safeKey && typeof v === 'number' && isFinite(v)) {
          angles[safeKey] = Math.round(v * 10) / 10;
        }
      }
    }

    const anglesText = Object.entries(angles).length > 0
      ? `Measured joint angles:\n${Object.entries(angles).map(([k, v]) => `  ${k}: ${v}°`).join('\n')}`
      : '';

    const issuesSummary = detectedIssues.length > 0
      ? `Detected issues:\n${detectedIssues.map((i) => `- ${i}`).join('\n')}`
      : 'No specific issues detected — form looks good.';

    const prompt = `Exercise: ${exerciseName}

${issuesSummary}

${anglesText}

Respond in the voice of ${personaVoice}

Give ONE focused coaching cue addressing the most critical issue (or a reinforcing cue if form is good). Reference the actual angle values where relevant. Keep it under 60 words. Be direct, in-character, and actionable.`;

    const systemPrompt = 'You are a world-class personal trainer providing real-time form coaching. Respond exactly in the voice of the specified persona.';

    const feedback = await callClaude(
      systemPrompt,
      [{ role: 'user', content: prompt }],
      200,
    );

    return jsonResponse({ feedback, exerciseName, persona: personaKey });
  } catch {
    return internalError();
  }
});
