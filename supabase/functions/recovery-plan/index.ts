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

    if (!checkRateLimit(user.id, 'recovery-plan', 5, 60_000)) {
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: checkins } = await supabase
      .from('recovery_checkins')
      .select('recovery_score, sleep_hours, stress, soreness')
      .eq('user_id', user.id)
      .gte('date', sevenDaysAgo)
      .order('date', { ascending: false })
      .limit(7); // at most one per day

    if (!checkins || checkins.length === 0) {
      return jsonResponse({
        plan: 'Complete your morning check-ins for 3+ days to receive a personalised recovery plan.',
      });
    }

    const n = checkins.length;
    const avgScore    = checkins.reduce((s: number, c: any) => s + c.recovery_score, 0) / n;
    const avgSleep    = checkins.reduce((s: number, c: any) => s + c.sleep_hours,    0) / n;
    const avgStress   = checkins.reduce((s: number, c: any) => s + c.stress,         0) / n;
    const avgSoreness = checkins.reduce((s: number, c: any) => s + c.soreness,       0) / n;

    const prompt = `Athlete recovery data (last 7 days):
Average recovery score: ${avgScore.toFixed(1)}/100
Average sleep: ${avgSleep.toFixed(1)} hours
Average stress: ${avgStress.toFixed(1)}/5
Average soreness: ${avgSoreness.toFixed(1)}/5
Check-ins logged: ${n}/7

Provide a personalised 3-day recovery optimisation plan covering:
1. Sleep hygiene recommendations
2. Stress management strategies
3. Active recovery activities
4. Nutrition for recovery

Be specific and practical. Under 200 words.`;

    const plan = await callClaude(
      'You are a sports scientist and recovery specialist helping athletes optimise rest and regeneration.',
      [{ role: 'user', content: prompt }],
      600,
    );

    return jsonResponse({ plan, stats: { avgScore, avgSleep, avgStress, avgSoreness, daysLogged: n } });
  } catch {
    return internalError();
  }
});
