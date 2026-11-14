-- Stores no customer question, AI response, email, phone number, or raw user ID.
-- A record can be rated once by the same verified tester/subscriber within 7 days.
CREATE TABLE IF NOT EXISTS ai_answer_feedback (
  id TEXT PRIMARY KEY,
  user_key_hash TEXT NOT NULL,
  rating TEXT CHECK(rating IN ('helpful','unhelpful')),
  created_at INTEGER NOT NULL,
  rated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ai_answer_feedback_created ON ai_answer_feedback(created_at);
