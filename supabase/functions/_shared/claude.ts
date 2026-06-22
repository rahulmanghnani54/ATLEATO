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
    const err = new Error(`Claude API error ${response.status}`);
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
