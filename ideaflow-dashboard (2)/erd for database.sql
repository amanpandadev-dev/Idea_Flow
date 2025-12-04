CREATE TABLE IF NOT EXISTS public.associates
(
    associate_id SERIAL PRIMARY KEY,
    account VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    parent_ou VARCHAR(255),
    business_group VARCHAR(255) DEFAULT 'Digital Operations',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2) idea_team table (join table)
CREATE TABLE IF NOT EXISTS public.idea_team
(
    id SERIAL PRIMARY KEY,
    idea_id INTEGER NOT NULL,
    associate_id INTEGER NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    role VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    business_group VARCHAR(200),
    CONSTRAINT idea_team_idea_associate_unique UNIQUE (idea_id, associate_id)
);

-- 3) ideas table
CREATE TABLE IF NOT EXISTS public.ideas
(
    idea_id SERIAL PRIMARY KEY,
    submitter_id INTEGER,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
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
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    business_group VARCHAR(200),
    score INTEGER DEFAULT 0
);

-- 4) users table
CREATE TABLE IF NOT EXISTS public.users
(
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    password_hash TEXT NOT NULL,
    role VARCHAR(64) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5) idea_likes table
CREATE TABLE IF NOT EXISTS public.likes   
(
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    idea_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES public.users(emp_id) ON DELETE CASCADE,
    FOREIGN KEY (idea_id) REFERENCES public.ideas(idea_id) ON DELETE CASCADE,
    CONSTRAINT idea_likes_idea_user_unique UNIQUE (idea_id, user_id)
);


-- =====================================================
-- CHAT HISTORY TABLES (Pro Search)
-- =====================================================

-- 6) chat_sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions
(
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) DEFAULT 'New Chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7) chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages
(
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for chat history performance
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
