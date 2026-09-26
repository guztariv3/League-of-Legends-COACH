-- Challenges (F6): short tries on one measurable habit ("3 of your next 5 games").
-- The target is fixed when accepted; progress is computed from the games played since.
CREATE TABLE challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric text NOT NULL,
  target double precision NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX challenges_user ON challenges (user_id, status);
