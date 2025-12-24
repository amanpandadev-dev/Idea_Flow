-- Add conversation embedding column to conversation_search_state
-- This enables persistent semantic context across conversation reloads

-- Add conversation embedding column (JSONB for flexibility)
ALTER TABLE conversation_search_state 
ADD COLUMN IF NOT EXISTS conversation_embedding JSONB;

-- Add metadata columns for tracking
ALTER TABLE conversation_search_state
ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS embedding_message_count INTEGER DEFAULT 0;

-- Add index for faster retrieval by conversation_id
CREATE INDEX IF NOT EXISTS idx_conversation_embedding 
ON conversation_search_state(conversation_id) 
WHERE conversation_embedding IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN conversation_search_state.conversation_embedding IS 
'Accumulated semantic embedding vector for conversation context (768-dim array stored as JSONB)';

COMMENT ON COLUMN conversation_search_state.embedding_updated_at IS 
'Timestamp when conversation embedding was last updated';

COMMENT ON COLUMN conversation_search_state.embedding_message_count IS 
'Number of messages that have contributed to the conversation embedding';
