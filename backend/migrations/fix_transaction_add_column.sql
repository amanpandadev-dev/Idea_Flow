-- ============================================
-- FIX: Transaction Aborted Error
-- Run these commands ONE BY ONE or selecting all
-- ============================================

-- 1. Reset any failed transaction
ROLLBACK;

-- 2. Add the column (if it doesn't exist)
ALTER TABLE prosearch_conversations 
ADD COLUMN IF NOT EXISTS session_id INTEGER;

-- 3. Add the foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_prosearch_conversations_session_id'
    ) THEN
        ALTER TABLE prosearch_conversations
        ADD CONSTRAINT fk_prosearch_conversations_session_id
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Create the index
CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_session_id 
ON prosearch_conversations(session_id);

-- 5. Verification
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'prosearch_conversations' 
AND column_name = 'session_id';
