-- ============================================
-- ProSearch Complete Database Schema
-- Run this in pgAdmin to create all required tables
-- ============================================

BEGIN;

-- ============================================
-- 1. CHAT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);

COMMENT ON TABLE chat_sessions IS 'Chat history sessions for ProSearch';
COMMENT ON COLUMN chat_sessions.user_id IS 'References users.emp_id';

-- ============================================
-- 2. CHAT MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

COMMENT ON TABLE chat_messages IS 'Messages within chat sessions';
COMMENT ON COLUMN chat_messages.metadata IS 'Stores conversationId, resultsCount, etc.';

-- ============================================
-- 3. PROSEARCH CONVERSATIONS TABLE (Enhanced)
-- ============================================
CREATE TABLE IF NOT EXISTS prosearch_conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_session_id ON prosearch_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_created_at ON prosearch_conversations(created_at DESC);

COMMENT ON TABLE prosearch_conversations IS 'ProSearch conversation state - one vector search per conversation';
COMMENT ON COLUMN prosearch_conversations.session_id IS 'Links to chat_sessions for history integration';
COMMENT ON COLUMN prosearch_conversations.base_result_ids IS 'Immutable IDs from initial semantic search';
COMMENT ON COLUMN prosearch_conversations.current_result_ids IS 'Filtered subset after applying filters';

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
SELECT tablename FROM pg_tables 
WHERE tablename IN ('chat_sessions', 'chat_messages', 'prosearch_conversations')
ORDER BY tablename;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ ProSearch schema created successfully!';
    RAISE NOTICE '📊 Tables: chat_sessions, chat_messages, prosearch_conversations';
    RAISE NOTICE '🔗 All tables linked with proper foreign keys';
    RAISE NOTICE '🚀 Ready for ProSearch implementation!';
END $$;
