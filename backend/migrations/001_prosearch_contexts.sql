-- ProSearch Context Persistence Migration
-- Creates table for storing conversation context across sessions

-- Create prosearch_contexts table
CREATE TABLE IF NOT EXISTS prosearch_contexts (
  session_id VARCHAR(255) PRIMARY KEY,
  payload JSONB NOT NULL,  -- Stores full context object
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_prosearch_contexts_updated 
  ON prosearch_contexts(updated_at DESC);

-- Create index on JSONB payload for potential future queries
CREATE INDEX IF NOT EXISTS idx_prosearch_contexts_payload_gin 
  ON prosearch_contexts USING GIN (payload);

-- Add comment for documentation
COMMENT ON TABLE prosearch_contexts IS 'Stores persistent conversation context for ProSearch sessions';
COMMENT ON COLUMN prosearch_contexts.session_id IS 'Unique session identifier (could be chat session ID or UUID)';
COMMENT ON COLUMN prosearch_contexts.payload IS 'JSON payload containing baseQueryText, cumulativeFilters, lastFinalResultIds, history';

-- Example payload structure:
-- {
--   "sessionId": "sess_123",
--   "baseQueryText": "AI projects using Python",
--   "cumulativeFilters": { "techStack": ["Python"], "domain": "AI" },
--   "lastFinalResultIds": ["IDEA-1", "IDEA-2", "IDEA-3"],
--   "history": [
--     {"role": "user", "text": "AI projects", "timestamp": "2024-01-01T10:00:00Z"},
--     {"role": "assistant", "text": "Found 25 results", "timestamp": "2024-01-01T10:00:01Z"}
--   ],
--   "timestampUpdated": "2024-01-01T10:00:01Z"
-- }
