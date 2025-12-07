-- Pro Search Phase 2: Database Schema Migration
-- Creates tables for context persistence, tagging, and collections

-- 1. User Search Contexts Table
-- Stores user's active filters and search state
CREATE TABLE IF NOT EXISTS user_search_contexts (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_user_session UNIQUE(user_id, session_id)
);

CREATE INDEX idx_user_search_contexts_user_id ON user_search_contexts(user_id);
CREATE INDEX idx_user_search_contexts_session_id ON user_search_contexts(session_id);
CREATE INDEX idx_user_search_contexts_updated_at ON user_search_contexts(updated_at DESC);

-- 2. Idea Tags Table
-- Allows users to tag individual ideas for organization
CREATE TABLE IF NOT EXISTS idea_tags (
    id SERIAL PRIMARY KEY,
    idea_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    tag VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_user_idea_tag UNIQUE(user_id, idea_id, tag)
);

CREATE INDEX idx_idea_tags_idea_id ON idea_tags(idea_id);
CREATE INDEX idx_idea_tags_user_id ON idea_tags(user_id);
CREATE INDEX idx_idea_tags_tag ON idea_tags(tag);

-- 3. Idea Collections Table
-- Named groups of ideas for research/organization
CREATE TABLE IF NOT EXISTS idea_collections (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_user_collection_name UNIQUE(user_id, name)
);

CREATE INDEX idx_idea_collections_user_id ON idea_collections(user_id);

-- 4. Collection Ideas Junction Table
CREATE TABLE IF NOT EXISTS collection_ideas (
    collection_id INTEGER NOT NULL REFERENCES idea_collections(id) ON DELETE CASCADE,
    idea_id INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT NOW(),
    notes TEXT,
    PRIMARY KEY (collection_id, idea_id)
);

CREATE INDEX idx_collection_ideas_collection_id ON collection_ideas(collection_id);
CREATE INDEX idx_collection_ideas_idea_id ON collection_ideas(idea_id);

-- 5. Extend chat_sessions table for result preservation
-- Note: Using ALTER TABLE ADD COLUMN IF NOT EXISTS for safety
DO $$ 
BEGIN
    -- Add result_snapshot column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_sessions' AND column_name = 'result_snapshot'
    ) THEN
        ALTER TABLE chat_sessions ADD COLUMN result_snapshot JSONB;
    END IF;
    
    -- Add filter_snapshot column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_sessions' AND column_name = 'filter_snapshot'
    ) THEN
        ALTER TABLE chat_sessions ADD COLUMN filter_snapshot JSONB;
    END IF;
END $$;

-- 6. Performance Indexes for Pro Search Filtering
-- Enable pg_trgm extension FIRST (required for text search indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- These optimize the dynamic filter queries on the ideas table

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_ideas_filter_combo 
ON ideas(business_group, created_at DESC, score DESC) 
WHERE business_group IS NOT NULL;

-- Year-based filtering
CREATE INDEX IF NOT EXISTS idx_ideas_created_year 
ON ideas(EXTRACT(YEAR FROM created_at), score DESC);

-- Text search optimization (requires pg_trgm extension)
CREATE INDEX IF NOT EXISTS idx_ideas_title_trgm 
ON ideas USING gin(title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ideas_summary_trgm 
ON ideas USING gin(summary gin_trgm_ops);

-- 7. Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS update_user_search_contexts_updated_at ON user_search_contexts;
CREATE TRIGGER update_user_search_contexts_updated_at
    BEFORE UPDATE ON user_search_contexts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_collections_updated_at ON idea_collections;
CREATE TRIGGER update_idea_collections_updated_at
    BEFORE UPDATE ON idea_collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Sample data validation queries (for testing)
-- Uncomment to verify schema

-- SELECT 'user_search_contexts' as table_name, COUNT(*) as row_count FROM user_search_contexts
-- UNION ALL
-- SELECT 'idea_tags', COUNT(*) FROM idea_tags
-- UNION ALL
-- SELECT 'idea_collections', COUNT(*) FROM idea_collections
-- UNION ALL
-- SELECT 'collection_ideas', COUNT(*) FROM collection_ideas;

COMMIT;
