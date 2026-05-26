/**
 * USDA FoodData Central — search wrapper.
 *
 * Free public API with ~500k foods including restaurant items, branded products,
 * raw whole foods, and traditional dishes that OpenFoodFacts (packaged-only)
 * tends to miss — e.g. "egg roll", "eggs benedict", "shepherd's pie".
 *
 * Auth: uses `DEMO_KEY` which works without registration but is rate-limited
 * to 30 requests/hour per IP. For production, register at
 *   https://api.data.gov/signup
 * for a free unlimited key and set EXPO_PUBLIC_USDA_API_KEY in .env.local.
 */
import { type FoodItem } from './openFoodFacts';

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY || 'DEMO_KEY';

interface UsdaFood {
  fdcId: number;
  description: string;
  brandName?: string;
  brandOwner?: string;
  foodNutrients?: { nutrientName?: string; nutrientNumber?: string; value?: number; unitName?: string }[];
  servingSize?: number;
  servingSizeUnit?: string;
  dataType?: string;
}

/** Pull a nutrient value by its USDA nutrient number. */
function nutrient(food: UsdaFood, num: string): number {
  const n = food.foodNutrients?.find((x) => x.nutrientNumber === num);
  return n?.value ?? 0;
}

function mapUsdaFood(food: UsdaFood): FoodItem | null {
  // 208 = energy (kcal), 203 = protein g, 205 = carbs g, 204 = fat g, 291 = fiber g
  const cals = nutrient(food, '208');
  if (cals <= 0) return null;
  return {
    id: `usda-${food.fdcId}`,
    name: food.description.trim(),
    brand: (food.brandName || food.brandOwner || '').trim() || undefined,
    calories100g: cals,
    protein100g: nutrient(food, '203'),
    carbs100g:   nutrient(food, '205'),
    fat100g:     nutrient(food, '204'),
    fiber100g:   nutrient(food, '291') || undefined,
    // USDA values are per-100g already (the API normalizes); serving falls back to 100g
    servingSizeG: food.servingSize && food.servingSizeUnit === 'g' ? food.servingSize : 100,
  };
}

/**
 * Search USDA for foods matching the query.
 * Pulls up to 20 results, prioritising "Survey (FNDDS)" data which covers
 * commonly-eaten prepared dishes (best for hits like "egg roll", "omelette").
 *
 * Returns an empty array on network failure or rate-limit response.
 */
export async function searchUsdaFoods(query: string): Promise<FoodItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url =
      `${BASE}/foods/search` +
      `?api_key=${API_KEY}` +
      `&query=${encodeURIComponent(q)}` +
      `&pageSize=20` +
      // Order: prepared dishes first, then branded
      `&dataType=Survey%20%28FNDDS%29,SR%20Legacy,Foundation,Branded`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!res.ok) return [];
    const data = await res.json();
    const items: FoodItem[] = (data.foods ?? [])
      .map(mapUsdaFood)
      .filter((f: FoodItem | null): f is FoodItem => f !== null);
    return items;
  } catch {
    return [];
  }
}
