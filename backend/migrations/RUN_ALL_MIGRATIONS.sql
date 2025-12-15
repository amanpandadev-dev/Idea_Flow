-- Complete Database Setup Script
-- Run this in pgAdmin Query Tool if you need to recreate schema
-- Connect to: ideaflow_db database

-- IMPORTANT: Run each migration file in order:

-- 1. Conversations table (for chat history)
\i 'C:/Users/MrVamsiKasireddy/Desktop/My demos/HackathonFolders/Idea_Flow_2.1v/Idea_Flow/backend/migrations/001_create_conversations.sql'

-- 2. Chat history table
\i 'C:/Users/MrVamsiKasireddy/Desktop/My demos/HackathonFolders/Idea_Flow_2.1v/Idea_Flow/backend/migrations/002_create_chat_history.sql'

-- 3. Agent sessions table
\i 'C:/Users/MrVamsiKasireddy/Desktop/My demos/HackathonFolders/Idea_Flow_2.1v/Idea_Flow/backend/migrations/003_create_agent_sessions.sql'

-- 4. ProSearch indexes
\i 'C:/Users/MrVamsiKasireddy/Desktop/My demos/HackathonFolders/Idea_Flow_2.1v/Idea_Flow/backend/migrations/004_prosearch_indexes.sql'

-- 5. Likes table (NEW - just created)
\i 'C:/Users/MrVamsiKasireddy/Desktop/My demos/HackathonFolders/Idea_Flow_2.1v/Idea_Flow/backend/migrations/005_create_likes.sql'

-- Verify tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
