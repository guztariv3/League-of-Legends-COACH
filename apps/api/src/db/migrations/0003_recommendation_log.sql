CREATE TABLE recommendation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref text,
  title text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}',
  decision text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendation_log_user ON recommendation_log (user_id, created_at DESC);

ALTER TABLE goals ADD COLUMN closed_at timestamptz;
