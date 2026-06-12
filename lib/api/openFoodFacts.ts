import { searchIndianFoods } from '@/lib/indianFoods';
import { searchGlobalFoods } from '@/lib/globalFoodsDB';
import { searchUsdaFoods } from '@/lib/api/usda';
import { searchCustomFoods } from '@/lib/customFoods';

const BASE = 'https://world.openfoodfacts.org';

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  calories100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  fiber100g?: number;
  servingSizeG: number;
}

function mapProduct(p: any): FoodItem {
  return {
    id: p.id ?? p.code ?? '',
    name: p.product_name?.trim() || 'Unknown',
    brand: p.brands?.trim() || undefined,
    barcode: p.code || undefined,
    calories100g: Number(p.nutriments?.['energy-kcal_100g'] ?? 0),
    protein100g: Number(p.nutriments?.proteins_100g ?? 0),
    carbs100g: Number(p.nutriments?.carbohydrates_100g ?? 0),
    fat100g: Number(p.nutriments?.fat_100g ?? 0),
    fiber100g: p.nutriments?.fiber_100g != null ? Number(p.nutriments.fiber_100g) : undefined,
    servingSizeG: parseFloat(p.serving_quantity ?? '') || 100,
  };
}

/**
 * Aggregated food search across FIVE sources, in priority order:
 *   1. Custom foods (user's own, AsyncStorage) — always wins
 *   2. Indian dishes (local, instant)
 *   3. Global dishes (local, instant) — 240+ dishes across 12 cuisines + whole foods
 *   4. USDA FoodData Central (network) — 500K+ foods, prepared dishes + whole foods
 *   5. OpenFoodFacts (network) — 1.2M+ packaged products globally
 *
 * Local sources render instantly; network sources fire in parallel.
 * Any source can fail silently — degrades gracefully.
 */
export async function searchFood(query: string): Promise<FoodItem[]> {
  if (!query.trim()) return [];

  // Kick off ALL sources in parallel — local + network simultaneously.
  // Previously local ran first then awaited before kicking network → wasted RTT.
  const [
    customResults,
    indianResults,
    globalResults,
    usdaResults,
    offResults,
  ] = await Promise.all([
    searchCustomFoods(query),
    Promise.resolve(searchIndianFoods(query)),
    Promise.resolve(searchGlobalFoods(query)),
    searchUsdaFoods(query),
    searchOpenFoodFacts(query),
  ]);

  // Merge: Custom → Indian → Global → USDA → OFF (deduped by id)
  const seen = new Set<string>();
  const merged: FoodItem[] = [];
  for (const src of [customResults, indianResults, globalResults, usdaResults, offResults]) {
    for (const f of src) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      merged.push(f);
    }
  }
  return merged;
}

/** Just the OpenFoodFacts search — extracted so the aggregator above stays clean. */
async function searchOpenFoodFacts(query: string): Promise<FoodItem[]> {
  try {
    const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query.trim())}&search_simple=1&action=process&json=1&page_size=20&fields=id,code,product_name,brands,nutriments,serving_quantity`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products ?? [])
      .filter((p: any) => p.nutriments && p.product_name && Number(p.nutriments['energy-kcal_100g']) > 0)
      .map(mapProduct);
  } catch {
    return [];
  }
}

export async function getFoodByBarcode(barcode: string): Promise<FoodItem | null> {
  const url = `${BASE}/api/v0/product/${barcode}.json?fields=id,code,product_name,brands,nutriments,serving_quantity`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product?.nutriments) return null;
  return mapProduct(data.product);
}

export function calculateMacrosForServing(food: FoodItem, servingG: number) {
  const factor = servingG / 100;
  return {
    calories: Math.round(food.calories100g * factor),
    proteinG: Math.round(food.protein100g * factor * 10) / 10,
    carbsG: Math.round(food.carbs100g * factor * 10) / 10,
    fatG: Math.round(food.fat100g * factor * 10) / 10,
  };
}
