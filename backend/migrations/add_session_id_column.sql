-- ============================================
-- Add session_id column to prosearch_conversations
-- Run this to update the existing table
-- ============================================

BEGIN;

-- Add session_id column (nullable to allow existing rows)
ALTER TABLE prosearch_conversations 
ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_session_id 
ON prosearch_conversations(session_id);

-- Add comment
COMMENT ON COLUMN prosearch_conversations.session_id IS 'Links to chat_sessions for history integration';

COMMIT;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'prosearch_conversations' 
AND column_name = 'session_id';

DO $$
BEGIN
    RAISE NOTICE '✅ prosearch_conversations.session_id column added successfully!';
END $$;
