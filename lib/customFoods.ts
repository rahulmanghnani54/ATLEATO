/**
 * Custom Foods Store
 *
 * Lets the user add their own foods (home recipes, local dishes, anything not
 * in our public databases). Persisted to AsyncStorage under a single JSON key.
 * An in-memory cache makes search synchronous after the first load.
 *
 * The aggregator in `openFoodFacts.ts` searches custom foods FIRST so the
 * user's own foods always appear at the top of results.
 *
 * Each custom food gets a deterministic id (`custom-<timestamp>`) and the
 * `brand` field set to "MY FOOD" so it can be visually distinguished in the
 * results list.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FoodItem } from './api/openFoodFacts';

const STORAGE_KEY = 'custom_foods:v1';

// In-memory cache + load promise so subsequent search calls are sync-fast.
let cache: FoodItem[] = [];
let loadPromise: Promise<void> | null = null;

/** Load custom foods from AsyncStorage into memory exactly once. */
async function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) cache = parsed as FoodItem[];
      }
    } catch {
      // corrupted storage — start fresh
      cache = [];
    }
  })();
  return loadPromise;
}

/** Persist current cache to AsyncStorage. */
async function flush(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage full — silently fail; in-memory cache still works for this session
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomFoodInput {
  name: string;
  calories100g: number;
  protein100g: number;
  carbs100g:   number;
  fat100g:     number;
  fiber100g?:  number;
  servingSizeG?: number;
}

/**
 * Add a new custom food. Returns the saved FoodItem with its assigned id.
 * Duplicate name+macros sets are de-duped — same input twice = single entry.
 */
export async function addCustomFood(input: CustomFoodInput): Promise<FoodItem> {
  await ensureLoaded();
  const food: FoodItem = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim(),
    brand: 'MY FOOD',
    calories100g: Math.max(0, Math.round(input.calories100g)),
    protein100g:  Math.max(0, Math.round(input.protein100g * 10) / 10),
    carbs100g:    Math.max(0, Math.round(input.carbs100g * 10) / 10),
    fat100g:      Math.max(0, Math.round(input.fat100g * 10) / 10),
    fiber100g:    input.fiber100g != null ? Math.max(0, Math.round(input.fiber100g * 10) / 10) : undefined,
    servingSizeG: input.servingSizeG && input.servingSizeG > 0 ? input.servingSizeG : 100,
  };

  // De-dup: same normalized name + same macros = skip
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const existing = cache.find(
    (f) =>
      norm(f.name) === norm(food.name) &&
      f.calories100g === food.calories100g &&
      f.protein100g  === food.protein100g &&
      f.carbs100g    === food.carbs100g &&
      f.fat100g      === food.fat100g,
  );
  if (existing) return existing;

  cache.unshift(food); // newest first
  await flush();
  return food;
}

/** Delete a custom food by id. Returns true if it existed. */
export async function deleteCustomFood(id: string): Promise<boolean> {
  await ensureLoaded();
  const before = cache.length;
  cache = cache.filter((f) => f.id !== id);
  if (cache.length === before) return false;
  await flush();
  return true;
}

/** Return all custom foods (newest first). */
export async function getAllCustomFoods(): Promise<FoodItem[]> {
  await ensureLoaded();
  return [...cache];
}

/**
 * Fuzzy search across the user's custom foods.
 * Same matching rules as the global DB: multi-word, partial-match, scored.
 */
export async function searchCustomFoods(query: string): Promise<FoodItem[]> {
  await ensureLoaded();
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  const scored: { food: FoodItem; score: number }[] = [];
  for (const food of cache) {
    const name = food.name.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (name.includes(term)) {
        score += 10;
        if (name.startsWith(term) || name.includes(` ${term}`)) score += 5;
      } else {
        score = 0;
        break;
      }
    }
    if (score > 0) scored.push({ food, score });
  }
  scored.sort((a, b) => (b.score - a.score) || a.food.name.localeCompare(b.food.name));
  return scored.map((s) => s.food);
}
