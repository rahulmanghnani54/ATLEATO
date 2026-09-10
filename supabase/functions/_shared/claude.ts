export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

// Validate required env vars at cold-start, not lazily at request time.
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY env var is required');
if (!SUPABASE_URL)      throw new Error('SUPABASE_URL env var is required');
if (!SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY env var is required');

export { SUPABASE_URL, SUPABASE_ANON_KEY };

export async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  maxTokens = 1024,
): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system: systemPrompt, messages }),
  });

  if (!response.ok) {
    // Capture Anthropic's error body for SERVER-SIDE logging only (it names the
    // real cause: invalid key, model not found, credit balance too low, etc.).
    // The Error MESSAGE carries only the status (safe to surface to the client);
    // the body is stashed on a property the client response never includes.
    let bodyText = '';
    try { bodyText = await response.text(); } catch { /* ignore */ }
    // Log the real cause HERE, not at the call site. Only 1 of the 9 functions
    // that call this ever logged err.anthropicBody, so the single most likely
    // production failure — "credit balance is too low" — was invisible in the
    // other 8 and surfaced to the user as a bare "internal error". That is how
    // an empty balance turns into days of "the AI is broken" with no diagnosis.
    // Anthropic error bodies carry no user data, so this is safe to log.
    console.error(`[claude] API error ${response.status}:`, bodyText.slice(0, 500));

    const err = new Error(`Claude API error ${response.status}`);
    (err as any).status = response.status;
    (err as any).anthropicBody = bodyText;
    throw err;
  }

  const data: ClaudeResponse = await response.json();
  return data.content.find((c) => c.type === 'text')?.text ?? '';
}

/**
 * Vision call. Same transport as callClaude, but the user turn is a content
 * ARRAY (image blocks + text) rather than a string.
 *
 * Lives here rather than in one function because two endpoints need it:
 * analyze-physique (Sonnet, scoring a body) and analyze-food-photo (Haiku,
 * identifying a meal). The model is a parameter because those two differ by
 * roughly 3x in price and only one of them needs the stronger model.
 *
 * Errors are logged with their body for the same reason as callClaude: an
 * empty credit balance is the most likely production failure and it must not
 * reach the user as a bare "internal error".
 */
export const VISION_MODEL_STRONG = 'claude-sonnet-4-5-20251001';
export const VISION_MODEL_CHEAP = CLAUDE_MODEL;

export async function callClaudeVision(
  systemPrompt: string,
  userContent: unknown[],
  maxTokens = 1024,
  model: string = VISION_MODEL_STRONG,
): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    let bodyText = '';
    try { bodyText = await response.text(); } catch { /* ignore */ }
    console.error(`[claude:vision] API error ${response.status}:`, bodyText.slice(0, 500));
    const err = new Error(`Claude Vision API error ${response.status}`);
    (err as any).status = response.status;
    (err as any).anthropicBody = bodyText;
    throw err;
  }

  const data: ClaudeResponse = await response.json();
  return data.content.find((c) => c.type === 'text')?.text ?? '';
}

export function corsHeaders() {
  return {
    // Wildcard origin is required for the Supabase JS client from native mobile and
    // web. Real access control is enforced by JWT on every request — not by CORS.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
  };
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

export function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), { status, headers: corsHeaders() });
}

// Use this in catch blocks so internal details never reach the client.
export function internalError() {
  return errorResponse('An internal error occurred. Please try again.', 500);
}
