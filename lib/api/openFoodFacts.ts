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
    servingSizeG: Number(p.serving_quantity ?? 100),
  };
}

export async function searchFood(query: string): Promise<FoodItem[]> {
  if (!query.trim()) return [];
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query.trim())}&search_simple=1&action=process&json=1&page_size=20&fields=id,code,product_name,brands,nutriments,serving_quantity`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Food search failed');
  const data = await res.json();
  return (data.products ?? [])
    .filter((p: any) => p.nutriments && p.product_name)
    .map(mapProduct);
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
