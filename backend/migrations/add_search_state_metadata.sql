-- Migration: Add metadata storage to conversation_search_state
-- This enables full metadata persistence (technologies, years, etc.)

ALTER TABLE conversation_search_state
ADD COLUMN IF NOT EXISTS base_results_metadata JSONB DEFAULT '[]';

-- Add comment
COMMENT ON COLUMN conversation_search_state.base_results_metadata IS 
'Stores full ChromaDB metadata for base results including technologies, years, domains, etc.';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Added base_results_metadata column to conversation_search_state';
END $$;
