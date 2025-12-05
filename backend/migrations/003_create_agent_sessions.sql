-- Agent Sessions Table for Agent Tab History
-- Run this migration to add agent search history persistence

-- Agent Sessions Table
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_job_id ON agent_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);

-- Comments for documentation
COMMENT ON TABLE agent_sessions IS 'Stores agent search history for each user';
COMMENT ON COLUMN agent_sessions.user_id IS 'References users.emp_id';
COMMENT ON COLUMN agent_sessions.job_id IS 'Unique identifier for the agent job';
COMMENT ON COLUMN agent_sessions.query IS 'User query submitted to the agent';
COMMENT ON COLUMN agent_sessions.status IS 'Job status: queued, running, completed, failed, cancelled';
COMMENT ON COLUMN agent_sessions.result IS 'Agent response stored as JSON';
COMMENT ON COLUMN agent_sessions.embedding_provider IS 'Embedding provider used: llama, grok, or gemini';
