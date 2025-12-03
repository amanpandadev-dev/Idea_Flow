-- Rollback: Drop conversation tables
-- Version: 001
-- Date: 2024-01-15
-- Description: Removes conversation history tables and related objects

BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_message_count ON conversation_messages;
DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON conversations;

-- Drop functions
DROP FUNCTION IF EXISTS update_message_count();
DROP FUNCTION IF EXISTS update_conversation_timestamp();

-- Drop indexes
DROP INDEX IF EXISTS idx_messages_content_search;
DROP INDEX IF EXISTS idx_messages_timestamp;
DROP INDEX IF EXISTS idx_messages_conversation_id;
DROP INDEX IF EXISTS idx_conversations_tags;
DROP INDEX IF EXISTS idx_conversations_updated_at;
DROP INDEX IF EXISTS idx_conversations_created_at;
DROP INDEX IF EXISTS idx_conversations_user_id;

-- Drop tables (cascade will remove foreign key constraints)
DROP TABLE IF EXISTS conversation_messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

COMMIT;
