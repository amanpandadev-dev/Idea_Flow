/**
 * Migration script to index all existing ideas in ChromaDB
 * Run with: node backend/scripts/migrateIdeasToChroma.js
 */

import 'dotenv/config';
import pg from 'pg';
import { initChromaDB } from '../config/chroma.js';
import { batchIndexIdeas, ensureIdeasCollection } from '../services/ideaIndexingService.js';

const { Pool } = pg;

async function migrateIdeas() {
    console.log('🚀 Starting idea migration to ChromaDB...\n');

    // Initialize database connection
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        // Initialize ChromaDB
        const chromaClient = await initChromaDB();
        console.log('✅ ChromaDB initialized\n');

        // Ensure ideas_collection exists
        await ensureIdeasCollection(chromaClient);

        // Fetch all ideas from PostgreSQL
        console.log('📊 Fetching ideas from database...');
        const result = await pool.query(`
            SELECT 
                idea_id as id,
                title,
                summary as description,
                business_group as team,
                challenge_opportunity as category,
                'submitted' as status
            FROM ideas
            ORDER BY idea_id
        `);

        const ideas = result.rows;
        console.log(`Found ${ideas.length} ideas to index\n`);

        if (ideas.length === 0) {
            console.log('No ideas to migrate. Exiting.');
            return;
        }

        // Batch index ideas with progress tracking
        const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'gemini';
        console.log(`Using embedding provider: ${embeddingProvider}\n`);
        console.log('Starting batch indexing...\n');

        let lastProgress = 0;
        const progressCallback = (progress) => {
            const percent = Math.floor((progress.current / progress.total) * 100);
            
            // Only log every 10% or on completion
            if (percent >= lastProgress + 10 || progress.current === progress.total) {
                console.log(`Progress: ${progress.current}/${progress.total} (${percent}%) - Success: ${progress.successCount}, Failed: ${progress.failureCount}`);
                lastProgress = percent;
            }
        };

        const startTime = Date.now();
        const results = await batchIndexIdeas(
            chromaClient,
            ideas,
            embeddingProvider,
            progressCallback
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '='.repeat(50));
        console.log('Migration Complete!');
        console.log('='.repeat(50));
        console.log(`Total ideas: ${results.total}`);
        console.log(`Successfully indexed: ${results.successCount}`);
        console.log(`Failed: ${results.failureCount}`);
        console.log(`Duration: ${duration}s`);
        console.log(`Average: ${(duration / results.total).toFixed(2)}s per idea`);
        console.log('='.repeat(50));

        if (results.failureCount > 0) {
            console.log('\n⚠️  Some ideas failed to index. Check logs above for details.');
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
        console.log('\n✅ Database connection closed');
    }
}

// Run migration
migrateIdeas()
    .then(() => {
        console.log('\n✨ Migration script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration script failed:', error);
        process.exit(1);
    });
