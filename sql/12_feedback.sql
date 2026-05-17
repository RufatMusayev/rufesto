-- Feedback table — stores user/guest feedback from the site
CREATE TABLE IF NOT EXISTS feedback (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  message    TEXT NOT NULL,
  rating     INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert feedback"
  ON feedback FOR INSERT
  WITH CHECK (rating >= 1 AND rating <= 5 AND LENGTH(message) > 0);

CREATE POLICY "Staff can view feedback"
  ON feedback FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM staff WHERE staff.user_id = auth.uid())
  );
