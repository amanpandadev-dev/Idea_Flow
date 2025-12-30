/**
 * Complete ProSearch Database Schema
 * Creates all required tables for chat history and search state
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function createTables() {
    try {
        console.log('Creating ProSearch database schema...\n');

        // 1. Chat Sessions Table
        console.log('[1/3] Creating chat_sessions table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(64) NOT NULL,
                title TEXT NOT NULL DEFAULT 'New Chat',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id 
                ON chat_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at 
                ON chat_sessions(updated_at DESC);
        `);
        console.log('✅ chat_sessions created\n');

        // 2. Chat Messages Table
        console.log('[2/3] Creating chat_messages table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id 
                ON chat_messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at 
                ON chat_messages(created_at);
        `);
        console.log('✅ chat_messages created\n');

        // 3. ProSearch Conversations Table (should already exist)
        console.log('[3/3] Verifying prosearch_conversations table...');
        await pool.query(`
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

            CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_session_id 
                ON prosearch_conversations(session_id);
            CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_created_at 
                ON prosearch_conversations(created_at DESC);
        `);
        console.log('✅ prosearch_conversations verified\n');

        // Verification
        const tables = await pool.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE tablename IN ('chat_sessions', 'chat_messages', 'prosearch_conversations')
            ORDER BY tablename;
        `);

        console.log('================================');
        console.log('✅ ProSearch schema created successfully!');
        console.log(`📊 Tables: ${tables.rows.map(r => r.tablename).join(', ')}`);
        console.log('================================\n');

        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating schema:', error.message);
        await pool.end();
        process.exit(1);
    }
}

createTables();
