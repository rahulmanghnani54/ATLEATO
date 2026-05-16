import { type FoodItem } from './api/openFoodFacts';

// Per-100g macros for common Indian foods and dishes
const raw: Omit<FoodItem, 'id' | 'barcode'>[] = [
  // ── Breads & Rice ──────────────────────────────────────────────────
  { name: 'Roti (Chapati)', calories100g: 297, protein100g: 9.2, carbs100g: 54, fat100g: 5.8, fiber100g: 3.9, servingSizeG: 40 },
  { name: 'Paratha (Plain)', calories100g: 340, protein100g: 7.8, carbs100g: 50, fat100g: 12, fiber100g: 3.1, servingSizeG: 80 },
  { name: 'Paratha (Aloo)', calories100g: 319, protein100g: 6.5, carbs100g: 53, fat100g: 9.5, fiber100g: 2.8, servingSizeG: 100 },
  { name: 'Naan', calories100g: 310, protein100g: 9, carbs100g: 57, fat100g: 5.5, fiber100g: 2.2, servingSizeG: 90 },
  { name: 'Puri', calories100g: 357, protein100g: 7, carbs100g: 47, fat100g: 16, fiber100g: 2.5, servingSizeG: 35 },
  { name: 'Bhatura', calories100g: 360, protein100g: 7.5, carbs100g: 48, fat100g: 16, fiber100g: 1.5, servingSizeG: 100 },
  { name: 'Basmati Rice (cooked)', calories100g: 130, protein100g: 2.7, carbs100g: 28, fat100g: 0.3, fiber100g: 0.4, servingSizeG: 200 },
  { name: 'Brown Rice (cooked)', calories100g: 122, protein100g: 2.6, carbs100g: 25, fat100g: 1, fiber100g: 1.8, servingSizeG: 200 },
  { name: 'Idli', calories100g: 58, protein100g: 2, carbs100g: 12, fat100g: 0.4, fiber100g: 0.9, servingSizeG: 80 },
  { name: 'Dosa (Plain)', calories100g: 168, protein100g: 3.7, carbs100g: 30, fat100g: 3.7, fiber100g: 1.2, servingSizeG: 100 },
  { name: 'Masala Dosa', calories100g: 206, protein100g: 4.5, carbs100g: 36, fat100g: 5.5, fiber100g: 2, servingSizeG: 180 },
  { name: 'Upma', calories100g: 155, protein100g: 4.2, carbs100g: 27, fat100g: 3.8, fiber100g: 1.5, servingSizeG: 200 },
  { name: 'Poha', calories100g: 130, protein100g: 2.2, carbs100g: 28, fat100g: 1, fiber100g: 1, servingSizeG: 200 },
  { name: 'Khichdi', calories100g: 131, protein100g: 5.3, carbs100g: 22, fat100g: 2.5, fiber100g: 2, servingSizeG: 250 },
  { name: 'Pulao (Veg)', calories100g: 155, protein100g: 3.5, carbs100g: 28, fat100g: 3.5, fiber100g: 1.5, servingSizeG: 200 },
  { name: 'Biryani (Chicken)', calories100g: 188, protein100g: 12, carbs100g: 22, fat100g: 6, fiber100g: 0.8, servingSizeG: 300 },
  { name: 'Biryani (Mutton)', calories100g: 202, protein100g: 13, carbs100g: 22, fat100g: 7.5, fiber100g: 0.8, servingSizeG: 300 },
  { name: 'Jeera Rice', calories100g: 150, protein100g: 3, carbs100g: 29, fat100g: 3, fiber100g: 0.5, servingSizeG: 200 },
  { name: 'Fried Rice (Veg)', calories100g: 163, protein100g: 3.5, carbs100g: 28, fat100g: 4.5, fiber100g: 1.5, servingSizeG: 200 },

  // ── Dals & Legumes ─────────────────────────────────────────────────
  { name: 'Dal Tadka', calories100g: 102, protein100g: 6, carbs100g: 14, fat100g: 2.8, fiber100g: 3.5, servingSizeG: 200 },
  { name: 'Dal Makhani', calories100g: 135, protein100g: 6.5, carbs100g: 15, fat100g: 5.5, fiber100g: 4, servingSizeG: 200 },
  { name: 'Chana Masala', calories100g: 154, protein100g: 8, carbs100g: 22, fat100g: 3.5, fiber100g: 6, servingSizeG: 200 },
  { name: 'Rajma Masala', calories100g: 143, protein100g: 7.5, carbs100g: 22, fat100g: 3, fiber100g: 5, servingSizeG: 200 },
  { name: 'Moong Dal (cooked)', calories100g: 105, protein100g: 7, carbs100g: 16, fat100g: 1, fiber100g: 4, servingSizeG: 200 },
  { name: 'Masoor Dal (cooked)', calories100g: 116, protein100g: 9, carbs100g: 18, fat100g: 0.5, fiber100g: 3.5, servingSizeG: 200 },
  { name: 'Sambar', calories100g: 48, protein100g: 2.5, carbs100g: 7, fat100g: 1, fiber100g: 2, servingSizeG: 200 },
  { name: 'Chole Bhature (per plate)', calories100g: 280, protein100g: 9, carbs100g: 42, fat100g: 8.5, fiber100g: 5, servingSizeG: 350 },
  { name: 'Pav Bhaji', calories100g: 192, protein100g: 5.5, carbs100g: 30, fat100g: 6, fiber100g: 4, servingSizeG: 300 },

  // ── Curries (Veg) ──────────────────────────────────────────────────
  { name: 'Paneer Butter Masala', calories100g: 188, protein100g: 9, carbs100g: 10, fat100g: 13, fiber100g: 1.5, servingSizeG: 200 },
  { name: 'Palak Paneer', calories100g: 149, protein100g: 8, carbs100g: 7.5, fat100g: 10, fiber100g: 2.5, servingSizeG: 200 },
  { name: 'Shahi Paneer', calories100g: 198, protein100g: 8.5, carbs100g: 9, fat100g: 15, fiber100g: 1, servingSizeG: 200 },
  { name: 'Matar Paneer', calories100g: 155, protein100g: 8, carbs100g: 10, fat100g: 10, fiber100g: 2.5, servingSizeG: 200 },
  { name: 'Paneer Tikka Masala', calories100g: 180, protein100g: 10, carbs100g: 8, fat100g: 12, fiber100g: 1.5, servingSizeG: 200 },
  { name: 'Aloo Gobi', calories100g: 97, protein100g: 2.5, carbs100g: 14, fat100g: 4, fiber100g: 3, servingSizeG: 200 },
  { name: 'Aloo Matar', calories100g: 108, protein100g: 3, carbs100g: 17, fat100g: 3.5, fiber100g: 3, servingSizeG: 200 },
  { name: 'Baingan Bharta', calories100g: 85, protein100g: 2, carbs100g: 9, fat100g: 4.5, fiber100g: 3, servingSizeG: 200 },
  { name: 'Mixed Veg Curry', calories100g: 90, protein100g: 2.5, carbs100g: 12, fat100g: 3.5, fiber100g: 3, servingSizeG: 200 },
  { name: 'Bhindi Masala', calories100g: 80, protein100g: 2, carbs100g: 9, fat100g: 4, fiber100g: 3.5, servingSizeG: 150 },
  { name: 'Methi Malai Matar', calories100g: 160, protein100g: 5, carbs100g: 12, fat100g: 10, fiber100g: 3, servingSizeG: 200 },

  // ── Curries (Non-Veg) ──────────────────────────────────────────────
  { name: 'Chicken Curry', calories100g: 165, protein100g: 18, carbs100g: 6, fat100g: 8, fiber100g: 1, servingSizeG: 250 },
  { name: 'Butter Chicken (Murgh Makhani)', calories100g: 175, protein100g: 16, carbs100g: 8, fat100g: 9.5, fiber100g: 1, servingSizeG: 250 },
  { name: 'Chicken Tikka Masala', calories100g: 160, protein100g: 16, carbs100g: 8, fat100g: 8, fiber100g: 1, servingSizeG: 250 },
  { name: 'Chicken Korma', calories100g: 188, protein100g: 15, carbs100g: 7, fat100g: 12, fiber100g: 0.8, servingSizeG: 250 },
  { name: 'Mutton Curry', calories100g: 190, protein100g: 18, carbs100g: 5, fat100g: 11, fiber100g: 0.8, servingSizeG: 250 },
  { name: 'Fish Curry', calories100g: 130, protein100g: 16, carbs100g: 5, fat100g: 5.5, fiber100g: 1, servingSizeG: 200 },
  { name: 'Prawn Masala', calories100g: 135, protein100g: 18, carbs100g: 5, fat100g: 5, fiber100g: 1, servingSizeG: 200 },
  { name: 'Egg Curry', calories100g: 145, protein100g: 10, carbs100g: 5, fat100g: 10, fiber100g: 1, servingSizeG: 200 },
  { name: 'Chicken Keema', calories100g: 200, protein100g: 22, carbs100g: 5, fat100g: 11, fiber100g: 1, servingSizeG: 200 },
  { name: 'Rogan Josh', calories100g: 196, protein100g: 17, carbs100g: 6, fat100g: 12, fiber100g: 1, servingSizeG: 250 },

  // ── Tandoor & Grilled ──────────────────────────────────────────────
  { name: 'Chicken Tikka', calories100g: 160, protein100g: 25, carbs100g: 4, fat100g: 5.5, fiber100g: 0.5, servingSizeG: 150 },
  { name: 'Seekh Kebab', calories100g: 230, protein100g: 22, carbs100g: 5, fat100g: 14, fiber100g: 0.5, servingSizeG: 100 },
  { name: 'Tandoori Chicken', calories100g: 185, protein100g: 26, carbs100g: 3, fat100g: 8, fiber100g: 0.3, servingSizeG: 200 },
  { name: 'Paneer Tikka', calories100g: 238, protein100g: 14, carbs100g: 5, fat100g: 18, fiber100g: 0.5, servingSizeG: 150 },
  { name: 'Malai Tikka', calories100g: 280, protein100g: 22, carbs100g: 4, fat100g: 20, fiber100g: 0.3, servingSizeG: 150 },

  // ── Snacks & Street Food ───────────────────────────────────────────
  { name: 'Samosa (Aloo)', calories100g: 262, protein100g: 5, carbs100g: 32, fat100g: 13, fiber100g: 2, servingSizeG: 80 },
  { name: 'Pakora (Veg)', calories100g: 312, protein100g: 7, carbs100g: 35, fat100g: 16, fiber100g: 3, servingSizeG: 100 },
  { name: 'Chaat (Papdi)', calories100g: 258, protein100g: 6, carbs100g: 36, fat100g: 10, fiber100g: 2.5, servingSizeG: 150 },
  { name: 'Pani Puri (6 pcs)', calories100g: 180, protein100g: 4, carbs100g: 28, fat100g: 6, fiber100g: 2.5, servingSizeG: 120 },
  { name: 'Bhel Puri', calories100g: 155, protein100g: 4, carbs100g: 28, fat100g: 4, fiber100g: 2, servingSizeG: 150 },
  { name: 'Dahi Vada', calories100g: 145, protein100g: 6, carbs100g: 22, fat100g: 4, fiber100g: 2, servingSizeG: 150 },
  { name: 'Vada Pav', calories100g: 289, protein100g: 7, carbs100g: 42, fat100g: 10, fiber100g: 3, servingSizeG: 180 },
  { name: 'Aloo Tikki', calories100g: 232, protein100g: 4, carbs100g: 34, fat100g: 9, fiber100g: 3, servingSizeG: 80 },
  { name: 'Kachori', calories100g: 427, protein100g: 9, carbs100g: 48, fat100g: 23, fiber100g: 3, servingSizeG: 60 },
  { name: 'Dhokla', calories100g: 160, protein100g: 5.5, carbs100g: 28, fat100g: 3, fiber100g: 1, servingSizeG: 100 },
  { name: 'Medu Vada', calories100g: 322, protein100g: 9, carbs100g: 35, fat100g: 17, fiber100g: 3, servingSizeG: 80 },
  { name: 'Paneer Kathi Roll', calories100g: 220, protein100g: 9, carbs100g: 28, fat100g: 8.5, fiber100g: 2, servingSizeG: 200 },
  { name: 'Chicken Kathi Roll', calories100g: 210, protein100g: 14, carbs100g: 25, fat100g: 7, fiber100g: 1.5, servingSizeG: 200 },

  // ── Dairy & Protein ────────────────────────────────────────────────
  { name: 'Paneer (raw)', calories100g: 265, protein100g: 18, carbs100g: 2, fat100g: 21, fiber100g: 0, servingSizeG: 100 },
  { name: 'Dahi (Curd, full fat)', calories100g: 98, protein100g: 3.5, carbs100g: 6, fat100g: 6, fiber100g: 0, servingSizeG: 150 },
  { name: 'Dahi (Low fat)', calories100g: 63, protein100g: 5, carbs100g: 7, fat100g: 1.5, fiber100g: 0, servingSizeG: 150 },
  { name: 'Lassi (Sweet)', calories100g: 105, protein100g: 3.5, carbs100g: 14, fat100g: 4, fiber100g: 0, servingSizeG: 300 },
  { name: 'Raita (Cucumber)', calories100g: 50, protein100g: 2, carbs100g: 5, fat100g: 2, fiber100g: 0.5, servingSizeG: 150 },
  { name: 'Chaas (Buttermilk)', calories100g: 30, protein100g: 1.5, carbs100g: 3, fat100g: 1, fiber100g: 0, servingSizeG: 250 },
  { name: 'Ghee', calories100g: 900, protein100g: 0.2, carbs100g: 0, fat100g: 99.5, fiber100g: 0, servingSizeG: 10 },
  { name: 'Boiled Egg', calories100g: 155, protein100g: 13, carbs100g: 1.1, fat100g: 11, fiber100g: 0, servingSizeG: 60 },

  // ── Desserts ───────────────────────────────────────────────────────
  { name: 'Gulab Jamun (2 pcs)', calories100g: 380, protein100g: 6, carbs100g: 60, fat100g: 13, fiber100g: 0.5, servingSizeG: 100 },
  { name: 'Rasgulla', calories100g: 186, protein100g: 4.5, carbs100g: 39, fat100g: 1.5, fiber100g: 0, servingSizeG: 100 },
  { name: 'Kheer', calories100g: 122, protein100g: 3.5, carbs100g: 20, fat100g: 3.5, fiber100g: 0.2, servingSizeG: 200 },
  { name: 'Halwa (Suji)', calories100g: 359, protein100g: 5, carbs100g: 51, fat100g: 16, fiber100g: 1, servingSizeG: 100 },
  { name: 'Jalebi', calories100g: 387, protein100g: 3, carbs100g: 67, fat100g: 12, fiber100g: 0.3, servingSizeG: 60 },
  { name: 'Ladoo (Besan)', calories100g: 446, protein100g: 9, carbs100g: 58, fat100g: 21, fiber100g: 2, servingSizeG: 40 },
  { name: 'Barfi (Milk)', calories100g: 410, protein100g: 8, carbs100g: 60, fat100g: 16, fiber100g: 0, servingSizeG: 40 },
  { name: 'Payasam', calories100g: 132, protein100g: 4, carbs100g: 20, fat100g: 4, fiber100g: 0.5, servingSizeG: 200 },

  // ── Beverages ──────────────────────────────────────────────────────
  { name: 'Chai (with milk & sugar)', calories100g: 40, protein100g: 1.5, carbs100g: 6, fat100g: 1, fiber100g: 0, servingSizeG: 200 },
  { name: 'Masala Chai', calories100g: 45, protein100g: 1.5, carbs100g: 6.5, fat100g: 1.2, fiber100g: 0, servingSizeG: 200 },
  { name: 'Mango Lassi', calories100g: 88, protein100g: 2.5, carbs100g: 15, fat100g: 2, fiber100g: 0.5, servingSizeG: 300 },

  // ── South Indian ───────────────────────────────────────────────────
  { name: 'Uttapam', calories100g: 170, protein100g: 4.5, carbs100g: 30, fat100g: 4, fiber100g: 1.5, servingSizeG: 150 },
  { name: 'Appam', calories100g: 130, protein100g: 3, carbs100g: 27, fat100g: 1.5, fiber100g: 0.8, servingSizeG: 80 },
  { name: 'Rasam', calories100g: 22, protein100g: 1, carbs100g: 3.5, fat100g: 0.5, fiber100g: 0.8, servingSizeG: 200 },
  { name: 'Curd Rice', calories100g: 102, protein100g: 3, carbs100g: 18, fat100g: 2, fiber100g: 0.5, servingSizeG: 250 },
  { name: 'Bisi Bele Bath', calories100g: 142, protein100g: 5, carbs100g: 23, fat100g: 4, fiber100g: 3, servingSizeG: 250 },
  { name: 'Pesarattu', calories100g: 150, protein100g: 8, carbs100g: 22, fat100g: 3.5, fiber100g: 4, servingSizeG: 100 },

  // ── North Indian / Punjabi ─────────────────────────────────────────
  { name: 'Makki di Roti', calories100g: 305, protein100g: 8, carbs100g: 58, fat100g: 5, fiber100g: 6, servingSizeG: 50 },
  { name: 'Sarson da Saag', calories100g: 75, protein100g: 3.5, carbs100g: 8, fat100g: 3, fiber100g: 4, servingSizeG: 200 },
  { name: 'Amritsari Kulcha', calories100g: 320, protein100g: 8, carbs100g: 52, fat100g: 10, fiber100g: 2.5, servingSizeG: 100 },
  { name: 'Pinni', calories100g: 490, protein100g: 11, carbs100g: 58, fat100g: 25, fiber100g: 3, servingSizeG: 40 },

  // ── Bengali ────────────────────────────────────────────────────────
  { name: 'Macher Jhol (Fish curry)', calories100g: 120, protein100g: 14, carbs100g: 5, fat100g: 5, fiber100g: 1, servingSizeG: 200 },
  { name: 'Shorshe Ilish', calories100g: 180, protein100g: 19, carbs100g: 3, fat100g: 10, fiber100g: 0.5, servingSizeG: 200 },
  { name: 'Mishti Doi', calories100g: 128, protein100g: 3.5, carbs100g: 22, fat100g: 3, fiber100g: 0, servingSizeG: 100 },

  // ── Healthy & Fitness Staples ──────────────────────────────────────
  { name: 'Sprouts (Mixed, cooked)', calories100g: 82, protein100g: 6, carbs100g: 13, fat100g: 0.5, fiber100g: 4.5, servingSizeG: 100 },
  { name: 'Sattu (Roasted Chana flour)', calories100g: 406, protein100g: 20, carbs100g: 65, fat100g: 6.5, fiber100g: 18, servingSizeG: 50 },
  { name: 'Roasted Chana', calories100g: 364, protein100g: 20, carbs100g: 55, fat100g: 6, fiber100g: 17, servingSizeG: 50 },
  { name: 'Peanuts (roasted)', calories100g: 585, protein100g: 25, carbs100g: 16, fat100g: 49, fiber100g: 8.5, servingSizeG: 30 },
  { name: 'Moong Dal Chilla', calories100g: 135, protein100g: 8, carbs100g: 20, fat100g: 2.5, fiber100g: 3, servingSizeG: 100 },
  { name: 'Oats (cooked)', calories100g: 71, protein100g: 2.5, carbs100g: 12, fat100g: 1.5, fiber100g: 1.7, servingSizeG: 200 },
];

export const indianFoods: FoodItem[] = raw.map((item, i) => ({
  ...item,
  id: `indian-${i}`,
  brand: 'Indian Food',
}));

export function searchIndianFoods(query: string): FoodItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return indianFoods.filter(
    (food) =>
      food.name.toLowerCase().includes(q) ||
      (food.brand ?? '').toLowerCase().includes(q)
  );
}
