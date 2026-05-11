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

    const { workoutLogId } = await req.json() as { workoutLogId: string };
    if (!workoutLogId) return errorResponse('workoutLogId required', 400);

    // Fetch workout + sets
    const { data: workoutLog } = await supabase
      .from('workout_logs')
      .select('*, exercise_sets(*)')
      .eq('id', workoutLogId)
      .eq('user_id', user.id)
      .single();

    if (!workoutLog) return errorResponse('Workout not found', 404);

    const setsText = (workoutLog.exercise_sets as any[])
      .filter((s) => !s.is_warmup)
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

    return jsonResponse({ analysis, workoutLogId });
  } catch (err) {
    console.error('[analyze-workout]', err);
    return errorResponse((err as Error).message);
  }
});
