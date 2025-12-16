-- Migration: Create conversation search state table
-- This enables search result persistence across chat switches

CREATE TABLE IF NOT EXISTS conversation_search_state (
    conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    base_query TEXT NOT NULL,
    base_result_ids INTEGER[] NOT NULL,
    current_result_ids INTEGER[] NOT NULL,
    applied_filters JSONB DEFAULT '{}',
    base_domain TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversation_search_state_updated 
ON conversation_search_state(updated_at DESC);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_search_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_search_state_timestamp
BEFORE UPDATE ON conversation_search_state
FOR EACH ROW
EXECUTE FUNCTION update_search_state_timestamp();

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ conversation_search_state table created successfully';
END $$;
