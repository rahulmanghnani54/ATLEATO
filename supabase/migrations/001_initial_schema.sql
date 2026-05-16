-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  goal TEXT CHECK (goal IN ('lose_fat','build_muscle','maintain','athletic_performance')) NOT NULL DEFAULT 'build_muscle',
  gender TEXT CHECK (gender IN ('male','female','other')),
  date_of_birth DATE,
  height_cm NUMERIC(5,1),
  weight_kg NUMERIC(5,2),
  activity_level TEXT CHECK (activity_level IN ('sedentary','lightly_active','moderately_active','very_active','extremely_active')) NOT NULL DEFAULT 'moderately_active',
  selected_program TEXT NOT NULL DEFAULT 'cbum_evolved',
  tdee INT,
  protein_g INT,
  carbs_g INT,
  fat_g INT,
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recovery check-ins
CREATE TABLE recovery_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  sleep_hours NUMERIC(3,1),
  sleep_quality INT CHECK (sleep_quality BETWEEN 1 AND 5),
  soreness INT CHECK (soreness BETWEEN 1 AND 5),
  energy INT CHECK (energy BETWEEN 1 AND 5),
  stress INT CHECK (stress BETWEEN 1 AND 5),
  recovery_score INT CHECK (recovery_score BETWEEN 0 AND 100),
  volume_modifier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Wearable data
CREATE TABLE wearable_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  steps INT,
  hrv_ms NUMERIC(6,2),
  resting_hr INT,
  sleep_hours NUMERIC(3,1),
  active_calories INT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Nutrition logs
CREATE TABLE nutrition_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  meal_type TEXT CHECK (meal_type IN ('breakfast','lunch','dinner','snack')) NOT NULL,
  food_name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  serving_size_g NUMERIC(8,2),
  calories NUMERIC(8,2) NOT NULL,
  protein_g NUMERIC(8,2) NOT NULL,
  carbs_g NUMERIC(8,2) NOT NULL,
  fat_g NUMERIC(8,2) NOT NULL,
  fiber_g NUMERIC(8,2),
  sugar_g NUMERIC(8,2),
  sodium_mg NUMERIC(8,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Water logs
CREATE TABLE water_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  amount_ml INT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workout logs
CREATE TABLE workout_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  program_id TEXT NOT NULL,
  workout_name TEXT NOT NULL,
  date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INT,
  total_volume_kg NUMERIC(10,2),
  average_rpe NUMERIC(3,1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exercise sets
CREATE TABLE exercise_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_log_id UUID REFERENCES workout_logs(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  set_number INT NOT NULL,
  reps INT,
  weight_kg NUMERIC(6,2),
  rpe NUMERIC(3,1),
  form_score INT CHECK (form_score BETWEEN 0 AND 100),
  is_warmup BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Form sessions (camera recordings)
CREATE TABLE form_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  duration_seconds INT,
  average_form_score NUMERIC(5,2),
  key_issues TEXT[],
  video_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Measurements (body progress)
CREATE TABLE measurements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  weight_kg NUMERIC(5,2),
  body_fat_pct NUMERIC(4,1),
  chest_cm NUMERIC(5,1),
  waist_cm NUMERIC(5,1),
  hips_cm NUMERIC(5,1),
  arms_cm NUMERIC(5,1),
  thighs_cm NUMERIC(5,1),
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Personal records
CREATE TABLE personal_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  weight_kg NUMERIC(6,2) NOT NULL,
  reps INT NOT NULL,
  one_rep_max_kg NUMERIC(6,2),
  achieved_at DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, exercise_name, achieved_at)
);

-- Progression suggestions
CREATE TABLE progression_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  current_weight_kg NUMERIC(6,2),
  suggested_weight_kg NUMERIC(6,2),
  reasoning TEXT,
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User achievements
CREATE TABLE user_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_key TEXT NOT NULL,
  achieved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_key)
);

-- AI chat messages
CREATE TABLE chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  persona TEXT NOT NULL,
  role TEXT CHECK (role IN ('user','assistant')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_nutrition_logs_user_date ON nutrition_logs(user_id, date);
CREATE INDEX idx_workout_logs_user_date ON workout_logs(user_id, date);
CREATE INDEX idx_exercise_sets_workout ON exercise_sets(workout_log_id);
CREATE INDEX idx_recovery_user_date ON recovery_checkins(user_id, date);
CREATE INDEX idx_measurements_user_date ON measurements(user_id, date);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id, persona, created_at);
CREATE INDEX idx_water_logs_user_date ON water_logs(user_id, date);
CREATE INDEX idx_personal_records_user ON personal_records(user_id, exercise_name);
CREATE INDEX idx_progression_user ON progression_suggestions(user_id, exercise_name, applied);
CREATE INDEX idx_exercise_sets_user_exercise ON exercise_sets(user_id, exercise_name, completed_at DESC);

-- Updated_at trigger for profiles
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
