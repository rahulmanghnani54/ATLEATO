-- Enforce input length limits missed in the initial schema.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_full_name_len  CHECK (char_length(full_name)  <= 255),
  ADD CONSTRAINT profiles_avatar_url_len CHECK (char_length(avatar_url)  <= 2048);

ALTER TABLE nutrition_logs
  ADD CONSTRAINT nutrition_food_name_len CHECK (char_length(food_name) <= 500),
  ADD CONSTRAINT nutrition_brand_len     CHECK (char_length(brand)     <= 255),
  ADD CONSTRAINT nutrition_barcode_len   CHECK (char_length(barcode)   <= 64);

ALTER TABLE workout_logs
  ADD CONSTRAINT workout_name_len  CHECK (char_length(workout_name)  <= 255),
  ADD CONSTRAINT workout_notes_len CHECK (char_length(notes)         <= 2000);

ALTER TABLE exercise_sets
  ADD CONSTRAINT exercise_name_len CHECK (char_length(exercise_name) <= 255);

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_content_len CHECK (char_length(content) <= 4000);

ALTER TABLE personal_records
  ADD CONSTRAINT pr_exercise_name_len CHECK (char_length(exercise_name) <= 255);

ALTER TABLE progression_suggestions
  ADD CONSTRAINT progression_exercise_name_len CHECK (char_length(exercise_name) <= 255),
  ADD CONSTRAINT progression_reasoning_len     CHECK (char_length(reasoning)     <= 2000);

-- Clamp numeric inputs to sane physiological ranges.
ALTER TABLE recovery_checkins
  ADD CONSTRAINT recovery_sleep_range   CHECK (sleep_hours  BETWEEN 0 AND 24),
  ADD CONSTRAINT recovery_score_range   CHECK (recovery_score BETWEEN 0 AND 100);

ALTER TABLE exercise_sets
  ADD CONSTRAINT sets_weight_range CHECK (weight_kg BETWEEN 0 AND 1000),
  ADD CONSTRAINT sets_reps_range   CHECK (reps       BETWEEN 0 AND 200),
  ADD CONSTRAINT sets_rpe_range    CHECK (rpe        BETWEEN 0 AND 10);

ALTER TABLE measurements
  ADD CONSTRAINT measurements_weight_range CHECK (weight_kg    BETWEEN 0 AND 500),
  ADD CONSTRAINT measurements_bf_range     CHECK (body_fat_pct BETWEEN 0 AND 100);
