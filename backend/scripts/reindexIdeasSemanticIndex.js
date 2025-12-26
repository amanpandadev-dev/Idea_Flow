/**
 * ChromaDB Semantic Index - Authoritative Reindexing Script
 * 
 * Purpose: Single source of truth for indexing all ideas into ChromaDB
 * Collection: ideas_semantic_index (SINGLE COLLECTION)
 * Embeddings: Ollama/Llama (nomic-embed-text) ONLY - 768 dimensions
 * 
 * Embedding Content (INCLUDES):
 * - title, summary, challenge_opportunity
 * - benefits, risks, responsible_ai
 * - theme, business_group, code_preference
 * 
 * Run: node backend/scripts/reindexIdeasSemanticIndex.js
 */

import pkg from 'pg';
const { Pool } = pkg;
import { getChromaClient, initChromaDB } from '../config/chroma.js';
import { getEmbeddingVector } from '../services/embeddingProvider.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const COLLECTION_NAME = 'ideas_semantic_index';
const BATCH_SIZE = 50;
const DELAY_MS = 100; // Prevent Ollama throttling
const EMBEDDING_DIM = 768;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

console.log('\n');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  ChromaDB Semantic Index - Authoritative Reindexing      ║');
console.log('║  Collection: ideas_semantic_index                         ║');
console.log('║  Embeddings: Ollama/Llama (nomic-embed-text) - 768 dim   ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('\n');

const startTime = Date.now();

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate embedding text from idea
 * CRITICAL: Includes responsible_ai and risks fields
 */
function generateEmbeddingText(idea) {
    const parts = [
        idea.title || '',
        idea.summary || '',
        idea.challenge_opportunity || '',
        idea.benefits || '',
        idea.risks || '',
        idea.responsible_ai || '',
        idea.theme ? `Theme: ${idea.theme}` : '',
        idea.business_group ? `Business Group: ${idea.business_group}` : '',
        idea.code_preference ? `Tech Stack: ${idea.code_preference}` : ''
    ];

    return parts.filter(p => p.trim().length > 0).join('\n\n').trim();
}

/**
 * Validate embedding
 */
function validateEmbedding(embedding, ideaId) {
    if (!Array.isArray(embedding)) {
        throw new Error(`Idea ${ideaId}: Embedding is not an array`);
    }

    if (embedding.length !== EMBEDDING_DIM) {
        throw new Error(`Idea ${ideaId}: Invalid embedding dimension ${embedding.length}, expected ${EMBEDDING_DIM}`);
    }

    if (embedding.some(v => typeof v !== 'number' || isNaN(v))) {
        throw new Error(`Idea ${ideaId}: Embedding contains invalid values`);
    }

    return true;
}

async function reindexSemanticIndex() {
    try {
        // Step 0: Initialize ChromaDB
        console.log('Step 0/6: Initializing ChromaDB...');
        initChromaDB();
        console.log('✅ ChromaDB initialized\n');

        const chromaClient = getChromaClient();

        // Step 1: Delete old collection if exists
        console.log('Step 1/6: Cleaning up old collections...');
        try {
            // Delete ideas_semantic_index
            chromaClient.deleteCollection(COLLECTION_NAME);
            console.log(`✅ Deleted collection: ${COLLECTION_NAME}`);
        } catch (err) {
            console.log(`ℹ️  Collection ${COLLECTION_NAME} does not exist (OK)`);
        }

        // Also clean up legacy collections
        try {
            chromaClient.deleteCollection('ideas_search');
            console.log('✅ Deleted legacy collection: ideas_search');
        } catch (err) {
            console.log('ℹ️  Legacy collection ideas_search does not exist (OK)');
        }

        try {
            chromaClient.deleteCollection('ideas_collection');
            console.log('✅ Deleted legacy collection: ideas_collection');
        } catch (err) {
            console.log('ℹ️  Legacy collection ideas_collection does not exist (OK)');
        }

        console.log('');

        // Step 2: Create new collection
        console.log('Step 2/6: Creating new semantic index collection...');
        const collection = await chromaClient.getOrCreateCollection({
            name: COLLECTION_NAME,
            metadata: {
                description: 'Semantic index for all ideas with Llama embeddings',
                embedding_model: 'nomic-embed-text',
                embedding_dimension: EMBEDDING_DIM,
                created_at: new Date().toISOString()
            }
        });
        console.log(`✅ Created collection: ${COLLECTION_NAME}\n`);

        // Step 3: Fetch ideas from PostgreSQL
        console.log('Step 3/6: Fetching ideas from PostgreSQL...');
        const result = await pool.query(`
            SELECT 
                idea_id,
                submitter_id,
                title,
                summary,
                challenge_opportunity,
                benefits,
                risks,
                responsible_ai,
                theme,
                business_group,
                code_preference,
                score,
                build_phase,
                created_at
            FROM ideas
            ORDER BY idea_id
        `);

        const ideas = result.rows;
        console.log(`✅ Fetched ${ideas.length} ideas from database\n`);

        if (ideas.length === 0) {
            console.log('⚠️  No ideas found in database. Exiting.\n');
            return;
        }

        // Step 4: Process ideas in batches
        console.log('Step 4/6: Generating embeddings and indexing...');
        console.log(`Batch size: ${BATCH_SIZE}, Delay: ${DELAY_MS}ms\n`);

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (let i = 0; i < ideas.length; i += BATCH_SIZE) {
            const batch = ideas.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(ideas.length / BATCH_SIZE);

            console.log(`\n[Batch ${batchNum}/${totalBatches}] Processing ideas ${i + 1}-${Math.min(i + BATCH_SIZE, ideas.length)}...`);

            for (const idea of batch) {
                try {
                    // Generate embedding text
                    const embeddingText = generateEmbeddingText(idea);

                    if (embeddingText.length < 10) {
                        console.log(`  ⚠️  Idea ${idea.idea_id}: Insufficient text, skipping`);
                        errorCount++;
                        continue;
                    }

                    // Generate embedding with Ollama
                    const embedding = await getEmbeddingVector(embeddingText);

                    // Validate embedding
                    validateEmbedding(embedding, idea.idea_id);

                    // Add to ChromaDB
                    await collection.add({
                        ids: [`idea_${idea.idea_id}`],
                        embeddings: [embedding],
                        metadatas: [{
                            idea_id: idea.idea_id,
                            title: idea.title || '',
                            submitter_id: idea.submitter_id || 0,
                            theme: idea.theme || '',
                            business_group: idea.business_group || '',
                            score: idea.score || 0,
                            build_phase: idea.build_phase || '',
                            created_at: idea.created_at ? idea.created_at.toISOString() : ''
                        }],
                        documents: [embeddingText.substring(0, 500)] // Store snippet for debugging
                    });

                    successCount++;
                    console.log(`  ✓ Idea ${idea.idea_id}: "${idea.title.substring(0, 50)}..."`);

                } catch (error) {
                    errorCount++;
                    const errorMsg = `Idea ${idea.idea_id}: ${error.message}`;
                    errors.push(errorMsg);
                    console.error(`  ✗ ${errorMsg}`);
                }

                // Small delay to prevent Ollama throttling
                await sleep(DELAY_MS);
            }

            console.log(`[Batch ${batchNum}/${totalBatches}] Complete: ${successCount} indexed, ${errorCount} errors`);
        }

        // Step 5: Verify collection
        console.log('\n\nStep 5/6: Verifying collection...');
        const count = await collection.count();
        console.log(`✅ Collection size: ${count} documents`);

        // Step 6: Summary
        console.log('\n\nStep 6/6: Summary');
        console.log('═'.repeat(60));
        console.log(`Total ideas processed: ${ideas.length}`);
        console.log(`Successfully indexed: ${successCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log(`Collection: ${COLLECTION_NAME}`);
        console.log(`Embedding model: nomic-embed-text (Llama)`);
        console.log(`Embedding dimension: ${EMBEDDING_DIM}`);
        console.log(`Time elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        console.log('═'.repeat(60));

        if (errors.length > 0 && errors.length <= 10) {
            console.log('\nErrors:');
            errors.forEach(err => console.log(`  - ${err}`));
        } else if (errors.length > 10) {
            console.log(`\n${errors.length} errors occurred (showing first 10):`);
            errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
        }

        console.log('\n✅ ChromaDB semantic index is ready!');
        console.log('You can now run semantic searches with improved relevance.\n');

        console.log('Next steps:');
        console.log('1. Restart server: npm run server');
        console.log('2. Test search: node backend/scripts/testSemanticSearch.js\n');

    } catch (error) {
        console.error('\n❌ Reindexing failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the reindexing
reindexSemanticIndex();
