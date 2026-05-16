import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  callClaude, corsHeaders, jsonResponse, errorResponse, internalError,
  SUPABASE_URL, SUPABASE_ANON_KEY,
} from '../_shared/claude.ts';
import { checkRateLimit, isValidUUID } from '../_shared/security.ts';

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

    if (!checkRateLimit(user.id, 'analyze-workout', 10, 60_000)) {
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    const body = await req.json() as { workoutLogId?: unknown };
    if (!isValidUUID(body.workoutLogId)) return errorResponse('Invalid workoutLogId', 400);

    const { data: workoutLog } = await supabase
      .from('workout_logs')
      .select('*, exercise_sets(*)')
      .eq('id', body.workoutLogId)
      .eq('user_id', user.id)  // explicit ownership check beyond RLS
      .single();

    if (!workoutLog) return errorResponse('Workout not found', 404);

    const setsText = (workoutLog.exercise_sets as any[])
      .filter((s) => !s.is_warmup)
      .slice(0, 50) // cap rows to prevent prompt bloat
      .map((s) => `${s.exercise_name}: Set ${s.set_number} — ${s.weight_kg}kg × ${s.reps} reps (RPE ${s.rpe ?? '?'})`)
      .join('\n');

    const prompt = `You are a strength coach analysing a completed workout session.

Workout: ${workoutLog.workout_name}
Duration: ${workoutLog.duration_minutes} minutes
Total Volume: ${workoutLog.total_volume_kg?.toFixed(1)}kg
Average RPE: ${workoutLog.average_rpe?.toFixed(1) ?? 'not recorded'}

Sets completed:
${setsText}

Provide a concise (3-5 bullet points) post-workout analysis covering:
1. Overall performance assessment
2. Notable strengths or PRs
3. Areas to focus on next session
4. Recovery recommendation

Be specific and actionable. Use the actual numbers.`;

    const analysis = await callClaude(
      'You are an expert strength and conditioning coach providing post-workout feedback.',
      [{ role: 'user', content: prompt }],
      600,
    );

    return jsonResponse({ analysis, workoutLogId: body.workoutLogId });
  } catch {
    return internalError();
  }
});
