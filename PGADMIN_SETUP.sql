-- ============================================
-- Agent Search History - Database Setup
-- Run this in pgAdmin Query Tool
-- ============================================

-- Step 1: Create conversations table
-- ============================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    tags TEXT[] DEFAULT '{}',
    session_id VARCHAR(255),
    document_context JSONB,
    embedding_provider VARCHAR(50) DEFAULT 'llama',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

-- Step 2: Create conversation_messages table
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

-- Step 3: Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_tags ON conversations USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON conversation_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_content_search ON conversation_messages USING GIN(to_tsvector('english', content));

-- Step 4: Create trigger function to update updated_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger to auto-update updated_at
-- ============================================

DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON conversations;

CREATE TRIGGER trigger_update_conversation_timestamp
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_timestamp();

-- Step 6: Create trigger function to update message count
-- ============================================

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

-- Step 7: Create trigger to auto-update message count
-- ============================================

DROP TRIGGER IF EXISTS trigger_update_message_count ON conversation_messages;

CREATE TRIGGER trigger_update_message_count
    AFTER INSERT OR DELETE ON conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_message_count();

-- ============================================
-- Verification Queries
-- ============================================

-- Check if tables were created
SELECT 
    tablename, 
    schemaname 
FROM pg_tables 
WHERE tablename IN ('conversations', 'conversation_messages');

-- Check indexes
SELECT 
    indexname, 
    tablename 
FROM pg_indexes 
WHERE tablename IN ('conversations', 'conversation_messages');

-- Check triggers
SELECT 
    trigger_name, 
    event_object_table, 
    action_statement 
FROM information_schema.triggers 
WHERE event_object_table IN ('conversations', 'conversation_messages');

-- Count records (should be 0 initially)
SELECT 
    'conversations' as table_name, 
    COUNT(*) as record_count 
FROM conversations
UNION ALL
SELECT 
    'conversation_messages' as table_name, 
    COUNT(*) as record_count 
FROM conversation_messages;

-- ============================================
-- Success Message
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Agent Search History schema created successfully!';
    RAISE NOTICE '📊 Tables: conversations, conversation_messages';
    RAISE NOTICE '🔍 Indexes: 7 indexes created';
    RAISE NOTICE '⚡ Triggers: 2 triggers created';
    RAISE NOTICE '🚀 Ready to use!';
END $$;
