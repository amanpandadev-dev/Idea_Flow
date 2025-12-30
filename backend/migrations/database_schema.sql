-- ============================================
-- Innovation Insights Portal - Complete Database Schema
-- Consolidated from all migrations
-- Run this file to set up the entire database
-- ============================================

BEGIN;

-- ============================================
-- CORE TABLES
-- ============================================

-- 1. Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    password_hash TEXT NOT NULL,
    role VARCHAR(64) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS 'Application users with authentication';
COMMENT ON COLUMN users.emp_id IS 'Employee ID - unique identifier';
COMMENT ON COLUMN users.role IS 'User role: user, admin, etc.';

-- 2. Associates Table
-- ============================================
CREATE TABLE IF NOT EXISTS associates (
    associate_id SERIAL PRIMARY KEY,
    account VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    parent_ou VARCHAR(255),
    business_group VARCHAR(255) DEFAULT 'Digital Operations',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE associates IS 'Team members who can be part of idea teams';

-- 3. Ideas Table
-- ============================================
CREATE TABLE IF NOT EXISTS ideas (
    idea_id SERIAL PRIMARY KEY,
    submitter_id INTEGER,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    theme VARCHAR(255),
    challenge_opportunity VARCHAR(255),
    scalability VARCHAR(50),
    novelty VARCHAR(50),
    benefits TEXT,
    risks TEXT,
    responsible_ai VARCHAR(255),
    additional_info TEXT,
    prototype_url VARCHAR(255),
    timeline VARCHAR(50),
    success_metrics TEXT,
    expected_outcomes TEXT,
    scalability_potential VARCHAR(50),
    business_model TEXT,
    competitive_analysis TEXT,
    risk_mitigation TEXT,
    second_file_url VARCHAR(255),
    participation_week VARCHAR(50),
    build_phase VARCHAR(50),
    build_preference VARCHAR(50),
    code_preference VARCHAR(50),
    business_group VARCHAR(200),
    score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ideas IS 'Innovation ideas submitted by users';
COMMENT ON COLUMN ideas.theme IS 'Primary theme/domain of the idea';
COMMENT ON COLUMN ideas.score IS 'Aggregated score for the idea';

-- 4. Idea Team (Join Table)
-- ============================================
CREATE TABLE IF NOT EXISTS idea_team (
    id SERIAL PRIMARY KEY,
    idea_id INTEGER NOT NULL,
    associate_id INTEGER NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    role VARCHAR(128),
    business_group VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT idea_team_idea_associate_unique UNIQUE (idea_id, associate_id)
);

COMMENT ON TABLE idea_team IS 'Many-to-many relationship between ideas and team members';

-- 5. Likes Table
-- ============================================
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    idea_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE,
    FOREIGN KEY (idea_id) REFERENCES ideas(idea_id) ON DELETE CASCADE,
    CONSTRAINT idea_likes_idea_user_unique UNIQUE (idea_id, user_id)
);

COMMENT ON TABLE likes IS 'User likes/votes for ideas';

-- ============================================
-- AGENT TAB TABLES
-- ============================================

-- 6. Agent Sessions Table
-- ============================================
CREATE TABLE IF NOT EXISTS agent_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(255) NOT NULL UNIQUE,
    query TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    result JSONB,
    embedding_provider VARCHAR(20) DEFAULT 'grok',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

COMMENT ON TABLE agent_sessions IS 'Agent search history and job tracking';
COMMENT ON COLUMN agent_sessions.status IS 'Job status: queued, running, completed, failed, cancelled';

-- 7. Conversations Table (Agent Chat History)
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    tags TEXT[] DEFAULT '{}',
    session_id VARCHAR(255),
    document_context JSONB,
    embedding_provider VARCHAR(50) DEFAULT 'llama',
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

COMMENT ON TABLE conversations IS 'Agent conversation threads';

-- 8. Conversation Messages Table
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'agent')),
    content TEXT NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conversation FOREIGN KEY (conversation_id) 
        REFERENCES conversations(id) ON DELETE CASCADE
);

COMMENT ON TABLE conversation_messages IS 'Messages within agent conversations';

-- ============================================
-- MARKET VALIDATION TABLES
-- ============================================

-- 9. Market Validations Table
-- ============================================
CREATE TABLE IF NOT EXISTS market_validations (
    id SERIAL PRIMARY KEY,
    idea_id INTEGER NOT NULL,
    report JSONB NOT NULL,
    created_by VARCHAR(50),
    generated_at TIMESTAMP NOT NULL,
    novelty_score DECIMAL(3,2),
    patent_risk_level VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_idea FOREIGN KEY (idea_id) REFERENCES ideas(idea_id) ON DELETE CASCADE
);

COMMENT ON TABLE market_validations IS 'AI-generated market validation reports for ideas';
COMMENT ON COLUMN market_validations.report IS 'Full JSON report with all validation sections';

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Ideas indexes
CREATE INDEX IF NOT EXISTS idx_ideas_theme ON ideas(theme);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_business_group ON ideas(business_group);
CREATE INDEX IF NOT EXISTS idx_ideas_score ON ideas(score DESC);

-- Idea team indexes
CREATE INDEX IF NOT EXISTS idx_idea_team_idea_id ON idea_team(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_team_associate_id ON idea_team(associate_id);

-- Likes indexes
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_idea_id ON likes(idea_id);

-- Agent sessions indexes
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_job_id ON agent_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);

-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_tags ON conversations USING GIN(tags);

-- Conversation messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON conversation_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_content_search ON conversation_messages USING GIN(to_tsvector('english', content));

-- Market validations indexes
CREATE INDEX IF NOT EXISTS idx_market_validations_idea_id ON market_validations(idea_id);
CREATE INDEX IF NOT EXISTS idx_market_validations_created_at ON market_validations(created_at DESC);

-- ============================================
-- TRIGGERS AND FUNCTIONS
-- ============================================

-- Update conversation timestamp trigger
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON conversations;

CREATE TRIGGER trigger_update_conversation_timestamp
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_timestamp();

-- Update message count trigger
CREATE OR REPLACE FUNCTION update_message_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE conversations 
        SET message_count = message_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.conversation_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE conversations 
        SET message_count = message_count - 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.conversation_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_message_count ON conversation_messages;

CREATE TRIGGER trigger_update_message_count
    AFTER INSERT OR DELETE ON conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_message_count();

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- List all tables
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Count records in each table
SELECT 
    'users' as table_name, COUNT(*) as record_count FROM users
UNION ALL SELECT 'ideas', COUNT(*) FROM ideas
UNION ALL SELECT 'associates', COUNT(*) FROM associates
UNION ALL SELECT 'idea_team', COUNT(*) FROM idea_team
UNION ALL SELECT 'likes', COUNT(*) FROM likes
UNION ALL SELECT 'agent_sessions', COUNT(*) FROM agent_sessions
UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL SELECT 'conversation_messages', COUNT(*) FROM conversation_messages
UNION ALL SELECT 'market_validations', COUNT(*) FROM market_validations;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Database schema created successfully!';
    RAISE NOTICE '📊 Tables: 9 core tables';
    RAISE NOTICE '🔍 Indexes: 20+ indexes for performance';
    RAISE NOTICE '⚡ Triggers: 2 triggers for conversation management';
    RAISE NOTICE '🚀 Ready for Innovation Insights Portal!';
END $$;
