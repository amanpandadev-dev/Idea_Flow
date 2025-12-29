-- Migration: Remove FK constraint from conversation_search_state
-- The conversation_id in Pro Search is generated independently and does not link to the 'conversations' table (Agent system)

BEGIN;

-- Drop foreign key constraint if it exists
ALTER TABLE conversation_search_state
DROP CONSTRAINT IF EXISTS conversation_search_state_conversation_id_fkey;

COMMIT;
