-- Ensure CASCADE DELETE is properly set up for chat_messages
-- This migration ensures that when a chat_session is deleted, all associated messages are deleted

-- First, check if the constraint exists and drop it if it doesn't have CASCADE
DO $$
BEGIN
    -- Drop the existing foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chat_messages_session_id_fkey' 
        AND table_name = 'chat_messages'
    ) THEN
        ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_session_id_fkey;
    END IF;
END $$;

-- Add the foreign key constraint with CASCADE DELETE
ALTER TABLE chat_messages
ADD CONSTRAINT chat_messages_session_id_fkey
FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE;

-- Verify the constraint
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'chat_messages'
    AND kcu.column_name = 'session_id';
