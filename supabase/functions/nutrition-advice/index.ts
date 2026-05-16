import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  callClaude, corsHeaders, jsonResponse, errorResponse, internalError,
  SUPABASE_URL, SUPABASE_ANON_KEY,
} from '../_shared/claude.ts';
import { checkRateLimit, isValidDate } from '../_shared/security.ts';

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

    if (!checkRateLimit(user.id, 'nutrition-advice', 10, 60_000)) {
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    const body = await req.json() as { date?: unknown };
    const today = new Date().toISOString().slice(0, 10);
    const targetDate = isValidDate(body.date) ? body.date : today;

    const [{ data: profile }, { data: logs }] = await Promise.all([
      supabase.from('profiles')
        .select('goal, tdee, protein_g, carbs_g, fat_g')
        .eq('id', user.id)
        .single(),
      supabase.from('nutrition_logs')
        .select('calories, protein_g, carbs_g, fat_g, food_name, meal_type')
        .eq('user_id', user.id)
        .eq('date', targetDate)
        .limit(100),
    ]);

    if (!profile) return errorResponse('Profile not found', 404);

    const totalCalories = (logs ?? []).reduce((sum: number, l: any) => sum + l.calories, 0);
    const totalProtein  = (logs ?? []).reduce((sum: number, l: any) => sum + l.protein_g, 0);
    const totalCarbs    = (logs ?? []).reduce((sum: number, l: any) => sum + l.carbs_g, 0);
    const totalFat      = (logs ?? []).reduce((sum: number, l: any) => sum + l.fat_g, 0);

    const prompt = `User nutrition data for ${targetDate}:

Goal: ${profile.goal} | TDEE: ${Number(profile.tdee)} kcal
Targets: ${Number(profile.protein_g)}g protein / ${Number(profile.carbs_g)}g carbs / ${Number(profile.fat_g)}g fat

Logged today:
- Calories: ${Math.round(totalCalories)} / ${profile.tdee} (${Math.round(totalCalories / (profile.tdee || 1) * 100)}%)
- Protein: ${Math.round(totalProtein)}g / ${profile.protein_g}g
- Carbs: ${Math.round(totalCarbs)}g / ${profile.carbs_g}g
- Fat: ${Math.round(totalFat)}g / ${profile.fat_g}g

Give 3-4 specific, practical nutrition tips for the rest of this day based on the gaps. Be concise.`;

    const advice = await callClaude(
      'You are a registered dietitian and sports nutritionist helping athletes optimise their diet.',
      [{ role: 'user', content: prompt }],
      500,
    );

    return jsonResponse({
      advice,
      date: targetDate,
      totals: { totalCalories, totalProtein, totalCarbs, totalFat },
    });
  } catch {
    return internalError();
  }
});
