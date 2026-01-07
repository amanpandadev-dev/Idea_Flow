/**
 * Diagnostic Script: Verify Score Storage
 * 
 * This script checks if the database schema is correct and if scores are being stored.
 * 
 * Usage: node backend/scripts/verify-score-storage.js
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function verifyScoreStorage() {
    console.log('🔍 Verifying ProSearch Score Storage Setup...\n');
    
    try {
        // 1. Check if base_result_scores column exists
        console.log('1️⃣ Checking database schema...');
        const schemaCheck = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'prosearch_conversations'
            AND column_name = 'base_result_scores'
        `);
        
        if (schemaCheck.rows.length === 0) {
            console.log('❌ FAILED: base_result_scores column does NOT exist');
            console.log('   → Run migration: backend/migrations/add_chroma_scores_column.sql');
            return;
        }
        
        console.log('✅ PASSED: base_result_scores column exists');
        console.log('   Type:', schemaCheck.rows[0].data_type);
        console.log('   Nullable:', schemaCheck.rows[0].is_nullable);
        console.log();
        
        // 2. Check if any conversations have scores stored
        console.log('2️⃣ Checking for stored scores...');
        const scoresCheck = await pool.query(`
            SELECT 
                conversation_id,
                base_query,
                array_length(base_result_ids, 1) as result_count,
                array_length(base_result_scores, 1) as score_count,
                CASE 
                    WHEN base_result_scores IS NULL THEN 'NULL'
                    WHEN array_length(base_result_scores, 1) = 0 THEN 'EMPTY'
                    ELSE 'HAS_SCORES'
                END as score_status,
                created_at
            FROM prosearch_conversations
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        if (scoresCheck.rows.length === 0) {
            console.log('⚠️  WARNING: No conversations found in database');
            console.log('   → Create a new ProSearch query to test');
            console.log();
        } else {
            console.log(`Found ${scoresCheck.rows.length} recent conversations:\n`);
            
            scoresCheck.rows.forEach((row, index) => {
                console.log(`Conversation ${index + 1}:`);
                console.log(`  ID: ${row.conversation_id}`);
                console.log(`  Query: "${row.base_query}"`);
                console.log(`  Results: ${row.result_count}`);
                console.log(`  Scores: ${row.score_count || 0} (${row.score_status})`);
                console.log(`  Created: ${row.created_at}`);
                
                if (row.score_status === 'NULL' || row.score_status === 'EMPTY') {
                    console.log('  ⚠️  This conversation has NO scores stored');
                    console.log('     → It was created before the migration');
                    console.log('     → Create a NEW search to test score persistence');
                } else {
                    console.log('  ✅ This conversation has scores stored');
                }
                console.log();
            });
        }
        
        // 3. Check a specific conversation's scores
        if (scoresCheck.rows.length > 0) {
            const latestConv = scoresCheck.rows[0];
            
            if (latestConv.score_status === 'HAS_SCORES') {
                console.log('3️⃣ Inspecting latest conversation scores...');
                const detailCheck = await pool.query(`
                    SELECT 
                        base_result_scores[1:10] as first_10_scores,
                        base_result_scores[array_length(base_result_scores, 1) - 9:array_length(base_result_scores, 1)] as last_10_scores
                    FROM prosearch_conversations
                    WHERE conversation_id = $1
                `, [latestConv.conversation_id]);
                
                if (detailCheck.rows.length > 0) {
                    console.log('First 10 scores:', detailCheck.rows[0].first_10_scores);
                    console.log('Last 10 scores:', detailCheck.rows[0].last_10_scores);
                    console.log();
                    
                    const firstScores = detailCheck.rows[0].first_10_scores;
                    const lastScores = detailCheck.rows[0].last_10_scores;
                    
                    // Check if scores look correct (should be 0-99 range)
                    const allScores = [...(firstScores || []), ...(lastScores || [])];
                    const maxScore = Math.max(...allScores);
                    const minScore = Math.min(...allScores);
                    
                    console.log(`Score range: ${minScore}% - ${maxScore}%`);
                    
                    if (maxScore > 99 || minScore < 0) {
                        console.log('⚠️  WARNING: Scores outside expected range (0-99)');
                    } else if (maxScore === 100) {
                        console.log('⚠️  WARNING: Scores use old position-based formula (max=100)');
                        console.log('   → Expected: max=99 (normalized similarity)');
                    } else {
                        console.log('✅ PASSED: Scores in correct range (0-99)');
                    }
                    console.log();
                }
            }
        }
        
        // 4. Summary
        console.log('📊 Summary:');
        console.log('─────────────────────────────────────────────────');
        
        const hasColumn = schemaCheck.rows.length > 0;
        const hasConversations = scoresCheck.rows.length > 0;
        const hasScores = scoresCheck.rows.some(r => r.score_status === 'HAS_SCORES');
        
        if (hasColumn && hasScores) {
            console.log('✅ Setup is CORRECT');
            console.log('   - Database schema is up to date');
            console.log('   - Scores are being stored');
            console.log('   - Ready for testing');
        } else if (hasColumn && !hasScores) {
            console.log('⚠️  Setup is INCOMPLETE');
            console.log('   - Database schema is up to date');
            console.log('   - No scores stored yet (or old conversations)');
            console.log('   - Action: Create a NEW ProSearch query to test');
        } else {
            console.log('❌ Setup is INCORRECT');
            console.log('   - Database schema is missing column');
            console.log('   - Action: Run migration SQL file');
        }
        
    } catch (error) {
        console.error('❌ Error during verification:', error.message);
        console.error(error);
    } finally {
        await pool.end();
    }
}

// Run verification
verifyScoreStorage();
