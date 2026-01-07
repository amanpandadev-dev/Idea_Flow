-- Migration: Add chroma_scores column to prosearch_conversations
-- This enables persistence of ChromaDB similarity scores for consistent filtering

-- Add chroma_scores column (stores normalized scores 0-99 for each result)
ALTER TABLE prosearch_conversations 
ADD COLUMN IF NOT EXISTS base_result_scores INTEGER[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN prosearch_conversations.base_result_scores IS 
'Stores normalized similarity scores (0-99) for each idea in base_result_ids. Scores are position-aligned with base_result_ids array.';

DO $$
BEGIN
    RAISE NOTICE '✅ Added base_result_scores column to prosearch_conversations';
END $$;
