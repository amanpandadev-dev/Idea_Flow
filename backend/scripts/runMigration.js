#!/usr/bin/env node

/**
 * Database Migration Runner
 * Executes SQL migration files against the PostgreSQL database
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Run a migration file
 * @param {string} filename - Migration file name
 * @param {string} action - 'up' or 'down'
 */
async function runMigration(filename, action = 'up') {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    
    let filePath;
    if (action === 'up') {
        filePath = path.join(migrationsDir, filename);
    } else {
        // For rollback, look for rollback file
        const rollbackFile = filename.replace('.sql', '_rollback.sql').replace('_create_', '_rollback_');
        filePath = path.join(migrationsDir, rollbackFile);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`❌ Migration file not found: ${filePath}`);
        process.exit(1);
    }

    console.log(`\n📄 Reading migration: ${path.basename(filePath)}`);
    const sql = fs.readFileSync(filePath, 'utf8');

    const client = await pool.connect();
    
    try {
        console.log(`🚀 Executing migration...`);
        await client.query(sql);
        console.log(`✅ Migration completed successfully!`);
    } catch (error) {
        console.error(`❌ Migration failed:`, error.message);
        console.error(error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Test database connection
 */
async function testConnection() {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log(`✅ Database connected: ${result.rows[0].now}`);
        return true;
    } catch (error) {
        console.error(`❌ Database connection failed:`, error.message);
        return false;
    }
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    const action = args[0] || 'up'; // 'up' or 'down'
    const migrationFile = args[1] || '001_create_conversations.sql';

    console.log(`\n🗄️  Database Migration Runner`);
    console.log(`📊 Database: ${process.env.DATABASE_URL?.split('@')[1] || 'Not configured'}`);
    console.log(`🎯 Action: ${action === 'up' ? 'Apply' : 'Rollback'}`);
    console.log(`📝 Migration: ${migrationFile}`);

    // Test connection
    const connected = await testConnection();
    if (!connected) {
        console.error(`\n❌ Cannot proceed without database connection`);
        process.exit(1);
    }

    // Run migration
    try {
        await runMigration(migrationFile, action);
        console.log(`\n✨ All done!`);
    } catch (error) {
        console.error(`\n💥 Migration failed. Database may be in inconsistent state.`);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

export { runMigration, testConnection };
