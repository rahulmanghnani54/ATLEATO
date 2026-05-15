-- physique_checkins: one row per check-in session
CREATE TABLE physique_checkins (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date             DATE NOT NULL,
  cadence          TEXT CHECK (cadence IN ('weekly','biweekly','monthly')) NOT NULL DEFAULT 'biweekly',
  pose_count       INT NOT NULL DEFAULT 1,
  -- Encrypted blob paths in Supabase Storage bucket "physique-photos"
  front_path       TEXT NOT NULL,
  side_path        TEXT,
  back_path        TEXT,
  front_thumb      TEXT NOT NULL,
  side_thumb       TEXT,
  back_thumb       TEXT,
  -- Auto-scored on upload (nullable until edge function returns)
  fullness_score   INT CHECK (fullness_score BETWEEN 1 AND 10),
  leanness_score   INT CHECK (leanness_score BETWEEN 1 AND 10),
  symmetry_score   INT CHECK (symmetry_score BETWEEN 1 AND 10),
  auto_narrative   TEXT,
  scored_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- physique_analyses: on-demand comparison between two check-ins
CREATE TABLE physique_analyses (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  checkin_a_id    UUID REFERENCES physique_checkins(id) ON DELETE CASCADE NOT NULL,
  checkin_b_id    UUID REFERENCES physique_checkins(id) ON DELETE CASCADE NOT NULL,
  fullness_a      INT CHECK (fullness_a BETWEEN 1 AND 10),
  leanness_a      INT CHECK (leanness_a BETWEEN 1 AND 10),
  symmetry_a      INT CHECK (symmetry_a BETWEEN 1 AND 10),
  fullness_b      INT CHECK (fullness_b BETWEEN 1 AND 10),
  leanness_b      INT CHECK (leanness_b BETWEEN 1 AND 10),
  symmetry_b      INT CHECK (symmetry_b BETWEEN 1 AND 10),
  narrative       TEXT NOT NULL,
  persona         TEXT NOT NULL DEFAULT 'cbum',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT different_checkins CHECK (checkin_a_id <> checkin_b_id),
  UNIQUE(checkin_a_id, checkin_b_id)
);

-- Indexes
CREATE INDEX physique_checkins_user_date_idx ON physique_checkins (user_id, date DESC);
CREATE INDEX physique_analyses_user_idx ON physique_analyses (user_id);
CREATE INDEX physique_analyses_checkin_a_idx ON physique_analyses (checkin_a_id);
CREATE INDEX physique_analyses_checkin_b_idx ON physique_analyses (checkin_b_id);

-- RLS
ALTER TABLE physique_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE physique_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physique_checkins_own" ON physique_checkins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "physique_analyses_own" ON physique_analyses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM physique_checkins WHERE id = checkin_a_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM physique_checkins WHERE id = checkin_b_id AND user_id = auth.uid())
  );

-- Storage bucket (run in Supabase dashboard or via CLI)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('physique-photos', 'physique-photos', false);
-- CREATE POLICY "physique_storage_own" ON storage.objects
--   FOR ALL USING (bucket_id = 'physique-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
