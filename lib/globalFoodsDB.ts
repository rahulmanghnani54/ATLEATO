/**
 * Global Dishes Database
 *
 * Restaurant-style and regional dishes from major world cuisines.
 * Complements:
 *   - lib/indianFoods.ts (Indian dishes)
 *   - OpenFoodFacts API (1.2M packaged products)
 *
 * All nutrition values are per-100g, sourced from standard nutritional databases
 * (USDA FoodData Central, McCance & Widdowson's, restaurant chain published macros).
 * Numbers are typical — actual meals vary by recipe/portion.
 *
 * Currently covers: Chinese, Italian, Mexican, Japanese, American, Mediterranean,
 * Thai, Korean, Middle Eastern, French, Vietnamese, British, plus a wide base of
 * whole foods (proteins, grains, vegetables, fruits, dairy, fats, drinks).
 */
import { type FoodItem } from './api/openFoodFacts';

const raw: Omit<FoodItem, 'id' | 'barcode'>[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // CHINESE
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Chow Mein (Chicken)',         calories100g: 198, protein100g: 11,  carbs100g: 25,  fat100g: 6.5, fiber100g: 1.8, servingSizeG: 250 },
  { name: 'Fried Rice (Chicken)',        calories100g: 163, protein100g: 7.5, carbs100g: 22,  fat100g: 5,   fiber100g: 1.2, servingSizeG: 250 },
  { name: 'Fried Rice (Egg)',            calories100g: 174, protein100g: 5,   carbs100g: 24,  fat100g: 6,   fiber100g: 1,   servingSizeG: 250 },
  { name: 'Sweet & Sour Pork',           calories100g: 234, protein100g: 10,  carbs100g: 23,  fat100g: 11,  fiber100g: 1.1, servingSizeG: 200 },
  { name: 'Sweet & Sour Chicken',        calories100g: 218, protein100g: 11,  carbs100g: 22,  fat100g: 9,   fiber100g: 1.1, servingSizeG: 200 },
  { name: 'Kung Pao Chicken',            calories100g: 215, protein100g: 13,  carbs100g: 9,   fat100g: 13,  fiber100g: 1.4, servingSizeG: 220 },
  { name: 'General Tso Chicken',         calories100g: 274, protein100g: 12,  carbs100g: 25,  fat100g: 14,  fiber100g: 1.2, servingSizeG: 220 },
  { name: 'Orange Chicken',              calories100g: 245, protein100g: 11,  carbs100g: 26,  fat100g: 11,  fiber100g: 1,   servingSizeG: 220 },
  { name: 'Beef & Broccoli',             calories100g: 165, protein100g: 13,  carbs100g: 7.5, fat100g: 9,   fiber100g: 1.6, servingSizeG: 200 },
  { name: 'Mapo Tofu',                   calories100g: 145, protein100g: 9,   carbs100g: 5,   fat100g: 10,  fiber100g: 0.8, servingSizeG: 200 },
  { name: 'Wonton Soup',                 calories100g: 53,  protein100g: 3.2, carbs100g: 6,   fat100g: 1.8, fiber100g: 0.4, servingSizeG: 300 },
  { name: 'Hot & Sour Soup',             calories100g: 41,  protein100g: 2.5, carbs100g: 4.5, fat100g: 1.5, fiber100g: 0.6, servingSizeG: 300 },
  { name: 'Spring Roll (Veg)',           calories100g: 240, protein100g: 5,   carbs100g: 28,  fat100g: 12,  fiber100g: 2,   servingSizeG: 50 },
  { name: 'Dim Sum (Pork Dumplings)',    calories100g: 250, protein100g: 12,  carbs100g: 27,  fat100g: 11,  fiber100g: 1,   servingSizeG: 60 },
  { name: 'Peking Duck',                 calories100g: 337, protein100g: 19,  carbs100g: 1.5, fat100g: 28,  fiber100g: 0,   servingSizeG: 150 },
  { name: 'Lo Mein (Vegetable)',         calories100g: 153, protein100g: 5,   carbs100g: 27,  fat100g: 3,   fiber100g: 2,   servingSizeG: 250 },

  // ─────────────────────────────────────────────────────────────────────────
  // ITALIAN
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Spaghetti Bolognese',         calories100g: 152, protein100g: 8,   carbs100g: 20,  fat100g: 4.5, fiber100g: 1.5, servingSizeG: 300 },
  { name: 'Spaghetti Carbonara',         calories100g: 198, protein100g: 9,   carbs100g: 22,  fat100g: 8,   fiber100g: 1.2, servingSizeG: 280 },
  { name: 'Penne Arrabbiata',            calories100g: 165, protein100g: 5.5, carbs100g: 28,  fat100g: 4,   fiber100g: 2,   servingSizeG: 280 },
  { name: 'Lasagna (Beef)',              calories100g: 162, protein100g: 10,  carbs100g: 14,  fat100g: 7.5, fiber100g: 1.5, servingSizeG: 300 },
  { name: 'Margherita Pizza',            calories100g: 246, protein100g: 11,  carbs100g: 30,  fat100g: 9,   fiber100g: 2,   servingSizeG: 250 },
  { name: 'Pepperoni Pizza',             calories100g: 296, protein100g: 12,  carbs100g: 28,  fat100g: 15,  fiber100g: 2,   servingSizeG: 250 },
  { name: 'Hawaiian Pizza',              calories100g: 252, protein100g: 11,  carbs100g: 31,  fat100g: 9,   fiber100g: 2,   servingSizeG: 250 },
  { name: 'Risotto (Mushroom)',          calories100g: 174, protein100g: 5,   carbs100g: 24,  fat100g: 6,   fiber100g: 1,   servingSizeG: 250 },
  { name: 'Risotto (Seafood)',           calories100g: 158, protein100g: 8,   carbs100g: 23,  fat100g: 3.5, fiber100g: 0.8, servingSizeG: 250 },
  { name: 'Gnocchi (Potato)',            calories100g: 133, protein100g: 4,   carbs100g: 27,  fat100g: 1,   fiber100g: 1.8, servingSizeG: 250 },
  { name: 'Ravioli (Cheese)',            calories100g: 230, protein100g: 11,  carbs100g: 32,  fat100g: 7,   fiber100g: 1.5, servingSizeG: 250 },
  { name: 'Caprese Salad',               calories100g: 166, protein100g: 9,   carbs100g: 3,   fat100g: 13,  fiber100g: 1,   servingSizeG: 200 },
  { name: 'Bruschetta',                  calories100g: 195, protein100g: 5,   carbs100g: 27,  fat100g: 7,   fiber100g: 2,   servingSizeG: 80 },
  { name: 'Tiramisu',                    calories100g: 305, protein100g: 5,   carbs100g: 32,  fat100g: 18,  fiber100g: 0.5, servingSizeG: 120 },

  // ─────────────────────────────────────────────────────────────────────────
  // MEXICAN
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Beef Taco',                   calories100g: 226, protein100g: 13,  carbs100g: 17,  fat100g: 12,  fiber100g: 2.5, servingSizeG: 80 },
  { name: 'Chicken Taco',                calories100g: 195, protein100g: 14,  carbs100g: 16,  fat100g: 9,   fiber100g: 2.2, servingSizeG: 80 },
  { name: 'Fish Taco',                   calories100g: 180, protein100g: 11,  carbs100g: 17,  fat100g: 8,   fiber100g: 2,   servingSizeG: 90 },
  { name: 'Burrito (Bean & Cheese)',     calories100g: 206, protein100g: 8,   carbs100g: 28,  fat100g: 7,   fiber100g: 4,   servingSizeG: 250 },
  { name: 'Burrito (Chicken)',           calories100g: 186, protein100g: 11,  carbs100g: 22,  fat100g: 6,   fiber100g: 3,   servingSizeG: 280 },
  { name: 'Burrito Bowl (Chipotle-style)', calories100g: 145, protein100g: 9, carbs100g: 18,  fat100g: 4,   fiber100g: 4,   servingSizeG: 400 },
  { name: 'Quesadilla (Cheese)',         calories100g: 285, protein100g: 12,  carbs100g: 22,  fat100g: 17,  fiber100g: 1.5, servingSizeG: 150 },
  { name: 'Quesadilla (Chicken)',        calories100g: 270, protein100g: 16,  carbs100g: 20,  fat100g: 14,  fiber100g: 1.5, servingSizeG: 180 },
  { name: 'Enchilada (Chicken)',         calories100g: 178, protein100g: 11,  carbs100g: 16,  fat100g: 7.5, fiber100g: 2,   servingSizeG: 200 },
  { name: 'Nachos with Cheese',          calories100g: 343, protein100g: 8,   carbs100g: 36,  fat100g: 18,  fiber100g: 3,   servingSizeG: 150 },
  { name: 'Guacamole',                   calories100g: 150, protein100g: 2,   carbs100g: 8.5, fat100g: 13,  fiber100g: 6.7, servingSizeG: 60 },
  { name: 'Salsa (Tomato)',              calories100g: 36,  protein100g: 1.5, carbs100g: 7,   fat100g: 0.2, fiber100g: 1.5, servingSizeG: 50 },
  { name: 'Refried Beans',               calories100g: 115, protein100g: 7,   carbs100g: 18,  fat100g: 1.5, fiber100g: 6.5, servingSizeG: 150 },
  { name: 'Chimichanga',                 calories100g: 285, protein100g: 10,  carbs100g: 27,  fat100g: 15,  fiber100g: 2,   servingSizeG: 200 },
  { name: 'Carnitas (Pork)',             calories100g: 235, protein100g: 20,  carbs100g: 1,   fat100g: 17,  fiber100g: 0,   servingSizeG: 120 },

  // ─────────────────────────────────────────────────────────────────────────
  // JAPANESE
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Sushi (Salmon Nigiri)',       calories100g: 142, protein100g: 7,   carbs100g: 23,  fat100g: 2.5, fiber100g: 0.5, servingSizeG: 30 },
  { name: 'Sushi (Tuna Nigiri)',         calories100g: 144, protein100g: 9,   carbs100g: 22,  fat100g: 1,   fiber100g: 0.5, servingSizeG: 30 },
  { name: 'California Roll',             calories100g: 124, protein100g: 4,   carbs100g: 23,  fat100g: 2,   fiber100g: 1,   servingSizeG: 200 },
  { name: 'Spicy Tuna Roll',             calories100g: 175, protein100g: 7,   carbs100g: 26,  fat100g: 4.5, fiber100g: 1,   servingSizeG: 200 },
  { name: 'Ramen (Tonkotsu)',            calories100g: 138, protein100g: 6,   carbs100g: 16,  fat100g: 6,   fiber100g: 1,   servingSizeG: 500 },
  { name: 'Ramen (Miso)',                calories100g: 128, protein100g: 6.5, carbs100g: 17,  fat100g: 4,   fiber100g: 1.2, servingSizeG: 500 },
  { name: 'Udon Noodle Soup',            calories100g: 95,  protein100g: 3.5, carbs100g: 18,  fat100g: 1,   fiber100g: 0.8, servingSizeG: 500 },
  { name: 'Yakitori (Chicken Skewer)',   calories100g: 175, protein100g: 25,  carbs100g: 4,   fat100g: 6,   fiber100g: 0,   servingSizeG: 50 },
  { name: 'Tempura (Shrimp)',            calories100g: 250, protein100g: 11,  carbs100g: 22,  fat100g: 13,  fiber100g: 1,   servingSizeG: 100 },
  { name: 'Tempura (Vegetable)',         calories100g: 234, protein100g: 4,   carbs100g: 28,  fat100g: 11,  fiber100g: 2,   servingSizeG: 100 },
  { name: 'Katsu Curry (Chicken)',       calories100g: 195, protein100g: 12,  carbs100g: 22,  fat100g: 7,   fiber100g: 1.5, servingSizeG: 400 },
  { name: 'Teriyaki Chicken',            calories100g: 195, protein100g: 18,  carbs100g: 10,  fat100g: 8,   fiber100g: 0.3, servingSizeG: 200 },
  { name: 'Miso Soup',                   calories100g: 33,  protein100g: 2.2, carbs100g: 3,   fat100g: 1,   fiber100g: 0.5, servingSizeG: 250 },
  { name: 'Onigiri (Rice Ball)',         calories100g: 168, protein100g: 3.5, carbs100g: 35,  fat100g: 1.5, fiber100g: 0.5, servingSizeG: 100 },
  { name: 'Edamame (Boiled)',            calories100g: 121, protein100g: 11,  carbs100g: 9,   fat100g: 5,   fiber100g: 5,   servingSizeG: 100 },

  // ─────────────────────────────────────────────────────────────────────────
  // AMERICAN (Diner / Fast Food)
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Cheeseburger',                calories100g: 264, protein100g: 14,  carbs100g: 21,  fat100g: 13,  fiber100g: 1.5, servingSizeG: 180 },
  { name: 'Bacon Cheeseburger',          calories100g: 295, protein100g: 16,  carbs100g: 20,  fat100g: 17,  fiber100g: 1.5, servingSizeG: 200 },
  { name: 'Double Cheeseburger',         calories100g: 290, protein100g: 17,  carbs100g: 18,  fat100g: 16,  fiber100g: 1.2, servingSizeG: 220 },
  { name: 'Hot Dog',                     calories100g: 290, protein100g: 11,  carbs100g: 18,  fat100g: 19,  fiber100g: 1,   servingSizeG: 100 },
  { name: 'French Fries',                calories100g: 312, protein100g: 3.4, carbs100g: 41,  fat100g: 15,  fiber100g: 3.8, servingSizeG: 120 },
  { name: 'Onion Rings',                 calories100g: 332, protein100g: 4.4, carbs100g: 39,  fat100g: 18,  fiber100g: 2,   servingSizeG: 120 },
  { name: 'Fried Chicken (Breast)',      calories100g: 263, protein100g: 25,  carbs100g: 8,   fat100g: 15,  fiber100g: 0.4, servingSizeG: 150 },
  { name: 'Chicken Nuggets',             calories100g: 297, protein100g: 16,  carbs100g: 16,  fat100g: 19,  fiber100g: 1,   servingSizeG: 100 },
  { name: 'Chicken Wings (Buffalo)',     calories100g: 290, protein100g: 18,  carbs100g: 4,   fat100g: 22,  fiber100g: 0.3, servingSizeG: 150 },
  { name: 'BBQ Pulled Pork',             calories100g: 200, protein100g: 17,  carbs100g: 8,   fat100g: 11,  fiber100g: 0.3, servingSizeG: 150 },
  { name: 'BBQ Ribs',                    calories100g: 295, protein100g: 22,  carbs100g: 6,   fat100g: 21,  fiber100g: 0.3, servingSizeG: 200 },
  { name: 'Mac & Cheese',                calories100g: 164, protein100g: 6.5, carbs100g: 20,  fat100g: 6.5, fiber100g: 0.8, servingSizeG: 250 },
  { name: 'Pancakes (Plain)',            calories100g: 227, protein100g: 6.4, carbs100g: 28,  fat100g: 9.7, fiber100g: 1,   servingSizeG: 150 },
  { name: 'Waffles (Plain)',             calories100g: 291, protein100g: 6.5, carbs100g: 33,  fat100g: 14,  fiber100g: 1.5, servingSizeG: 100 },
  { name: 'French Toast',                calories100g: 213, protein100g: 8,   carbs100g: 25,  fat100g: 9,   fiber100g: 1,   servingSizeG: 130 },
  { name: 'Bagel with Cream Cheese',     calories100g: 309, protein100g: 9,   carbs100g: 40,  fat100g: 12,  fiber100g: 2,   servingSizeG: 150 },
  { name: 'Caesar Salad (Chicken)',      calories100g: 130, protein100g: 9,   carbs100g: 4,   fat100g: 9,   fiber100g: 1.5, servingSizeG: 300 },
  { name: 'Cobb Salad',                  calories100g: 124, protein100g: 8,   carbs100g: 5,   fat100g: 8,   fiber100g: 2,   servingSizeG: 350 },
  { name: 'Club Sandwich',               calories100g: 250, protein100g: 13,  carbs100g: 22,  fat100g: 12,  fiber100g: 2,   servingSizeG: 250 },
  { name: 'Grilled Cheese Sandwich',     calories100g: 333, protein100g: 13,  carbs100g: 28,  fat100g: 19,  fiber100g: 1.5, servingSizeG: 150 },

  // ─────────────────────────────────────────────────────────────────────────
  // MEDITERRANEAN & GREEK
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Gyro (Lamb)',                 calories100g: 226, protein100g: 13,  carbs100g: 18,  fat100g: 11,  fiber100g: 1.5, servingSizeG: 250 },
  { name: 'Gyro (Chicken)',              calories100g: 190, protein100g: 14,  carbs100g: 18,  fat100g: 7,   fiber100g: 1.5, servingSizeG: 250 },
  { name: 'Souvlaki (Pork)',             calories100g: 215, protein100g: 22,  carbs100g: 2,   fat100g: 13,  fiber100g: 0.3, servingSizeG: 150 },
  { name: 'Greek Salad',                 calories100g: 107, protein100g: 4,   carbs100g: 6,   fat100g: 8,   fiber100g: 1.8, servingSizeG: 300 },
  { name: 'Hummus',                      calories100g: 166, protein100g: 8,   carbs100g: 14,  fat100g: 10,  fiber100g: 6,   servingSizeG: 60 },
  { name: 'Falafel',                     calories100g: 333, protein100g: 13,  carbs100g: 32,  fat100g: 18,  fiber100g: 5,   servingSizeG: 100 },
  { name: 'Tabbouleh',                   calories100g: 110, protein100g: 3,   carbs100g: 16,  fat100g: 4,   fiber100g: 3.5, servingSizeG: 150 },
  { name: 'Tzatziki',                    calories100g: 75,  protein100g: 4.4, carbs100g: 4.8, fat100g: 4,   fiber100g: 0.4, servingSizeG: 60 },
  { name: 'Baba Ganoush',                calories100g: 110, protein100g: 3,   carbs100g: 10,  fat100g: 7,   fiber100g: 4,   servingSizeG: 60 },
  { name: 'Spanakopita',                 calories100g: 252, protein100g: 9,   carbs100g: 22,  fat100g: 14,  fiber100g: 2,   servingSizeG: 100 },
  { name: 'Moussaka',                    calories100g: 168, protein100g: 8,   carbs100g: 10,  fat100g: 11,  fiber100g: 2.5, servingSizeG: 250 },
  { name: 'Dolmades (Stuffed Grape Leaves)', calories100g: 178, protein100g: 3, carbs100g: 22, fat100g: 9,   fiber100g: 2.5, servingSizeG: 100 },
  { name: 'Baklava',                     calories100g: 428, protein100g: 7,   carbs100g: 45,  fat100g: 25,  fiber100g: 2.5, servingSizeG: 50 },
  { name: 'Pita Bread',                  calories100g: 275, protein100g: 9,   carbs100g: 55,  fat100g: 1.2, fiber100g: 2.3, servingSizeG: 60 },

  // ─────────────────────────────────────────────────────────────────────────
  // THAI
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Pad Thai (Chicken)',          calories100g: 192, protein100g: 9,   carbs100g: 28,  fat100g: 5,   fiber100g: 2,   servingSizeG: 300 },
  { name: 'Pad Thai (Shrimp)',           calories100g: 185, protein100g: 11,  carbs100g: 27,  fat100g: 4,   fiber100g: 2,   servingSizeG: 300 },
  { name: 'Green Curry (Chicken)',       calories100g: 113, protein100g: 9,   carbs100g: 5,   fat100g: 6,   fiber100g: 1.5, servingSizeG: 300 },
  { name: 'Red Curry (Beef)',            calories100g: 144, protein100g: 9,   carbs100g: 6,   fat100g: 9,   fiber100g: 1.5, servingSizeG: 300 },
  { name: 'Massaman Curry',              calories100g: 158, protein100g: 8,   carbs100g: 10,  fat100g: 10,  fiber100g: 2,   servingSizeG: 300 },
  { name: 'Tom Yum Soup',                calories100g: 39,  protein100g: 4,   carbs100g: 3,   fat100g: 1.2, fiber100g: 0.5, servingSizeG: 300 },
  { name: 'Tom Kha Gai',                 calories100g: 78,  protein100g: 6,   carbs100g: 4,   fat100g: 4.5, fiber100g: 0.6, servingSizeG: 300 },
  { name: 'Pad See Ew',                  calories100g: 180, protein100g: 8.5, carbs100g: 25,  fat100g: 5,   fiber100g: 1.5, servingSizeG: 300 },
  { name: 'Drunken Noodles (Pad Kee Mao)', calories100g: 197, protein100g: 10, carbs100g: 25, fat100g: 6,   fiber100g: 2,   servingSizeG: 300 },
  { name: 'Thai Basil Chicken (Pad Krapow)', calories100g: 175, protein100g: 13, carbs100g: 7, fat100g: 11, fiber100g: 1,   servingSizeG: 250 },
  { name: 'Mango Sticky Rice',           calories100g: 233, protein100g: 3,   carbs100g: 47,  fat100g: 4,   fiber100g: 1.5, servingSizeG: 200 },
  { name: 'Thai Spring Roll (Fresh)',    calories100g: 100, protein100g: 5,   carbs100g: 14,  fat100g: 3,   fiber100g: 1.2, servingSizeG: 80 },

  // ─────────────────────────────────────────────────────────────────────────
  // KOREAN
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Bibimbap',                    calories100g: 130, protein100g: 6,   carbs100g: 18,  fat100g: 4,   fiber100g: 2.5, servingSizeG: 450 },
  { name: 'Korean BBQ (Bulgogi)',        calories100g: 226, protein100g: 18,  carbs100g: 8,   fat100g: 13,  fiber100g: 0.5, servingSizeG: 150 },
  { name: 'Korean Fried Chicken',        calories100g: 295, protein100g: 17,  carbs100g: 18,  fat100g: 17,  fiber100g: 0.8, servingSizeG: 150 },
  { name: 'Tteokbokki',                  calories100g: 162, protein100g: 4,   carbs100g: 33,  fat100g: 1.5, fiber100g: 1.5, servingSizeG: 250 },
  { name: 'Kimchi',                      calories100g: 23,  protein100g: 1.7, carbs100g: 4,   fat100g: 0.5, fiber100g: 1.6, servingSizeG: 50 },
  { name: 'Japchae',                     calories100g: 175, protein100g: 5,   carbs100g: 27,  fat100g: 5,   fiber100g: 1.5, servingSizeG: 200 },
  { name: 'Kimchi Fried Rice',           calories100g: 165, protein100g: 5.5, carbs100g: 25,  fat100g: 5,   fiber100g: 1.5, servingSizeG: 300 },
  { name: 'Galbi (Korean Short Ribs)',   calories100g: 295, protein100g: 17,  carbs100g: 6,   fat100g: 23,  fiber100g: 0.4, servingSizeG: 150 },

  // ─────────────────────────────────────────────────────────────────────────
  // MIDDLE EASTERN
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Shawarma (Chicken)',          calories100g: 215, protein100g: 16,  carbs100g: 18,  fat100g: 9,   fiber100g: 1.5, servingSizeG: 250 },
  { name: 'Shawarma (Beef/Lamb)',        calories100g: 248, protein100g: 14,  carbs100g: 17,  fat100g: 14,  fiber100g: 1.5, servingSizeG: 250 },
  { name: 'Kebab (Lamb)',                calories100g: 215, protein100g: 18,  carbs100g: 4,   fat100g: 14,  fiber100g: 0.5, servingSizeG: 150 },
  { name: 'Kebab (Chicken Tikka)',       calories100g: 165, protein100g: 22,  carbs100g: 3,   fat100g: 7,   fiber100g: 0.3, servingSizeG: 150 },
  { name: 'Kibbeh',                      calories100g: 235, protein100g: 9,   carbs100g: 25,  fat100g: 12,  fiber100g: 2,   servingSizeG: 100 },
  { name: 'Fattoush',                    calories100g: 95,  protein100g: 2.5, carbs100g: 12,  fat100g: 4.5, fiber100g: 2.5, servingSizeG: 200 },
  { name: 'Mansaf',                      calories100g: 175, protein100g: 10,  carbs100g: 20,  fat100g: 6,   fiber100g: 1,   servingSizeG: 350 },

  // ─────────────────────────────────────────────────────────────────────────
  // VIETNAMESE
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Pho (Beef)',                  calories100g: 70,  protein100g: 4.5, carbs100g: 10,  fat100g: 1.2, fiber100g: 0.5, servingSizeG: 500 },
  { name: 'Pho (Chicken)',               calories100g: 65,  protein100g: 4.5, carbs100g: 10,  fat100g: 0.8, fiber100g: 0.5, servingSizeG: 500 },
  { name: 'Banh Mi',                     calories100g: 252, protein100g: 9.5, carbs100g: 30,  fat100g: 10,  fiber100g: 2.5, servingSizeG: 200 },
  { name: 'Vietnamese Spring Roll (Fresh)', calories100g: 95, protein100g: 4, carbs100g: 14,  fat100g: 2.5, fiber100g: 1.2, servingSizeG: 80 },
  { name: 'Bun Bo Hue',                  calories100g: 95,  protein100g: 6,   carbs100g: 11,  fat100g: 2.5, fiber100g: 0.7, servingSizeG: 500 },

  // ─────────────────────────────────────────────────────────────────────────
  // FRENCH / EUROPEAN
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Croissant (Plain)',           calories100g: 406, protein100g: 8.2, carbs100g: 46,  fat100g: 21,  fiber100g: 2.6, servingSizeG: 65 },
  { name: 'Croissant (Chocolate)',       calories100g: 414, protein100g: 7,   carbs100g: 47,  fat100g: 22,  fiber100g: 2.8, servingSizeG: 75 },
  { name: 'Baguette',                    calories100g: 277, protein100g: 9,   carbs100g: 55,  fat100g: 1.2, fiber100g: 2.3, servingSizeG: 80 },
  { name: 'Quiche Lorraine',             calories100g: 309, protein100g: 11,  carbs100g: 17,  fat100g: 22,  fiber100g: 1,   servingSizeG: 130 },
  { name: 'Coq au Vin',                  calories100g: 195, protein100g: 18,  carbs100g: 5,   fat100g: 11,  fiber100g: 1,   servingSizeG: 300 },
  { name: 'Ratatouille',                 calories100g: 70,  protein100g: 1.5, carbs100g: 8,   fat100g: 3.5, fiber100g: 2.5, servingSizeG: 250 },
  { name: 'Crème Brûlée',                calories100g: 322, protein100g: 5,   carbs100g: 26,  fat100g: 22,  fiber100g: 0,   servingSizeG: 120 },
  { name: 'French Onion Soup',           calories100g: 82,  protein100g: 4,   carbs100g: 9,   fat100g: 3.5, fiber100g: 1,   servingSizeG: 300 },

  // ─────────────────────────────────────────────────────────────────────────
  // BRITISH / IRISH
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Fish & Chips',                calories100g: 232, protein100g: 11,  carbs100g: 24,  fat100g: 11,  fiber100g: 2,   servingSizeG: 300 },
  { name: 'Shepherds Pie',               calories100g: 160, protein100g: 8,   carbs100g: 13,  fat100g: 8,   fiber100g: 1.5, servingSizeG: 350 },
  { name: 'Bangers and Mash',            calories100g: 185, protein100g: 8,   carbs100g: 14,  fat100g: 11,  fiber100g: 1.5, servingSizeG: 350 },
  { name: 'Full English Breakfast',      calories100g: 220, protein100g: 12,  carbs100g: 14,  fat100g: 14,  fiber100g: 2.5, servingSizeG: 350 },
  { name: 'Beef Wellington',             calories100g: 295, protein100g: 18,  carbs100g: 14,  fat100g: 18,  fiber100g: 0.8, servingSizeG: 200 },
  { name: 'Yorkshire Pudding',           calories100g: 244, protein100g: 8,   carbs100g: 25,  fat100g: 12,  fiber100g: 0.8, servingSizeG: 50 },

  // ─────────────────────────────────────────────────────────────────────────
  // WHOLE FOODS — PROTEINS
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Chicken Breast (Grilled)',    calories100g: 165, protein100g: 31,  carbs100g: 0,   fat100g: 3.6, fiber100g: 0,   servingSizeG: 150 },
  { name: 'Chicken Thigh (Grilled)',     calories100g: 209, protein100g: 26,  carbs100g: 0,   fat100g: 11,  fiber100g: 0,   servingSizeG: 150 },
  { name: 'Ground Beef (90/10 Cooked)',  calories100g: 217, protein100g: 26,  carbs100g: 0,   fat100g: 12,  fiber100g: 0,   servingSizeG: 100 },
  { name: 'Ground Beef (80/20 Cooked)',  calories100g: 250, protein100g: 24,  carbs100g: 0,   fat100g: 17,  fiber100g: 0,   servingSizeG: 100 },
  { name: 'Steak (Sirloin)',             calories100g: 271, protein100g: 26,  carbs100g: 0,   fat100g: 18,  fiber100g: 0,   servingSizeG: 200 },
  { name: 'Steak (Ribeye)',              calories100g: 291, protein100g: 24,  carbs100g: 0,   fat100g: 22,  fiber100g: 0,   servingSizeG: 200 },
  { name: 'Pork Chop (Grilled)',         calories100g: 231, protein100g: 26,  carbs100g: 0,   fat100g: 14,  fiber100g: 0,   servingSizeG: 150 },
  { name: 'Bacon (Cooked)',              calories100g: 541, protein100g: 37,  carbs100g: 1.4, fat100g: 42,  fiber100g: 0,   servingSizeG: 28 },
  { name: 'Salmon (Grilled)',            calories100g: 208, protein100g: 22,  carbs100g: 0,   fat100g: 13,  fiber100g: 0,   servingSizeG: 150 },
  { name: 'Tuna (Canned in Water)',      calories100g: 116, protein100g: 26,  carbs100g: 0,   fat100g: 0.8, fiber100g: 0,   servingSizeG: 100 },
  { name: 'Cod (Baked)',                 calories100g: 105, protein100g: 23,  carbs100g: 0,   fat100g: 0.9, fiber100g: 0,   servingSizeG: 150 },
  { name: 'Shrimp (Cooked)',             calories100g: 99,  protein100g: 24,  carbs100g: 0.2, fat100g: 0.3, fiber100g: 0,   servingSizeG: 100 },
  { name: 'Eggs (Whole, Boiled)',        calories100g: 155, protein100g: 13,  carbs100g: 1.1, fat100g: 11,  fiber100g: 0,   servingSizeG: 50 },
  { name: 'Egg White',                   calories100g: 52,  protein100g: 11,  carbs100g: 0.7, fat100g: 0.2, fiber100g: 0,   servingSizeG: 33 },
  { name: 'Tofu (Firm)',                 calories100g: 144, protein100g: 17,  carbs100g: 2.8, fat100g: 9,   fiber100g: 2.3, servingSizeG: 100 },
  { name: 'Tempeh',                      calories100g: 192, protein100g: 20,  carbs100g: 8,   fat100g: 11,  fiber100g: 0.4, servingSizeG: 100 },
  { name: 'Whey Protein (Scoop)',        calories100g: 380, protein100g: 80,  carbs100g: 8,   fat100g: 4,   fiber100g: 0.5, servingSizeG: 30 },

  // ─────────────────────────────────────────────────────────────────────────
  // WHOLE FOODS — GRAINS & CARBS
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'White Rice (Cooked)',         calories100g: 130, protein100g: 2.7, carbs100g: 28,  fat100g: 0.3, fiber100g: 0.4, servingSizeG: 150 },
  { name: 'Quinoa (Cooked)',             calories100g: 120, protein100g: 4.4, carbs100g: 21,  fat100g: 1.9, fiber100g: 2.8, servingSizeG: 150 },
  { name: 'Oats (Cooked)',               calories100g: 71,  protein100g: 2.5, carbs100g: 12,  fat100g: 1.5, fiber100g: 1.7, servingSizeG: 200 },
  { name: 'Whole Wheat Bread',           calories100g: 247, protein100g: 13,  carbs100g: 41,  fat100g: 3.4, fiber100g: 7,   servingSizeG: 30 },
  { name: 'White Bread',                 calories100g: 265, protein100g: 9,   carbs100g: 49,  fat100g: 3.2, fiber100g: 2.7, servingSizeG: 30 },
  { name: 'Sweet Potato (Baked)',        calories100g: 90,  protein100g: 2,   carbs100g: 21,  fat100g: 0.2, fiber100g: 3.3, servingSizeG: 150 },
  { name: 'Potato (Boiled)',             calories100g: 87,  protein100g: 1.9, carbs100g: 20,  fat100g: 0.1, fiber100g: 1.8, servingSizeG: 150 },
  { name: 'Pasta (Cooked)',              calories100g: 131, protein100g: 5,   carbs100g: 25,  fat100g: 1.1, fiber100g: 1.8, servingSizeG: 150 },
  { name: 'Lentils (Cooked)',            calories100g: 116, protein100g: 9,   carbs100g: 20,  fat100g: 0.4, fiber100g: 7.9, servingSizeG: 150 },
  { name: 'Chickpeas (Cooked)',          calories100g: 164, protein100g: 8.9, carbs100g: 27,  fat100g: 2.6, fiber100g: 7.6, servingSizeG: 150 },
  { name: 'Black Beans (Cooked)',        calories100g: 132, protein100g: 8.9, carbs100g: 24,  fat100g: 0.5, fiber100g: 8.7, servingSizeG: 150 },
  { name: 'Tortilla (Flour)',            calories100g: 304, protein100g: 8,   carbs100g: 51,  fat100g: 7,   fiber100g: 3,   servingSizeG: 40 },
  { name: 'Tortilla (Corn)',             calories100g: 218, protein100g: 5.7, carbs100g: 45,  fat100g: 2.9, fiber100g: 6.3, servingSizeG: 30 },

  // ─────────────────────────────────────────────────────────────────────────
  // WHOLE FOODS — VEGETABLES
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Broccoli (Steamed)',          calories100g: 35,  protein100g: 2.4, carbs100g: 7,   fat100g: 0.4, fiber100g: 3.3, servingSizeG: 100 },
  { name: 'Spinach (Raw)',               calories100g: 23,  protein100g: 2.9, carbs100g: 3.6, fat100g: 0.4, fiber100g: 2.2, servingSizeG: 100 },
  { name: 'Kale (Raw)',                  calories100g: 49,  protein100g: 4.3, carbs100g: 9,   fat100g: 0.9, fiber100g: 3.6, servingSizeG: 100 },
  { name: 'Carrot (Raw)',                calories100g: 41,  protein100g: 0.9, carbs100g: 10,  fat100g: 0.2, fiber100g: 2.8, servingSizeG: 100 },
  { name: 'Bell Pepper (Raw)',           calories100g: 31,  protein100g: 1,   carbs100g: 6,   fat100g: 0.3, fiber100g: 2.1, servingSizeG: 100 },
  { name: 'Cucumber',                    calories100g: 16,  protein100g: 0.7, carbs100g: 3.6, fat100g: 0.1, fiber100g: 0.5, servingSizeG: 100 },
  { name: 'Tomato',                      calories100g: 18,  protein100g: 0.9, carbs100g: 3.9, fat100g: 0.2, fiber100g: 1.2, servingSizeG: 100 },
  { name: 'Onion (Raw)',                 calories100g: 40,  protein100g: 1.1, carbs100g: 9.3, fat100g: 0.1, fiber100g: 1.7, servingSizeG: 100 },
  { name: 'Lettuce (Romaine)',           calories100g: 17,  protein100g: 1.2, carbs100g: 3.3, fat100g: 0.3, fiber100g: 2.1, servingSizeG: 100 },
  { name: 'Mushrooms (White)',           calories100g: 22,  protein100g: 3.1, carbs100g: 3.3, fat100g: 0.3, fiber100g: 1,   servingSizeG: 100 },
  { name: 'Cauliflower (Steamed)',       calories100g: 23,  protein100g: 1.8, carbs100g: 4.1, fat100g: 0.5, fiber100g: 2.3, servingSizeG: 100 },
  { name: 'Brussels Sprouts',            calories100g: 43,  protein100g: 3.4, carbs100g: 9,   fat100g: 0.3, fiber100g: 3.8, servingSizeG: 100 },
  { name: 'Asparagus (Steamed)',         calories100g: 22,  protein100g: 2.4, carbs100g: 4.1, fat100g: 0.2, fiber100g: 2.1, servingSizeG: 100 },
  { name: 'Zucchini',                    calories100g: 17,  protein100g: 1.2, carbs100g: 3.1, fat100g: 0.3, fiber100g: 1,   servingSizeG: 100 },

  // ─────────────────────────────────────────────────────────────────────────
  // WHOLE FOODS — FRUITS
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Apple',                       calories100g: 52,  protein100g: 0.3, carbs100g: 14,  fat100g: 0.2, fiber100g: 2.4, servingSizeG: 180 },
  { name: 'Banana',                      calories100g: 89,  protein100g: 1.1, carbs100g: 23,  fat100g: 0.3, fiber100g: 2.6, servingSizeG: 120 },
  { name: 'Orange',                      calories100g: 47,  protein100g: 0.9, carbs100g: 12,  fat100g: 0.1, fiber100g: 2.4, servingSizeG: 130 },
  { name: 'Grapes',                      calories100g: 69,  protein100g: 0.7, carbs100g: 18,  fat100g: 0.2, fiber100g: 0.9, servingSizeG: 100 },
  { name: 'Strawberries',                calories100g: 32,  protein100g: 0.7, carbs100g: 8,   fat100g: 0.3, fiber100g: 2,   servingSizeG: 100 },
  { name: 'Blueberries',                 calories100g: 57,  protein100g: 0.7, carbs100g: 14,  fat100g: 0.3, fiber100g: 2.4, servingSizeG: 100 },
  { name: 'Mango',                       calories100g: 60,  protein100g: 0.8, carbs100g: 15,  fat100g: 0.4, fiber100g: 1.6, servingSizeG: 165 },
  { name: 'Pineapple',                   calories100g: 50,  protein100g: 0.5, carbs100g: 13,  fat100g: 0.1, fiber100g: 1.4, servingSizeG: 165 },
  { name: 'Avocado',                     calories100g: 160, protein100g: 2,   carbs100g: 9,   fat100g: 15,  fiber100g: 6.7, servingSizeG: 100 },
  { name: 'Watermelon',                  calories100g: 30,  protein100g: 0.6, carbs100g: 8,   fat100g: 0.2, fiber100g: 0.4, servingSizeG: 150 },
  { name: 'Pear',                        calories100g: 57,  protein100g: 0.4, carbs100g: 15,  fat100g: 0.1, fiber100g: 3.1, servingSizeG: 180 },
  { name: 'Peach',                       calories100g: 39,  protein100g: 0.9, carbs100g: 10,  fat100g: 0.3, fiber100g: 1.5, servingSizeG: 150 },

  // ─────────────────────────────────────────────────────────────────────────
  // WHOLE FOODS — DAIRY
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Whole Milk',                  calories100g: 61,  protein100g: 3.2, carbs100g: 4.8, fat100g: 3.3, fiber100g: 0,   servingSizeG: 240 },
  { name: 'Skim Milk',                   calories100g: 34,  protein100g: 3.4, carbs100g: 5,   fat100g: 0.1, fiber100g: 0,   servingSizeG: 240 },
  { name: 'Greek Yogurt (Plain, Fat-Free)', calories100g: 59, protein100g: 10, carbs100g: 3.6, fat100g: 0.4, fiber100g: 0,  servingSizeG: 170 },
  { name: 'Greek Yogurt (Plain, Full-Fat)', calories100g: 97, protein100g: 9, carbs100g: 4,    fat100g: 5,   fiber100g: 0,   servingSizeG: 170 },
  { name: 'Cottage Cheese (Low-Fat)',    calories100g: 81,  protein100g: 12,  carbs100g: 3.4, fat100g: 1.1, fiber100g: 0,   servingSizeG: 100 },
  { name: 'Cheddar Cheese',              calories100g: 402, protein100g: 25,  carbs100g: 1.3, fat100g: 33,  fiber100g: 0,   servingSizeG: 30 },
  { name: 'Mozzarella (Fresh)',          calories100g: 280, protein100g: 18,  carbs100g: 3.1, fat100g: 22,  fiber100g: 0,   servingSizeG: 30 },
  { name: 'Parmesan Cheese',             calories100g: 431, protein100g: 38,  carbs100g: 4.1, fat100g: 29,  fiber100g: 0,   servingSizeG: 15 },
  { name: 'Butter',                      calories100g: 717, protein100g: 0.9, carbs100g: 0.1, fat100g: 81,  fiber100g: 0,   servingSizeG: 10 },
  { name: 'Cream Cheese',                calories100g: 342, protein100g: 6,   carbs100g: 4,   fat100g: 34,  fiber100g: 0,   servingSizeG: 30 },

  // ─────────────────────────────────────────────────────────────────────────
  // FATS & NUTS
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Olive Oil',                   calories100g: 884, protein100g: 0,   carbs100g: 0,   fat100g: 100, fiber100g: 0,   servingSizeG: 14 },
  { name: 'Coconut Oil',                 calories100g: 862, protein100g: 0,   carbs100g: 0,   fat100g: 100, fiber100g: 0,   servingSizeG: 14 },
  { name: 'Almonds',                     calories100g: 579, protein100g: 21,  carbs100g: 22,  fat100g: 50,  fiber100g: 12,  servingSizeG: 28 },
  { name: 'Walnuts',                     calories100g: 654, protein100g: 15,  carbs100g: 14,  fat100g: 65,  fiber100g: 6.7, servingSizeG: 28 },
  { name: 'Cashews',                     calories100g: 553, protein100g: 18,  carbs100g: 30,  fat100g: 44,  fiber100g: 3.3, servingSizeG: 28 },
  { name: 'Peanut Butter',               calories100g: 588, protein100g: 25,  carbs100g: 20,  fat100g: 50,  fiber100g: 6,   servingSizeG: 32 },
  { name: 'Almond Butter',               calories100g: 614, protein100g: 21,  carbs100g: 19,  fat100g: 56,  fiber100g: 10,  servingSizeG: 32 },
  { name: 'Chia Seeds',                  calories100g: 486, protein100g: 17,  carbs100g: 42,  fat100g: 31,  fiber100g: 34,  servingSizeG: 15 },

  // ─────────────────────────────────────────────────────────────────────────
  // DRINKS
  // ─────────────────────────────────────────────────────────────────────────
  { name: 'Coke (Regular)',              calories100g: 42,  protein100g: 0,   carbs100g: 10.6, fat100g: 0,  fiber100g: 0,   servingSizeG: 330 },
  { name: 'Coke (Diet/Zero)',            calories100g: 0,   protein100g: 0,   carbs100g: 0,   fat100g: 0,   fiber100g: 0,   servingSizeG: 330 },
  { name: 'Orange Juice',                calories100g: 45,  protein100g: 0.7, carbs100g: 10,  fat100g: 0.2, fiber100g: 0.2, servingSizeG: 240 },
  { name: 'Apple Juice',                 calories100g: 46,  protein100g: 0.1, carbs100g: 11,  fat100g: 0.1, fiber100g: 0.2, servingSizeG: 240 },
  { name: 'Beer (Regular)',              calories100g: 43,  protein100g: 0.5, carbs100g: 3.6, fat100g: 0,   fiber100g: 0,   servingSizeG: 350 },
  { name: 'Wine (Red)',                  calories100g: 85,  protein100g: 0.1, carbs100g: 2.6, fat100g: 0,   fiber100g: 0,   servingSizeG: 150 },
  { name: 'Wine (White)',                calories100g: 82,  protein100g: 0.1, carbs100g: 2.6, fat100g: 0,   fiber100g: 0,   servingSizeG: 150 },
  { name: 'Coffee (Black)',              calories100g: 2,   protein100g: 0.1, carbs100g: 0,   fat100g: 0,   fiber100g: 0,   servingSizeG: 240 },
  { name: 'Latte (Whole Milk)',          calories100g: 56,  protein100g: 3,   carbs100g: 4.4, fat100g: 3,   fiber100g: 0,   servingSizeG: 240 },
  { name: 'Cappuccino',                  calories100g: 42,  protein100g: 2.3, carbs100g: 3.3, fat100g: 2.3, fiber100g: 0,   servingSizeG: 180 },
  { name: 'Green Tea',                   calories100g: 1,   protein100g: 0,   carbs100g: 0,   fat100g: 0,   fiber100g: 0,   servingSizeG: 240 },
  { name: 'Smoothie (Berry, Plain Yogurt)', calories100g: 64, protein100g: 2.5, carbs100g: 12, fat100g: 0.8, fiber100g: 2,   servingSizeG: 300 },
  { name: 'Protein Shake (Whey + Water)', calories100g: 50, protein100g: 11,  carbs100g: 1.5, fat100g: 0.5, fiber100g: 0.1, servingSizeG: 300 },

  // ─────────────────────────────────────────────────────────────────────────
  // FREQUENTLY MISSED — second pass additions
  // ─────────────────────────────────────────────────────────────────────────
  // Chinese-American + appetizers
  { name: 'Egg Roll (Pork)',             calories100g: 222, protein100g: 8,   carbs100g: 24,  fat100g: 11,  fiber100g: 2,   servingSizeG: 90 },
  { name: 'Egg Roll (Vegetable)',        calories100g: 210, protein100g: 5,   carbs100g: 27,  fat100g: 9,   fiber100g: 2.5, servingSizeG: 90 },
  { name: 'Egg Drop Soup',               calories100g: 31,  protein100g: 2.5, carbs100g: 2.6, fat100g: 1.2, fiber100g: 0.1, servingSizeG: 240 },
  { name: 'Crab Rangoon',                calories100g: 295, protein100g: 6,   carbs100g: 22,  fat100g: 20,  fiber100g: 0.8, servingSizeG: 50 },
  { name: 'Pot Stickers (Pork)',         calories100g: 213, protein100g: 9,   carbs100g: 22,  fat100g: 10,  fiber100g: 1.5, servingSizeG: 60 },
  { name: 'Szechuan Beef',               calories100g: 199, protein100g: 12,  carbs100g: 12,  fat100g: 12,  fiber100g: 1.5, servingSizeG: 200 },
  { name: 'Moo Shu Pork',                calories100g: 178, protein100g: 11,  carbs100g: 14,  fat100g: 9,   fiber100g: 1.5, servingSizeG: 200 },
  // Eastern European
  { name: 'Pierogi (Potato & Cheese)',   calories100g: 213, protein100g: 7,   carbs100g: 32,  fat100g: 7,   fiber100g: 1.5, servingSizeG: 100 },
  { name: 'Beef Stroganoff',             calories100g: 175, protein100g: 10,  carbs100g: 8,   fat100g: 11,  fiber100g: 0.7, servingSizeG: 250 },
  { name: 'Goulash',                     calories100g: 110, protein100g: 9,   carbs100g: 7,   fat100g: 5,   fiber100g: 1.2, servingSizeG: 300 },
  { name: 'Borscht',                     calories100g: 36,  protein100g: 1.4, carbs100g: 6.5, fat100g: 0.8, fiber100g: 1.5, servingSizeG: 250 },
  // German
  { name: 'Schnitzel (Pork)',            calories100g: 285, protein100g: 21,  carbs100g: 13,  fat100g: 17,  fiber100g: 0.6, servingSizeG: 180 },
  { name: 'Bratwurst',                   calories100g: 297, protein100g: 12,  carbs100g: 2.2, fat100g: 27,  fiber100g: 0,   servingSizeG: 85 },
  { name: 'Sauerkraut',                  calories100g: 19,  protein100g: 0.9, carbs100g: 4.3, fat100g: 0.1, fiber100g: 2.9, servingSizeG: 50 },
  { name: 'Pretzel (Soft, Salted)',      calories100g: 338, protein100g: 8,   carbs100g: 71,  fat100g: 3,   fiber100g: 3,   servingSizeG: 80 },
  // Latin American
  { name: 'Empanada (Beef)',             calories100g: 295, protein100g: 9,   carbs100g: 28,  fat100g: 16,  fiber100g: 1.5, servingSizeG: 100 },
  { name: 'Arepa (Cheese)',              calories100g: 224, protein100g: 7,   carbs100g: 30,  fat100g: 8,   fiber100g: 1.8, servingSizeG: 110 },
  { name: 'Ceviche',                     calories100g: 84,  protein100g: 15,  carbs100g: 4,   fat100g: 0.8, fiber100g: 0.5, servingSizeG: 200 },
  { name: 'Plantains (Fried)',           calories100g: 215, protein100g: 1.5, carbs100g: 36,  fat100g: 8,   fiber100g: 3,   servingSizeG: 100 },
  // Breakfast classics
  { name: 'Eggs Benedict',               calories100g: 226, protein100g: 11,  carbs100g: 15,  fat100g: 13,  fiber100g: 0.8, servingSizeG: 175 },
  { name: 'Omelette (3-egg, Cheese)',    calories100g: 191, protein100g: 14,  carbs100g: 2,   fat100g: 14,  fiber100g: 0,   servingSizeG: 200 },
  { name: 'Omelette (Spanish/Tortilla)', calories100g: 187, protein100g: 8,   carbs100g: 13,  fat100g: 12,  fiber100g: 1.2, servingSizeG: 200 },
  { name: 'Frittata',                    calories100g: 159, protein100g: 11,  carbs100g: 3.5, fat100g: 11,  fiber100g: 0.5, servingSizeG: 180 },
  { name: 'Scrambled Eggs',              calories100g: 149, protein100g: 10,  carbs100g: 1.6, fat100g: 11,  fiber100g: 0,   servingSizeG: 100 },
  { name: 'Avocado Toast',               calories100g: 194, protein100g: 5,   carbs100g: 22,  fat100g: 10,  fiber100g: 5,   servingSizeG: 130 },
  { name: 'Yogurt Parfait',              calories100g: 110, protein100g: 4.5, carbs100g: 19,  fat100g: 2,   fiber100g: 1.2, servingSizeG: 250 },
  { name: 'Granola',                     calories100g: 471, protein100g: 10,  carbs100g: 64,  fat100g: 20,  fiber100g: 7,   servingSizeG: 50 },
  // Desserts
  { name: 'Cheesecake',                  calories100g: 321, protein100g: 5.5, carbs100g: 26,  fat100g: 22,  fiber100g: 0.4, servingSizeG: 100 },
  { name: 'Chocolate Brownie',           calories100g: 466, protein100g: 6,   carbs100g: 60,  fat100g: 23,  fiber100g: 2,   servingSizeG: 60 },
  { name: 'Chocolate Chip Cookie',       calories100g: 488, protein100g: 5.5, carbs100g: 64,  fat100g: 24,  fiber100g: 2.2, servingSizeG: 30 },
  { name: 'Ice Cream (Vanilla)',         calories100g: 207, protein100g: 3.5, carbs100g: 24,  fat100g: 11,  fiber100g: 0.7, servingSizeG: 130 },
  { name: 'Donut (Glazed)',              calories100g: 421, protein100g: 4.5, carbs100g: 51,  fat100g: 22,  fiber100g: 1.3, servingSizeG: 55 },
  { name: 'Apple Pie',                   calories100g: 237, protein100g: 2,   carbs100g: 34,  fat100g: 11,  fiber100g: 1.5, servingSizeG: 125 },
];

/**
 * Pre-hydrated FoodItem list with stable IDs. Filter via `searchGlobalFoods`.
 */
export const GLOBAL_FOODS: import('./api/openFoodFacts').FoodItem[] = raw.map((f, i) => ({
  id: `global-${i}`,
  ...f,
}));

/**
 * Fuzzy search over the global foods DB.
 * - Case-insensitive
 * - Word-boundary matching ("chick" → "Chicken Biryani", "Fried Chicken")
 * - Multi-word query support ("chicken curry" matches both words present)
 */
export function searchGlobalFoods(query: string): import('./api/openFoodFacts').FoodItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  // Score each food: +10 per matched term (substring), +5 bonus for term at start
  const scored: { food: typeof GLOBAL_FOODS[number]; score: number }[] = [];
  for (const food of GLOBAL_FOODS) {
    const name = food.name.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (name.includes(term)) {
        score += 10;
        if (name.startsWith(term) || name.includes(` ${term}`)) score += 5;
      } else {
        score = 0;
        break; // all terms must match
      }
    }
    if (score > 0) scored.push({ food, score });
  }
  // Sort: best score first, alphabetical as tiebreaker
  scored.sort((a, b) => (b.score - a.score) || a.food.name.localeCompare(b.food.name));
  return scored.map((s) => s.food);
}
