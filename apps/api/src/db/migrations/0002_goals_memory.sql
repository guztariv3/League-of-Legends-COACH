CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric text NOT NULL,
  target double precision NOT NULL,
  baseline_rate double precision NOT NULL,
  status text NOT NULL,
  source text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goals_user ON goals (user_id, status);

CREATE TABLE coach_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL,
  content text NOT NULL,
  ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_memory_user ON coach_memory (user_id, category);
