import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callClaude, corsHeaders, jsonResponse, errorResponse } from '../_shared/claude.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Unauthorized', 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { exerciseName, detectedIssues, poseData } = await req.json() as {
      exerciseName: string;
      detectedIssues: string[];
      poseData?: Record<string, number>;
    };

    if (!exerciseName) return errorResponse('exerciseName required', 400);

    const issuesSummary = detectedIssues.length > 0
      ? `Detected issues:\n${detectedIssues.map((i) => `- ${i}`).join('\n')}`
      : 'No specific issues detected.';

    const prompt = `Exercise: ${exerciseName}

${issuesSummary}

Provide detailed, cue-based form coaching for this exercise. Include:
1. The single most important correction if there are issues (or a key reinforcement if form is good)
2. Two specific coaching cues to improve technique
3. A safety reminder

Keep it under 150 words. Use second-person ("you", "your"). Be direct and specific.`;

    const feedback = await callClaude(
      'You are an expert personal trainer and movement specialist providing real-time form coaching.',
      [{ role: 'user', content: prompt }],
      400,
    );

    return jsonResponse({ feedback, exerciseName });
  } catch (err) {
    console.error('[form-feedback]', err);
    return errorResponse((err as Error).message);
  }
});
