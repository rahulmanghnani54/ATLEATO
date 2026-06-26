/**
 * Fetches a short-lived ElevenLabs Conversational-AI WebRTC token from our
 * Supabase edge function (which holds the API key server-side). The token is
 * passed to the @elevenlabs/react-native conversation to start a live voice
 * call with the coach agent — the API key never touches the app.
 */
import { supabase } from '@/lib/supabase';

export async function getCoachCallToken(): Promise<string> {
  // Don't hang forever if the edge function / network stalls.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timed out fetching call token')), 15000),
  );
  const { data, error } = await Promise.race([
    supabase.functions.invoke('elevenlabs-signed-url', { body: {} }),
    timeout,
  ]) as { data: any; error: any };
  if (error) {
    // Surface the real reason (HTTP status / edge body) for diagnosis.
    let detail = error.message || 'request failed';
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.status === 'number') {
        detail = `HTTP ${ctx.status}`;
        try { const b = await ctx.clone().json(); if (b?.error) detail += ` — ${b.error}`; } catch { /* */ }
      }
    } catch { /* */ }
    throw new Error(detail);
  }
  if (!data?.conversationToken) throw new Error('No conversation token returned');
  return data.conversationToken as string;
}
