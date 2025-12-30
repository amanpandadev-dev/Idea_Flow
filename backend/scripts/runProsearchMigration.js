#!/usr/bin/env node

/**
 * Run the prosearch_conversations migration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    console.log('\n🗄️  Running prosearch_conversations migration...\n');
    
    const migrationPath = path.join(__dirname, '..', 'migrations', '006_create_prosearch_conversations.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    const client = await pool.connect();
    
    try {
        console.log('📄 Executing SQL...');
        await client.query(sql);
        console.log('✅ Migration completed successfully!\n');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
