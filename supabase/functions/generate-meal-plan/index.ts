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

    const { preferences = '', mealsPerDay = 4 } = await req.json() as {
      preferences?: string;
      mealsPerDay?: number;
    };

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) return errorResponse('Profile not found', 404);

    const prompt = `Create a one-day meal plan for an athlete with these targets:

Goal: ${profile.goal}
TDEE: ${profile.tdee} kcal
Protein target: ${profile.protein_g}g
Carbs target: ${profile.carbs_g}g
Fat target: ${profile.fat_g}g
Meals per day: ${mealsPerDay}
Preferences/restrictions: ${preferences || 'None specified'}

Format the response as a structured meal plan with:
- Meal name (Breakfast/Lunch/Dinner/Snack)
- 2-3 food items with approximate portions
- Per-meal macro summary (calories, protein, carbs, fat)
- Daily total at the bottom

Keep foods practical, affordable, and high-protein for the goal. Be specific with portions.`;

    const mealPlan = await callClaude(
      'You are a sports nutritionist creating practical, macro-optimised meal plans for athletes.',
      [{ role: 'user', content: prompt }],
      1000,
    );

    return jsonResponse({ mealPlan, targets: { calories: profile.tdee, protein: profile.protein_g, carbs: profile.carbs_g, fat: profile.fat_g } });
  } catch (err) {
    console.error('[generate-meal-plan]', err);
    return errorResponse((err as Error).message);
  }
});
