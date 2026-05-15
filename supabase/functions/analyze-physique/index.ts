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

function extractJsonAndNarrative(text: string): { jsonObj: Record<string, unknown>; narrative: string } | null {
  try {
    // Find the JSON block after SCORES_JSON:
    const jsonStart = text.indexOf('SCORES_JSON:');
    if (jsonStart === -1) return null;
    const afterLabel = text.slice(jsonStart + 'SCORES_JSON:'.length).trim();

    // Extract balanced braces
    let depth = 0;
    let jsonEnd = -1;
    for (let i = 0; i < afterLabel.length; i++) {
      if (afterLabel[i] === '{') depth++;
      else if (afterLabel[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
    }
    if (jsonEnd === -1) return null;
    const jsonStr = afterLabel.slice(0, jsonEnd + 1);
    const jsonObj = JSON.parse(jsonStr) as Record<string, unknown>;

    // Extract NARRATIVE
    const narrativeMatch = text.match(/NARRATIVE:\s*([\s\S]+)/);
    if (!narrativeMatch) return null;

    return { jsonObj, narrative: narrativeMatch[1].trim() };
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
      const parsed = extractJsonAndNarrative(raw);
      if (!parsed) return errorResponse('AI returned unrecognized format — please retry', 502);
      const clamp = (n: unknown) => Math.min(10, Math.max(1, Math.round(Number(n))));

      return jsonResponse({
        fullness: clamp(parsed.jsonObj.fullness),
        leanness: clamp(parsed.jsonObj.leanness),
        symmetry: clamp(parsed.jsonObj.symmetry),
        narrative: parsed.narrative,
      });
    }

    // compare mode
    const rawA = body.checkinAImages;
    const rawB = body.checkinBImages;
    const aImages: ImageSet = {
      front: typeof (rawA as any)?.front === 'string' ? (rawA as any).front : undefined,
      side: typeof (rawA as any)?.side === 'string' ? (rawA as any).side : undefined,
      back: typeof (rawA as any)?.back === 'string' ? (rawA as any).back : undefined,
    };
    const bImages: ImageSet = {
      front: typeof (rawB as any)?.front === 'string' ? (rawB as any).front : undefined,
      side: typeof (rawB as any)?.side === 'string' ? (rawB as any).side : undefined,
      back: typeof (rawB as any)?.back === 'string' ? (rawB as any).back : undefined,
    };
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

    const parsed = extractJsonAndNarrative(raw);
    if (!parsed) return errorResponse('AI returned unrecognized format — please retry', 502);
    const clamp = (n: unknown) => Math.min(10, Math.max(1, Math.round(Number(n))));
    const s = parsed.jsonObj;

    return jsonResponse({
      scoresA: { fullness: clamp(s.fullness_a), leanness: clamp(s.leanness_a), symmetry: clamp(s.symmetry_a) },
      scoresB: { fullness: clamp(s.fullness_b), leanness: clamp(s.leanness_b), symmetry: clamp(s.symmetry_b) },
      narrative: parsed.narrative,
    });
  } catch {
    return internalError();
  }
});
