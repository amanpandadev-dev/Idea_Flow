/**
 * ChromaDB Reindexing Script - Llama Embeddings (ES6 Version)
 * 
 * Purpose: Delete old Gemini embeddings and reindex all ideas with Llama/nomic-embed-text
 * This fixes the embedding mismatch causing 0 results and slow searches
 * 
 * Run: node backend/scripts/reindex-chromadb-llama.js
 */

import pkg from 'pg';
const { Pool } = pkg;
import { getChromaClient, initChromaDB } from '../config/chroma.js';
import { getEmbeddingVector } from '../services/embeddingProvider.js';
import dotenv from 'dotenv';

dotenv.config();

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Configuration
const BATCH_SIZE = 50;  // Process 50 ideas at a time
const COLLECTION_NAME = 'ideas_search';

console.log('\n');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  ChromaDB Reindexing Script - Llama/nomic-embed-text     ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('\n');
console.log('🚀 Starting ChromaDB reindexing with Llama embeddings...\n');

const startTime = Date.now();

try {
    // CRITICAL: Initialize ChromaDB first!
    console.log('Step 0/5: Initializing ChromaDB vector store...');
    initChromaDB();
    console.log('✅ ChromaDB initialized\n');

    // Step 1: Delete existing collection
    console.log('Step 1/5: Deleting old collection with Gemini embeddings...');
    const chromaClient = getChromaClient();

    try {
        chromaClient.deleteCollection(COLLECTION_NAME);
        console.log(`✅ Deleted collection: ${COLLECTION_NAME}\n`);
    } catch (deleteErr) {
        console.log(`ℹ️  Collection ${COLLECTION_NAME} might not exist or already deleted\n`);
    }

    // Step 2: Create fresh collection
    console.log('Step 2/5: Creating fresh collection...');
    chromaClient.createCollection(COLLECTION_NAME);
    console.log(`✅ Created collection: ${COLLECTION_NAME}\n`);

    // Step 3: Fetch all ideas from database
    console.log('Step 3/5: Fetching ideas from PostgreSQL...');
    const result = await pool.query(`
        SELECT 
            i.idea_id,
            i.title,
            i.summary,
            i.challenge_opportunity as domain,
            i.business_group as "businessGroup",
            i.code_preference as technologies,
            i.score,
            i.created_at
        FROM ideas i
        WHERE i.title IS NOT NULL 
        AND i.summary IS NOT NULL
        ORDER BY i.idea_id
    `);

    const ideas = result.rows;
    console.log(`✅ Fetched ${ideas.length} ideas from database\n`);

    if (ideas.length === 0) {
        console.log('⚠️  No ideas found in database. Exiting.');
        await pool.end();
        process.exit(0);
    }

    // Step 4: Batch process and generate Llama embeddings
    console.log('Step 4/5: Generating Llama embeddings and indexing...');
    console.log(`Processing in batches of ${BATCH_SIZE}...\n`);

    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    // Get collection (async method!)
    const collection = await chromaClient.getOrCreateCollection({ name: COLLECTION_NAME });
    console.log(`✅ Working with collection: ${COLLECTION_NAME}`);
    console.log(`Collection has add method: ${typeof collection.add === 'function'}\n`);

    for (let i = 0; i < ideas.length; i += BATCH_SIZE) {
        const batch = ideas.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(ideas.length / BATCH_SIZE);

        console.log(`\nBatch ${batchNumber}/${totalBatches} (${batch.length} ideas)...`);

        // Process batch sequentially to avoid overwhelming Ollama
        for (const idea of batch) {
            try {
                // Create searchable text
                const searchableText = [
                    idea.title || '',
                    idea.summary || '',
                    idea.domain || '',
                    idea.technologies || ''
                ].join(' ').trim();

                if (!searchableText || searchableText.length < 10) {
                    console.log(`  ⚠️  Skipping idea ${idea.idea_id}: insufficient text`);
                    errorCount++;
                    continue;
                }

                // Generate Llama embedding (768-dim via nomic-embed-text)
                const embedding = await getEmbeddingVector(searchableText, 'llama');

                // Verify dimension
                if (!embedding || embedding.length !== 768) {
                    console.log(`  ❌ Idea ${idea.idea_id}: Wrong dimension ${embedding?.length || 0}, expected 768`);
                    errorCount++;
                    continue;
                }

                // Add to ChromaDB using custom API
                await collection.add({
                    ids: [`idea_${idea.idea_id}`],
                    embeddings: [embedding],
                    documents: [searchableText],
                    metadatas: [{
                        idea_id: idea.idea_id,
                        title: idea.title,
                        summary: idea.summary || '',
                        domain: idea.domain || '',
                        businessGroup: idea.businessGroup || '',
                        technologies: idea.technologies || '',
                        score: idea.score || 0,
                        created_at: idea.created_at ? idea.created_at.toISOString() : new Date().toISOString()
                    }]
                });

                successCount++;

            } catch (error) {
                console.log(`  ❌ Error processing idea ${idea.idea_id}: ${error.message}`);
                errorCount++;
            }
        }

        processedCount += batch.length;

        const progress = ((processedCount / ideas.length) * 100).toFixed(1);
        console.log(`  Progress: ${processedCount}/${ideas.length} (${progress}%) | Success: ${successCount} | Errors: ${errorCount}`);

        // Small delay between batches
        if (i + BATCH_SIZE < ideas.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Step 5: Verify and save
    console.log('\nStep 5/5: Verifying collection...');
    const count = await collection.count();
    console.log(`✅ Collection contains ${count} documents\n`);

    // Done
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('═'.repeat(60));
    console.log('🎉 REINDEXING COMPLETE!');
    console.log('═'.repeat(60));
    console.log(`Total ideas processed: ${processedCount}`);
    console.log(`Successfully indexed: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Collection size: ${count} documents`);
    console.log(`Embedding model: nomic-embed-text (Llama)`);
    console.log(`Vector dimension: 768`);
    console.log(`Total time: ${duration} seconds`);
    console.log('═'.repeat(60));

    if (successCount > 0) {
        console.log('\n✅ ChromaDB is now indexed with Llama embeddings!');
        console.log('You can now run queries and they will work correctly.\n');
    } else {
        console.log('\n⚠️  WARNING: No ideas were successfully indexed!');
        console.log('Check the error messages above and ensure Ollama is running.\n');
    }

    await pool.end();
    process.exit(0);

} catch (error) {
    console.error('\n❌ FATAL ERROR during reindexing:');
    console.error(error);
    await pool.end();
    process.exit(1);
}
