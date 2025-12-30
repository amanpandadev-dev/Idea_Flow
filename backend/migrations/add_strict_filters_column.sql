-- Migration: Add strict_filters column to conversation_search_state
-- This enables persistence of strict AND filters across session switches

-- Add strict_filters column if it doesn't exist
ALTER TABLE conversation_search_state 
ADD COLUMN IF NOT EXISTS strict_filters JSONB DEFAULT '{}';

-- Create GIN index for efficient JSON queries on strict_filters
CREATE INDEX IF NOT EXISTS idx_strict_filters 
ON conversation_search_state USING GIN (strict_filters);

-- Add comment for documentation
COMMENT ON COLUMN conversation_search_state.strict_filters IS 
'Stores accumulated strict AND filters: {techStack: [], years: [], concepts: [], businessGroups: [], themes: []}. All filters must match for ideas to be returned.';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ strict_filters column added to conversation_search_state table';
    RAISE NOTICE '✅ GIN index created for strict_filters';
END $$;
