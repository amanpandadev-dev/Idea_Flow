-- Migration: Create user search context table for persistent filter state
-- This table stores user's search context, filters, and results for session persistence

CREATE TABLE IF NOT EXISTS public.user_search_contexts (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    context_data JSONB NOT NULL DEFAULT '{}',
    -- Store last search results for quick retrieval
    cached_results JSONB,
    -- Store tagged/bookmarked ideas
    tagged_ideas JSONB DEFAULT '[]',
    -- Research mode state
    research_mode BOOLEAN DEFAULT FALSE,
    research_context TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_search_contexts_unique UNIQUE (user_id, session_id)
);

-- Index for fast user context lookup
CREATE INDEX IF NOT EXISTS idx_user_search_contexts_user_id ON user_search_contexts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_search_contexts_updated ON user_search_contexts(updated_at DESC);

-- Table for storing user's tagged/bookmarked search results
CREATE TABLE IF NOT EXISTS public.search_result_tags (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    idea_id INTEGER NOT NULL REFERENCES ideas(idea_id) ON DELETE CASCADE,
    tag VARCHAR(100) NOT NULL,
    notes TEXT,
    context_snapshot JSONB, -- Store the search context when tagged
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT search_result_tags_unique UNIQUE (user_id, idea_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_search_result_tags_user ON search_result_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_search_result_tags_idea ON search_result_tags(idea_id);

-- Table for search history with results caching
CREATE TABLE IF NOT EXISTS public.search_history (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    filters JSONB DEFAULT '{}',
    result_count INTEGER DEFAULT 0,
    result_ids INTEGER[] DEFAULT '{}', -- Array of idea_ids for quick result retrieval
    processing_time_ms INTEGER,
    search_type VARCHAR(20) DEFAULT 'semantic', -- 'semantic', 'keyword', 'hybrid'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_session ON search_history(session_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);

COMMENT ON TABLE user_search_contexts IS 'Stores persistent user search context and filter state';
COMMENT ON TABLE search_result_tags IS 'User-created tags and notes on search results';
COMMENT ON TABLE search_history IS 'Search query history with cached result IDs';
