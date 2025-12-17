/**
 * TIER-1 Enhancement Integration Guide
 * 
 * This file contains code snippets for integrating all 4 TIER-1 enhancements
 * into the existing Agent Tab system.
 */

// ===================================================================
// 1. UPDATE documentService.js - Replace chunking with semantic chunking
// ===================================================================

// AT TOP OF FILE - Add import
import { semanticChunk } from '../utils/semanticChunker.js';

// REPLACE chunkText function (lines 156-174) with:
export async function chunkText(text, chunkSize = 400, overlap = 50) {
    if (!text || text.trim().length === 0) {
        return [];
    }

    // NEW: Use semantic chunking instead of character-based
    const chunks = semanticChunk(text, {
        targetSize: Math.ceil(chunkSize / 4), // Convert chars to approx tokens
        minSize: Math.ceil((chunkSize - overlap) / 4),
        maxSize: Math.ceil((chunkSize + overlap) / 4),
        overlapParagraphs: 1
    });

    return chunks.filter(chunk => chunk.trim().length > 0);
}

// ===================================================================
// 2. UPDATE contextRoutes.js - Add embedding cache
// ===================================================================

// AT TOP OF FILE - Add import
import { EmbeddingCache } from '../services/embeddingCache.js';

// IN /upload ROUTE (around line 65) - Replace embedding generation:

// OLD CODE:
// embeddings = await generateEmbeddings(processed.chunks, embeddingProvider);

// NEW CODE:
const pool = req.app.locals.pool;
const cache = new EmbeddingCache(pool);
embeddings = await cache.getBatchEmbeddings(processed.chunks, embeddingProvider);

console.log(`[Upload] Cache stats: ${JSON.stringify(cache.getStats())}`);

// ===================================================================
// 3. UPDATE vectorStoreService.js - Add TTL to collections
// ===================================================================

import { getChromaClient } from '../config/chroma.js';
import { semanticChunk } from '../utils/semanticChunker.js';

export async function chunkText(text, chunkSize = 400, overlap = 50) {
    if (!text || text.trim().length === 0) {
        return [];
    }

    // NEW: Use semantic chunking instead of character-based
    const chunks = semanticChunk(text, {
        targetSize: Math.ceil(chunkSize / 4), // Convert chars to approx tokens
        minSize: Math.ceil((chunkSize - overlap) / 4),
        maxSize: Math.ceil((chunkSize + overlap) / 4),
        overlapParagraphs: 1
    });

    return chunks.filter(chunk => chunk.trim().length > 0);
}

// ===================================================================
// 2. UPDATE contextRoutes.js - Add embedding cache
// ===================================================================

// AT TOP OF FILE - Add import
import { EmbeddingCache } from '../services/embeddingCache.js';

// IN /upload ROUTE (around line 65) - Replace embedding generation:

// OLD CODE:
// embeddings = await generateEmbeddings(processed.chunks, embeddingProvider);

// NEW CODE:
const pool = req.app.locals.pool;
const cache = new EmbeddingCache(pool);
embeddings = await cache.getBatchEmbeddings(processed.chunks, embeddingProvider);

console.log(`[Upload] Cache stats:${JSON.stringify(cache.getStats())}`);

// ===================================================================
// 3. UPDATE vectorStoreService.js - Add TTL to collections
// ===================================================================

// IN addDocuments function - Add TTL when creating collection:

export async function addDocuments(collectionId, chunks, embeddings, metadatas) {
    const client = await getChromaClient();

    let collection;
    try {
        collection = await client.getCollection({ name: collectionId });
        console.log(`[VectorStore] Using existing collection: ${collectionId}`);
    } catch {
        // Collection doesn't exist - create with TTL
        const now = Date.now();
        const ttlHours = parseInt(process.env.VECTOR_STORE_TTL_HOURS || '24');
        const ttl = ttlHours * 60 * 60 * 1000;
        const expiresAt = now + ttl;

        collection = await client.createCollection({
            name: collectionId,
            metadata: {
                createdAt: now,
                expiresAt: expiresAt,
                ttl: ttl,
                ttlHours: ttlHours
            }
        });

        console.log(`[VectorStore] ✅ Created collection ${collectionId} with ${ttlHours}h TTL (expires: ${new Date(expiresAt).toISOString()})`);
    }

    // ... rest of existing code ...
}

// ===================================================================
// 4. UPDATE server.js -Start cleanup job
// ===================================================================

// AT TOP OF FILE - Add import
import { VectorCleanupJob } from './backend/jobs/vectorCleanupJob.js';

// AFTER DATABASE CONNECTION - Start cleanup job:

// Start vector store cleanup job
const vectorCleanup = new VectorCleanupJob();
const cleanupIntervalMinutes = parseInt(process.env.VECTOR_CLEANUP_INTERVAL_MINS || '60');
vectorCleanup.start(cleanupIntervalMinutes);

console.log(`✅ Vector cleanup job started (runs every ${cleanupIntervalMinutes} minutes)`);

// OPTIONAL: Add admin endpoint for stats
app.get('/api/admin/vector-cleanup-stats', (req, res) => {
    res.json(vectorCleanup.getStats());
});

// ===================================================================
// 5. UPDATE internalRAGTool.js - Add re-ranking
// ===================================================================

// Add configuration at top of class:
const RERANK_CONFIG = {
    weights: {
        similarity: 0.6,
        recency: 0.2,
        metadata: 0.2
    },
    topKInitial: 20,
    topKFinal: 5
};

// IN execute() method - Add re-ranking after vector search:

// Change nResults to get more initial results
const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: RERANK_CONFIG.topKInitial  // Get 20 instead of 10
});

// NEW: Re-rank results
const rerankedResults = this.rerank(results, query);

// Take top 5 after re-ranking
const topResults = rerankedResults.slice(0, RERANK_CONFIG.topKFinal);

console.log(`[InternalRAG] ✅ Re-ranked ${RERANK_CONFIG.topKInitial} → ${RERANK_CONFIG.topKFinal} results`);

// Use topResults instead of results for formatting
const ephemeralResults = topResults.map(result => ({
    content: result.document,
    relevance: result.score,
    metadata: result.metadata
}));

// ADD NEW METHODS TO InternalRAGTool CLASS:

/**
 * Re-rank search results using multi-signal scoring
 */
rerank(results, query) {
    const scoredResults = results.ids[0].map((id, i) => {
        const similarity = 1 - results.distances[0][i];
        const metadata = results.metadatas[0][i];

        // Calculate recency boost (0-1)
        const recencyScore = this.calculateRecencyScore(metadata.uploadedAt || metadata.createdAt);

        // Calculate metadata relevance (0-1)
        const metadataScore = this.calculateMetadataScore(metadata, query);

        // Weighted final score
        const finalScore =
            RERANK_CONFIG.weights.similarity * similarity +
            RERANK_CONFIG.weights.recency * recencyScore +
            RERANK_CONFIG.weights.metadata * metadataScore;

        console.log(`[Rerank] ${id.substring(0, 12)}...: sim=${similarity.toFixed(3)}, rec=${recencyScore.toFixed(3)}, meta=${metadataScore.toFixed(3)} → final=${finalScore.toFixed(3)}`);

        return {
            id,
            score: finalScore,
            similarity,
            recencyScore,
            metadataScore,
            document: results.documents[0][i],
            metadata
        };
    });

    // Sort by final score descending
    return scoredResults.sort((a, b) => b.score - a.score);
}

/**
 * Calculate recency boost score
 */
calculateRecencyScore(timestamp) {
    if (!timestamp) return 0.5; // Neutral if no timestamp

    const now = Date.now();
    const uploaded = new Date(timestamp).getTime();
    const ageMs = now - uploaded;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Decay function: recent = 1.0, 30 days = 0.7, 365 days = 0.1
    if (ageDays < 1) return 1.0;
    if (ageDays < 30) return 1.0 - (ageDays / 30) * 0.3;
    return Math.max(0.1, 0.7 - ((ageDays - 30) / 335) * 0.6);
}

/**
 * Calculate metadata relevance score
 */
calculateMetadataScore(metadata, query) {
    let score = 0.5; // Baseline

    const queryLower = query.toLowerCase();

    // Boost if filename matches query terms
    if (metadata.filename) {
        const filenameWords = metadata.filename.toLowerCase().split(/[_\-\s.]+/);
        const matchingWords = filenameWords.filter(word =>
            word.length > 3 && queryLower.includes(word)
        );
        score += Math.min(0.3, matchingWords.length * 0.1);
    }

    // Boost for user-specific context (if userId matches)
    if (metadata.userId && this.userId && metadata.userId === this.userId) {
        score += 0.2;
    }

    return Math.min(1.0, score);
}

// ===================================================================
// 6. ENVIRONMENT VARIABLES (.env)
// ===================================================================

// Add to .env file:
VECTOR_STORE_TTL_HOURS = 24
VECTOR_CLEANUP_INTERVAL_MINS = 60

// ===================================================================
// 7. RUN DATABASE MIGRATION
// ===================================================================

// Execute in terminal:
psql - U postgres - d ideaflow - f backend / migrations / create_chunk_embeddings_cache.sql
