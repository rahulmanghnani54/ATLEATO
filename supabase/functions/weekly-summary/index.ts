import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  callClaude, corsHeaders, jsonResponse, errorResponse, internalError,
  SUPABASE_URL, SUPABASE_ANON_KEY,
} from '../_shared/claude.ts';
import { checkRateLimit } from '../_shared/security.ts';

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

    if (!checkRateLimit(user.id, 'weekly-summary', 3, 60_000)) {
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [{ data: workouts }, { data: nutrition }, { data: recovery }, { data: profile }] =
      await Promise.all([
        supabase.from('workout_logs')
          .select('workout_name, duration_minutes, total_volume_kg, average_rpe')
          .eq('user_id', user.id)
          .gte('date', weekAgo)
          .limit(14),
        supabase.from('nutrition_logs')
          .select('calories, protein_g, date')
          .eq('user_id', user.id)
          .gte('date', weekAgo)
          .limit(200),
        supabase.from('recovery_checkins')
          .select('recovery_score, sleep_hours')
          .eq('user_id', user.id)
          .gte('date', weekAgo)
          .limit(7),
        supabase.from('profiles')
          .select('goal, tdee, protein_g')
          .eq('id', user.id)
          .single(),
      ]);

    const workoutCount = workouts?.length ?? 0;
    const totalVolume  = (workouts ?? []).reduce((s: number, w: any) => s + (w.total_volume_kg ?? 0), 0);
    const avgRpe = workoutCount > 0
      ? (workouts ?? []).reduce((s: number, w: any) => s + (w.average_rpe ?? 7), 0) / workoutCount
      : 0;

    const nutritionDays = [...new Set((nutrition ?? []).map((n: any) => n.date))].length;
    const avgCalories = nutritionDays > 0
      ? (nutrition ?? []).reduce((s: number, n: any) => s + n.calories, 0) / nutritionDays
      : 0;
    const avgProtein = nutritionDays > 0
      ? (nutrition ?? []).reduce((s: number, n: any) => s + n.protein_g, 0) / nutritionDays
      : 0;

    const avgRecovery = (recovery ?? []).length > 0
      ? (recovery ?? []).reduce((s: number, r: any) => s + r.recovery_score, 0) / recovery!.length
      : 0;
    const avgSleep = (recovery ?? []).length > 0
      ? (recovery ?? []).reduce((s: number, r: any) => s + r.sleep_hours, 0) / recovery!.length
      : 0;

    const prompt = `Weekly fitness summary for an athlete (goal: ${profile?.goal}):

TRAINING:
- Workouts completed: ${workoutCount}/7
- Total volume lifted: ${totalVolume.toFixed(0)}kg
- Average RPE: ${avgRpe.toFixed(1)}

NUTRITION (${nutritionDays} days logged):
- Average calories: ${Math.round(avgCalories)} / ${profile?.tdee} target
- Average protein: ${Math.round(avgProtein)}g / ${profile?.protein_g}g target

RECOVERY (${recovery?.length ?? 0} check-ins):
- Average recovery score: ${avgRecovery.toFixed(0)}/100
- Average sleep: ${avgSleep.toFixed(1)} hours

Write a motivating but honest weekly debrief (4-5 sentences) that:
1. Celebrates wins
2. Identifies the biggest opportunity for next week
3. Sets one specific focus for the coming week
Be personal, specific, and action-oriented.`;

    const summary = await callClaude(
      'You are a world-class strength and conditioning coach providing weekly athlete reviews.',
      [{ role: 'user', content: prompt }],
      500,
    );

    return jsonResponse({
      summary,
      stats: { workoutCount, totalVolume, avgCalories, avgProtein, avgRecovery, avgSleep, nutritionDays },
    });
  } catch {
    return internalError();
  }
});
