CREATE TABLE IF NOT EXISTS live_frames (
 device_id uuid PRIMARY KEY REFERENCES device_links(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 stream_id text NOT NULL,
 sequence integer NOT NULL,
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL,
 payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS live_frames_user ON live_frames(user_id);
