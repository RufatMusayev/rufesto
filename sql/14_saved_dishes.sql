CREATE TABLE IF NOT EXISTS saved_dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, dish_id)
);

ALTER TABLE saved_dishes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved dishes"
  ON saved_dishes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save dishes"
  ON saved_dishes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave dishes"
  ON saved_dishes FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_saved_dishes_user ON saved_dishes(user_id);
CREATE INDEX idx_saved_dishes_dish ON saved_dishes(dish_id);
