/**
 * Create ProSearch Conversations Table
 * Run with: node backend/scripts/createProSearchTable.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function createTable() {
    try {
        console.log('Creating prosearch_conversations table...');

        const query = `
            CREATE TABLE IF NOT EXISTS prosearch_conversations (
                conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

            CREATE INDEX IF NOT EXISTS idx_prosearch_conversations_created_at 
                ON prosearch_conversations(created_at DESC);
        `;

        await pool.query(query);

        console.log('✅ prosearch_conversations table created successfully!');

        // Verify
        const verifyQuery = `
            SELECT tablename 
            FROM pg_tables 
            WHERE tablename = 'prosearch_conversations';
        `;

        const result = await pool.query(verifyQuery);

        if (result.rows.length > 0) {
            console.log('✅ Table verified in database');
        } else {
            console.log('❌ Table not found after creation');
        }

        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating table:', error.message);
        await pool.end();
        process.exit(1);
    }
}

createTable();
