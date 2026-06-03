import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse, errorResponse, internalError } from '../_shared/claude.ts';

// ---------------------------------------------------------------------------
// MVP food recognition — returns realistic mock macro data.
// In production this would forward the base64 image to a vision model.
// ---------------------------------------------------------------------------

interface FoodMatch {
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: string;
  confidence: number;
}

// Curated list of common foods with realistic macros per serving
const FOOD_DATABASE: FoodMatch[] = [
  // High-protein mains
  { food_name: 'Grilled Chicken Breast', calories: 284, protein: 53, carbs: 0, fat: 6, serving_size: '170g', confidence: 0 },
  { food_name: 'Scrambled Eggs (3 large)', calories: 234, protein: 18, carbs: 2, fat: 17, serving_size: '3 eggs', confidence: 0 },
  { food_name: 'Salmon Fillet', calories: 310, protein: 44, carbs: 0, fat: 14, serving_size: '170g', confidence: 0 },
  { food_name: 'Beef Steak (sirloin)', calories: 358, protein: 48, carbs: 0, fat: 18, serving_size: '170g', confidence: 0 },
  { food_name: 'Paneer Tikka', calories: 290, protein: 20, carbs: 8, fat: 19, serving_size: '150g', confidence: 0 },
  // Carb-heavy meals
  { food_name: 'White Rice (cooked)', calories: 242, protein: 4, carbs: 53, fat: 0, serving_size: '180g', confidence: 0 },
  { food_name: 'Dal Makhani', calories: 310, protein: 12, carbs: 38, fat: 12, serving_size: '200g', confidence: 0 },
  { food_name: 'Pasta (cooked, marinara)', calories: 385, protein: 14, carbs: 67, fat: 8, serving_size: '250g', confidence: 0 },
  { food_name: 'Oatmeal (with milk)', calories: 280, protein: 10, carbs: 46, fat: 7, serving_size: '300ml bowl', confidence: 0 },
  { food_name: 'Roti / Chapati (2)', calories: 212, protein: 6, carbs: 40, fat: 4, serving_size: '2 rotis', confidence: 0 },
  // Mixed meals
  { food_name: 'Chicken Biryani', calories: 490, protein: 28, carbs: 58, fat: 14, serving_size: '300g', confidence: 0 },
  { food_name: 'Burger (beef, standard)', calories: 540, protein: 30, carbs: 44, fat: 25, serving_size: '1 burger', confidence: 0 },
  { food_name: 'Caesar Salad (with chicken)', calories: 360, protein: 28, carbs: 14, fat: 22, serving_size: '250g', confidence: 0 },
  { food_name: 'Greek Yogurt Bowl', calories: 220, protein: 18, carbs: 24, fat: 6, serving_size: '200g', confidence: 0 },
  { food_name: 'Protein Shake (whey, milk)', calories: 310, protein: 40, carbs: 22, fat: 6, serving_size: '400ml', confidence: 0 },
  // Snacks / small items
  { food_name: 'Banana', calories: 105, protein: 1, carbs: 27, fat: 0, serving_size: '1 medium', confidence: 0 },
  { food_name: 'Almonds (handful)', calories: 164, protein: 6, carbs: 6, fat: 14, serving_size: '28g', confidence: 0 },
  { food_name: 'Avocado Toast', calories: 290, protein: 8, carbs: 32, fat: 16, serving_size: '1 slice', confidence: 0 },
  { food_name: 'Pizza Slice (cheese)', calories: 272, protein: 12, carbs: 34, fat: 10, serving_size: '1 slice', confidence: 0 },
  { food_name: 'Masala Omelette (2 eggs)', calories: 198, protein: 14, carbs: 4, fat: 14, serving_size: '2 eggs', confidence: 0 },
];

/** Pick 3 random but distinct foods and assign descending confidence scores */
function pickMatches(): FoodMatch[] {
  const shuffled = [...FOOD_DATABASE].sort(() => Math.random() - 0.5);
  const top3 = shuffled.slice(0, 3);
  // Assign realistic confidence: first is most confident
  const confidences = [
    parseFloat((0.72 + Math.random() * 0.20).toFixed(2)),  // 0.72–0.92
    parseFloat((0.45 + Math.random() * 0.22).toFixed(2)),  // 0.45–0.67
    parseFloat((0.20 + Math.random() * 0.22).toFixed(2)),  // 0.20–0.42
  ];
  return top3.map((food, i) => ({ ...food, confidence: confidences[i] }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    // In a real implementation we would:
    // 1. Parse the Authorization header and validate the JWT
    // 2. Decode the base64 image from the body
    // 3. Send the image to a vision model (e.g. Claude claude-sonnet-4-5 with vision)
    // 4. Parse the model's structured response
    //
    // For MVP we return a deterministic-looking but randomised response so the
    // UI flow is fully exercised end-to-end without requiring a vision model key.

    const body = await req.json() as { image_base64?: string };

    if (!body.image_base64) {
      return errorResponse('image_base64 is required', 400);
    }

    // Simulate ~600ms analysis latency
    await new Promise((resolve) => setTimeout(resolve, 600));

    const matches = pickMatches();

    return jsonResponse({
      matches,
      analyzed_at: new Date().toISOString(),
      model: 'food-vision-mvp-v1',
      note: 'MVP heuristic estimation — accuracy improves with vision model integration',
    });
  } catch {
    return internalError();
  }
});
