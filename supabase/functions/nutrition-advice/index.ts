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

    const { date } = await req.json() as { date: string };
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    // Fetch profile + today's nutrition
    const [{ data: profile }, { data: logs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('nutrition_logs').select('*').eq('user_id', user.id).eq('date', targetDate),
    ]);

    if (!profile) return errorResponse('Profile not found', 404);

    const totalCalories = (logs ?? []).reduce((sum: number, l: any) => sum + l.calories, 0);
    const totalProtein = (logs ?? []).reduce((sum: number, l: any) => sum + l.protein_g, 0);
    const totalCarbs = (logs ?? []).reduce((sum: number, l: any) => sum + l.carbs_g, 0);
    const totalFat = (logs ?? []).reduce((sum: number, l: any) => sum + l.fat_g, 0);

    const prompt = `User nutrition data for ${targetDate}:

Goal: ${profile.goal} | TDEE: ${profile.tdee} kcal
Targets: ${profile.protein_g}g protein / ${profile.carbs_g}g carbs / ${profile.fat_g}g fat

Logged today:
- Calories: ${Math.round(totalCalories)} / ${profile.tdee} (${Math.round(totalCalories / profile.tdee * 100)}%)
- Protein: ${Math.round(totalProtein)}g / ${profile.protein_g}g
- Carbs: ${Math.round(totalCarbs)}g / ${profile.carbs_g}g
- Fat: ${Math.round(totalFat)}g / ${profile.fat_g}g

Foods logged: ${(logs ?? []).map((l: any) => `${l.food_name} (${l.meal_type})`).join(', ') || 'None'}

Give 3-4 specific, practical nutrition tips for the rest of this day based on the gaps. Be concise.`;

    const advice = await callClaude(
      'You are a registered dietitian and sports nutritionist helping athletes optimise their diet.',
      [{ role: 'user', content: prompt }],
      500,
    );

    return jsonResponse({ advice, date: targetDate, totals: { totalCalories, totalProtein, totalCarbs, totalFat } });
  } catch (err) {
    console.error('[nutrition-advice]', err);
    return errorResponse((err as Error).message);
  }
});
