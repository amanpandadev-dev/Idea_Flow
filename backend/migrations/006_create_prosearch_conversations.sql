-- 006_create_prosearch_conversations.sql
-- ProSearch Rebuild: Conversational semantic search with deterministic filtering
-- This table stores conversation state for ProSearch sessions

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create prosearch_conversations table
CREATE TABLE IF NOT EXISTS prosearch_conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_query TEXT NOT NULL,
  base_result_ids INTEGER[] NOT NULL,
  current_result_ids INTEGER[] NOT NULL,
  applied_filters JSONB NOT NULL DEFAULT '{"technologies":[],"businessGroups":[],"themes":[],"years":[]}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_conversation_id 
  ON prosearch_conversations(conversation_id);

CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_created_at 
  ON prosearch_conversations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_updated_at 
  ON prosearch_conversations(updated_at DESC);

-- Add comment for documentation
COMMENT ON TABLE prosearch_conversations IS 'Stores conversation state for ProSearch semantic search sessions with deterministic filtering';
COMMENT ON COLUMN prosearch_conversations.conversation_id IS 'Unique identifier for the conversation';
COMMENT ON COLUMN prosearch_conversations.base_query IS 'Original user query that initiated the semantic search';
COMMENT ON COLUMN prosearch_conversations.base_result_ids IS 'Ordered array of idea IDs from initial ChromaDB search';
COMMENT ON COLUMN prosearch_conversations.current_result_ids IS 'Ordered array of idea IDs after applying filters';
COMMENT ON COLUMN prosearch_conversations.applied_filters IS 'JSONB object storing current filter state (technologies, businessGroups, themes, years)';
COMMENT ON COLUMN prosearch_conversations.created_at IS 'Timestamp when conversation was created';
COMMENT ON COLUMN prosearch_conversations.updated_at IS 'Timestamp when conversation was last updated';
