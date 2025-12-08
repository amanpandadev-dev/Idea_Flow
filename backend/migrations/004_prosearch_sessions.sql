-- ProSearch Sessions & Messages Tables
-- Enables session persistence, filter history, and query reuse

-- Store search sessions with filters
CREATE TABLE IF NOT EXISTS prosearch_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT,
    query TEXT,
    filters JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store chat messages / turn history per session
CREATE TABLE IF NOT EXISTS prosearch_messages (
    id SERIAL PRIMARY KEY,
    session_id TEXT REFERENCES prosearch_sessions(session_id) ON DELETE CASCADE,
    role VARCHAR(16), -- 'user'/'system'/'assistant'
    content TEXT,
    meta JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_prosearch_sessions_user_id ON prosearch_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_prosearch_sessions_updated_at ON prosearch_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prosearch_messages_session_id ON prosearch_messages(session_id);
