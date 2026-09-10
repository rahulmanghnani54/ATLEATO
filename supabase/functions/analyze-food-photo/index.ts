import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders, jsonResponse, errorResponse, internalError,
  callClaudeVision, VISION_MODEL_CHEAP,
  SUPABASE_URL, SUPABASE_ANON_KEY,
} from '../_shared/claude.ts';
import { checkRateLimit, MAX_IMAGE_BASE64_LEN } from '../_shared/security.ts';
import { requireTier } from '../_shared/entitlement.ts';
import { requireQuota, DAILY_QUOTA } from '../_shared/quota.ts';

// ---------------------------------------------------------------------------
// Food recognition from a photo.
//
// WHAT THIS USED TO DO: accept an up-to-8MB image, discard it without looking
// at it, sleep 600ms to imitate analysis, then return three foods shuffled with
// Math.random() and confidence scores randomised between 0.72 and 0.92 —
// behind a requireTier('pro') gate labelled "AI Food Scanner".
//
// That is worse than a broken feature. The failure was not an error the user
// could retry; it was confident wrong macros written into their nutrition
// history, indistinguishable from a working scanner, sold as a paid feature.
//
// It now actually looks at the photo. Haiku rather than Sonnet: identifying a
// plate of food is far easier than scoring a physique, and this is the
// higher-volume endpoint of the two.
// ---------------------------------------------------------------------------

interface FoodMatch {
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: string;
  confidence: number;
}

const SYSTEM_PROMPT = [
  'You identify food in a photograph and estimate its nutrition.',
  '',
  'Return ONLY a JSON array. No prose, no markdown fence. Each element:',
  '  {"food_name": string, "calories": number, "protein": number,',
  '   "carbs": number, "fat": number, "serving_size": string,',
  '   "confidence": number}',
  '',
  'Rules:',
  '- Return 1 to 3 items, most likely first. If the plate holds several distinct',
  '  foods, list them separately rather than inventing one combined dish.',
  '- protein/carbs/fat are grams and calories are kcal, for the portion you can',
  '  SEE - not a generic serving. Estimate the portion from the image.',
  '- serving_size describes what you estimated, e.g. "about 200g" or "1 bowl".',
  '- confidence is 0..1 and must reflect real uncertainty. A clear single food',
  '  is high; a blurry mixed plate is low. Do not inflate it.',
  '- If the image contains no food at all, return exactly [].',
  '- Never name a dish or cuisine you cannot see evidence for.',
].join('\n');

/**
 * Parse the model's reply into matches.
 *
 * FAILS CLOSED: anything unparseable returns null and the caller reports an
 * honest error. The whole point of this rewrite is that a wrong number must
 * never again be presented as a right one, so "couldn't read it" has to be a
 * reachable outcome.
 */
function parseMatches(raw: string): FoodMatch[] | null {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;

    // Ceilings are sanity bounds, not opinions: a single photographed portion
    // above these means the model mis-estimated, and writing that into someone's
    // nutrition history is the exact failure this endpoint exists to avoid.
    const num = (v: unknown, max: number): number | null => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > max) return null;
      return Math.round(n);
    };

    const out: FoodMatch[] = [];
    for (const item of parsed.slice(0, 3)) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;

      const name = typeof r.food_name === 'string' ? r.food_name.trim().slice(0, 80) : '';
      const calories = num(r.calories, 5000);
      const protein = num(r.protein, 500);
      const carbs = num(r.carbs, 1000);
      const fat = num(r.fat, 500);
      if (!name || calories === null || protein === null || carbs === null || fat === null) continue;

      const rawConf = Number(r.confidence);
      const confidence = Number.isFinite(rawConf)
        ? Math.min(1, Math.max(0, Number(rawConf.toFixed(2))))
        : 0.5;

      out.push({
        food_name: name,
        calories,
        protein,
        carbs,
        fat,
        serving_size: typeof r.serving_size === 'string' && r.serving_size.trim()
          ? r.serving_size.trim().slice(0, 40)
          : 'estimated portion',
        confidence,
      });
    }
    return out;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    // Auth gate — require a valid Supabase JWT. The client calls this via
    // supabase.functions.invoke(), which attaches the user's token automatically.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Unauthorized', 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    // Per-user burst limit — vision is expensive; 5/min is generous for a camera flow.
    if (!checkRateLimit(user.id, 'analyze-food-photo', 5, 60_000)) {
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    // Entitlement: featureGates food_scan = 'pro'. Gated before req.json() so an
    // unentitled caller cannot make us buffer a multi-MB upload.
    const denied = await requireTier(supabase, user.id, 'pro', 'food_scan');
    if (denied) return denied;

    // Quota after the tier gate, and before the body is parsed: decoding a
    // multi-MB base64 image IS the expensive operation here, so metering has to
    // precede it (see the ordering note in _shared/quota.ts).
    const overQuota = await requireQuota(supabase, user.id, 'food_scan', DAILY_QUOTA.food_scan);
    if (overQuota) return overQuota;

    const body = await req.json() as { image_base64?: string };

    if (!body.image_base64) {
      return errorResponse('image_base64 is required', 400);
    }
    if (body.image_base64.length > MAX_IMAGE_BASE64_LEN) {
      return errorResponse('Image too large. Please retake the photo and try again.', 413);
    }

    const raw = await callClaudeVision(
      SYSTEM_PROMPT,
      [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: body.image_base64 },
        },
        { type: 'text', text: 'Identify the food in this photo and estimate its nutrition.' },
      ],
      700,
      VISION_MODEL_CHEAP,
    );

    const matches = parseMatches(raw);

    // Unparseable reply. The previous implementation could not fail, which is
    // precisely why its wrong answers were invisible.
    if (matches === null) {
      return errorResponse('Could not read that photo. Please retake it and try again.', 502);
    }

    // Genuinely nothing edible in frame — a real answer, not an error.
    if (matches.length === 0) {
      return jsonResponse({
        matches: [],
        analyzed_at: new Date().toISOString(),
        model: VISION_MODEL_CHEAP,
        note: 'No food detected in this photo.',
      });
    }

    return jsonResponse({
      matches,
      analyzed_at: new Date().toISOString(),
      model: VISION_MODEL_CHEAP,
      note: 'Estimated from the photo. Portions are approximate — adjust before logging.',
    });
  } catch {
    return internalError();
  }
});
