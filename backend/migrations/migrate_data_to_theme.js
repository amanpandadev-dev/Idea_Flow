/**
 * Data Migration: Copy challenge_opportunity to theme column
 * Run: node backend/migrations/migrate_data_to_theme.js
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

console.log('\n🔄 Starting data migration: challenge_opportunity → theme\n');

async function migrateData() {
    try {
        // Step 1: Check current state
        console.log('Step 1: Checking current state...');
        const checkQuery = `
            SELECT 
                COUNT(*) as total_ideas,
                COUNT(challenge_opportunity) as has_challenge_opp,
                COUNT(theme) as has_theme,
                COUNT(CASE WHEN challenge_opportunity IS NOT NULL AND (theme IS NULL OR theme = '') THEN 1 END) as needs_migration
            FROM ideas
        `;
        const checkResult = await pool.query(checkQuery);
        console.log('Current state:', checkResult.rows[0]);

        const needsMigration = parseInt(checkResult.rows[0].needs_migration);

        if (needsMigration === 0) {
            console.log('\n✅ No migration needed - theme column already populated!\n');
            return;
        }

        console.log(`\n⚠️  ${needsMigration} ideas need migration\n`);

        // Step 2: Migrate data
        console.log('Step 2: Copying data from challenge_opportunity to theme...');
        const migrateQuery = `
            UPDATE ideas
            SET theme = challenge_opportunity
            WHERE challenge_opportunity IS NOT NULL
              AND (theme IS NULL OR theme = '')
        `;
        const migrateResult = await pool.query(migrateQuery);
        console.log(`✅ Migrated ${migrateResult.rowCount} rows\n`);

        // Step 3: Verify migration
        console.log('Step 3: Verifying migration...');
        const verifyQuery = `
            SELECT 
                COUNT(*) as total_ideas,
                COUNT(theme) as has_theme,
                COUNT(CASE WHEN challenge_opportunity = theme THEN 1 END) as matching_values
            FROM ideas
        `;
        const verifyResult = await pool.query(verifyQuery);
        console.log('After migration:', verifyResult.rows[0]);

        // Step 4: Show sample
        console.log('\nStep 4: Sample data (first 5 ideas):');
        const sampleQuery = `
            SELECT 
                idea_id,
                LEFT(title, 40) as title,
                challenge_opportunity as old_col,
                theme as new_col
            FROM ideas
            ORDER BY idea_id
            LIMIT 5
        `;
        const sampleResult = await pool.query(sampleQuery);
        console.table(sampleResult.rows);

        console.log('\n✅ Migration complete!\n');
        console.log('Next steps:');
        console.log('1. Re-index ChromaDB: node backend/scripts/reindex-chromadb-llama.js');
        console.log('2. Restart server: npm run server\n');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

migrateData();
