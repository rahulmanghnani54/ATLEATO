import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders, jsonResponse, errorResponse, internalError,
  SUPABASE_URL, SUPABASE_ANON_KEY,
} from '../_shared/claude.ts';
import { checkRateLimit, ALLOWED_PERSONAS } from '../_shared/security.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const VISION_MODEL = 'claude-sonnet-4-5-20251001';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY env var is required');

const PERSONA_VOICES: Record<string, string> = {
  cbum: 'Chris Bumstead (calm, technical, focuses on symmetry and conditioning)',
  arnold: 'Arnold Schwarzenegger (confident, motivational, references the golden era)',
  nippard: 'Jeff Nippard (science-based, precise, references muscle development objectively)',
  ct_fletcher: 'CT Fletcher (intense, direct, no fluff)',
  dr_mike: 'Dr Mike Israetel (evidence-based, friendly, references hypertrophy science)',
};

interface ImageSet {
  front?: string;
  side?: string;
  back?: string;
}

function buildImageContent(images: ImageSet): unknown[] {
  const content: unknown[] = [];
  for (const [pose, b64] of Object.entries(images)) {
    if (!b64) continue;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
    });
    content.push({ type: 'text', text: `(${pose} view)` });
  }
  return content;
}

function parseScoreResponse(
  text: string,
): { fullness: number; leanness: number; symmetry: number; narrative: string } | null {
  try {
    const scoresMatch = text.match(/SCORES_JSON:\s*(\{[^}]+\})/);
    const narrativeMatch = text.match(/NARRATIVE:\s*([\s\S]+)/);
    if (!scoresMatch || !narrativeMatch) return null;
    const scores = JSON.parse(scoresMatch[1]);
    return {
      fullness: Math.min(10, Math.max(1, Math.round(Number(scores.fullness)))),
      leanness: Math.min(10, Math.max(1, Math.round(Number(scores.leanness)))),
      symmetry: Math.min(10, Math.max(1, Math.round(Number(scores.symmetry)))),
      narrative: narrativeMatch[1].trim(),
    };
  } catch {
    return null;
  }
}

async function callClaudeVision(
  systemPrompt: string,
  userContent: unknown[],
  maxTokens: number,
): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!response.ok) throw new Error(`Claude Vision API error ${response.status}`);
  const data = await response.json();
  return data.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
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

    if (!checkRateLimit(user.id, 'analyze-physique', 10, 60 * 60 * 1000)) {
      return errorResponse('Rate limit exceeded. Please wait before analysing again.', 429);
    }

    const body = await req.json() as {
      mode?: unknown;
      persona?: unknown;
      frontImageBase64?: unknown;
      sideImageBase64?: unknown;
      backImageBase64?: unknown;
      checkinAImages?: unknown;
      checkinBImages?: unknown;
      checkinADate?: unknown;
      checkinBDate?: unknown;
    };

    const mode = body.mode === 'compare' ? 'compare' : 'single';
    const personaKey = ALLOWED_PERSONAS.has(String(body.persona ?? ''))
      ? String(body.persona)
      : 'cbum';
    const personaVoice = PERSONA_VOICES[personaKey];

    const systemPrompt =
      `You are a world-class physique coach analysing bodybuilding progress photos. Respond in the voice of ${personaVoice}. Be constructive and specific. Always respond in exactly this format:\nSCORES_JSON: {"fullness": <1-10>, "leanness": <1-10>, "symmetry": <1-10>}\nNARRATIVE: <your coaching text>`;

    if (mode === 'single') {
      const images: ImageSet = {
        front: typeof body.frontImageBase64 === 'string' ? body.frontImageBase64 : undefined,
        side: typeof body.sideImageBase64 === 'string' ? body.sideImageBase64 : undefined,
        back: typeof body.backImageBase64 === 'string' ? body.backImageBase64 : undefined,
      };
      if (!images.front) return errorResponse('frontImageBase64 required for single mode', 400);

      const userContent = [
        ...buildImageContent(images),
        {
          type: 'text',
          text: 'Score this physique check-in on muscle fullness, leanness, and symmetry (each 1–10). Then give a ~80-word coaching narrative.',
        },
      ];

      const raw = await callClaudeVision(systemPrompt, userContent, 300);
      const parsed = parseScoreResponse(raw);
      if (!parsed) return internalError();

      return jsonResponse({
        fullness: parsed.fullness,
        leanness: parsed.leanness,
        symmetry: parsed.symmetry,
        narrative: parsed.narrative,
      });
    }

    // compare mode
    const aImages = (body.checkinAImages ?? {}) as ImageSet;
    const bImages = (body.checkinBImages ?? {}) as ImageSet;
    if (!aImages.front || !bImages.front) {
      return errorResponse(
        'checkinAImages.front and checkinBImages.front required for compare mode',
        400,
      );
    }

    const dateA = typeof body.checkinADate === 'string' ? body.checkinADate : 'earlier';
    const dateB = typeof body.checkinBDate === 'string' ? body.checkinBDate : 'recent';

    const userContent = [
      { type: 'text', text: `CHECK-IN A (${dateA}):` },
      ...buildImageContent(aImages),
      { type: 'text', text: `CHECK-IN B (${dateB}):` },
      ...buildImageContent(bImages),
      {
        type: 'text',
        text: 'Score EACH check-in on muscle fullness, leanness, and symmetry (each 1–10), then give a ~100-word comparison narrative covering what changed. Format:\nSCORES_JSON: {"fullness_a":<n>,"leanness_a":<n>,"symmetry_a":<n>,"fullness_b":<n>,"leanness_b":<n>,"symmetry_b":<n>}\nNARRATIVE: <text>',
      },
    ];

    const raw = await callClaudeVision(systemPrompt, userContent, 400);

    const scoresMatch = raw.match(/SCORES_JSON:\s*(\{[^}]+\})/);
    const narrativeMatch = raw.match(/NARRATIVE:\s*([\s\S]+)/);
    if (!scoresMatch || !narrativeMatch) return internalError();

    const s = JSON.parse(scoresMatch[1]);
    const clamp = (n: unknown) => Math.min(10, Math.max(1, Math.round(Number(n))));

    return jsonResponse({
      scoresA: { fullness: clamp(s.fullness_a), leanness: clamp(s.leanness_a), symmetry: clamp(s.symmetry_a) },
      scoresB: { fullness: clamp(s.fullness_b), leanness: clamp(s.leanness_b), symmetry: clamp(s.symmetry_b) },
      narrative: narrativeMatch[1].trim(),
    });
  } catch {
    return internalError();
  }
});
