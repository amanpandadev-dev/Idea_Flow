-- ============================================
-- ProSearch Conversations Table
-- Clean, deterministic conversation state
-- ============================================

BEGIN;

-- Single table for ProSearch conversation state
CREATE TABLE IF NOT EXISTS prosearch_conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_query TEXT NOT NULL,
    base_result_ids INTEGER[] NOT NULL,
    current_result_ids INTEGER[] NOT NULL,
    applied_filters JSONB NOT NULL DEFAULT '{
        "technologies": [],
        "businessGroups": [],
        "themes": [],
        "years": []
    }'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_created_at 
    ON prosearch_conversations(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE prosearch_conversations IS 'ProSearch conversation state - stores base search results and filter history';
COMMENT ON COLUMN prosearch_conversations.base_query IS 'Original semantic search query';
COMMENT ON COLUMN prosearch_conversations.base_result_ids IS 'Immutable IDs from initial vector search';
COMMENT ON COLUMN prosearch_conversations.current_result_ids IS 'Filtered subset of base_result_ids';
COMMENT ON COLUMN prosearch_conversations.applied_filters IS 'Current filter state (technologies, businessGroups, themes, years)';

COMMIT;

-- Verification
SELECT 
    tablename, 
    schemaname 
FROM pg_tables 
WHERE tablename = 'prosearch_conversations';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ ProSearch conversations table created successfully!';
    RAISE NOTICE '📊 Ready for deterministic conversational search';
END $$;
