-- 004_create_prosearch_contexts.sql

CREATE TABLE IF NOT EXISTS prosearch_contexts (
  session_id TEXT PRIMARY KEY,
  payload JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Index on updated_at for cleaning up old contexts
CREATE INDEX IF NOT EXISTS idx_prosearch_contexts_updated_at ON prosearch_contexts(updated_at);
