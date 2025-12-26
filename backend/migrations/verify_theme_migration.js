/**
 * Verification Script: Check if theme migration is complete
 * Run: node backend/migrations/verify_theme_migration.js
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

console.log('\n🔍 Verifying Theme Migration\n');

async function verify() {
    try {
        // Check 1: Verify theme column has data
        console.log('✓ Check 1: Theme column data');
        const themeCheck = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(theme) as has_theme,
                COUNT(DISTINCT theme) as unique_themes
            FROM ideas
        `);
        console.log('  Result:', themeCheck.rows[0]);

        // Check 2: Sample data
        console.log('\n✓ Check 2: Sample theme values (first 5 ideas)');
        const sample = await pool.query(`
            SELECT 
                idea_id,
                LEFT(title, 50) as title,
                theme,
                business_group
            FROM ideas
            ORDER BY idea_id
            LIMIT 5
        `);
        console.table(sample.rows);

        // Check 3: Verify no NULL themes
        const nullCheck = await pool.query(`
            SELECT COUNT(*) as null_themes
            FROM ideas
            WHERE theme IS NULL OR theme = ''
        `);
        console.log('\n✓ Check 3: NULL/Empty themes:', nullCheck.rows[0].null_themes);

        if (parseInt(nullCheck.rows[0].null_themes) > 0) {
            console.log('  ⚠️  Warning: Some ideas have NULL/empty themes!');
        } else {
            console.log('  ✅ All ideas have theme values');
        }

        console.log('\n✅ Verification complete!\n');
        console.log('Summary:');
        console.log(`  • Total ideas: ${themeCheck.rows[0].total}`);
        console.log(`  • Ideas with themes: ${themeCheck.rows[0].has_theme}`);
        console.log(`  • Unique themes: ${themeCheck.rows[0].unique_themes}`);
        console.log('\n✅ Ready to start server!\n');

    } catch (error) {
        console.error('❌ Verification failed:', error.message);
    } finally {
        await pool.end();
    }
}

verify();
