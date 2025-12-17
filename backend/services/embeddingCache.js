/**
 * Embedding Cache Service
 * 
 * Content-addressable cache for embeddings to avoid regenerating
 * identical embeddings. Uses SHA-256 hashing for deduplication.
 * 
 * @module embeddingCache
 */

import crypto from 'crypto';
import { getEmbeddingVector } from './embeddingProvider.js';

export class EmbeddingCache {
    constructor(pool) {
        this.pool = pool;
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.sessionStart = Date.now();
    }

    /**
     * Get embedding for chunk, using cache if available
     * @param {string} chunkText - Text to embed
     * @param {string} provider - Embedding provider (llama, grok, gemini)
     * @returns {Promise<number[]>} 768-dimensional embedding vector
     */
    async getEmbedding(chunkText, provider = 'llama') {
        const hash = this.hashContent(chunkText);

        // Try cache first
        const cached = await this.getCachedEmbedding(hash, provider);
        if (cached) {
            this.cacheHits++;
            console.log(`[EmbeddingCache] ✅ HIT for hash ${hash.substring(0, 8)}... (provider: ${provider})`);
            return cached;
        }

        // Cache miss - generate new embedding
        this.cacheMisses++;
        console.log(`[EmbeddingCache] ❌ MISS for hash ${hash.substring(0, 8)}... Generating new embedding...`);

        const embedding = await getEmbeddingVector(chunkText, provider);

        // Store in cache (async, non-blocking)
        this.storeEmbedding(hash, chunkText, embedding, provider)
            .catch(err => console.error('[EmbeddingCache] Failed to cache embedding:', err.message));

        return embedding;
    }

    /**
     * Batch get embeddings with caching
     * @param {string[]} chunks - Array of text chunks
     * @param {string} provider - Embedding provider
     * @returns {Promise<number[][]>} Array of embeddings
     */
    async getBatchEmbeddings(chunks, provider = 'llama') {
        console.log(`[EmbeddingCache] Processing ${chunks.length} chunks with provider: ${provider}`);

        const embeddings = [];

        for (const chunk of chunks) {
            const embedding = await this.getEmbedding(chunk, provider);
            embeddings.push(embedding);
        }

        const total = this.cacheHits + this.cacheMisses;
        const hitRate = total > 0 ? (this.cacheHits / total) * 100 : 0;

        console.log(`[EmbeddingCache] 📊 Stats: ${this.cacheHits} hits, ${this.cacheMisses} misses (${hitRate.toFixed(1)}% hit rate)`);

        return embeddings;
    }

    /**
     * Hash chunk content for deduplication
     * @param {string} text - Text to hash
     * @returns {string} SHA-256 hash
     */
    hashContent(text) {
        return crypto.createHash('sha256').update(text.trim()).digest('hex');
    }

    /**
     * Get cached embedding from database
     * @private
     */
    async getCachedEmbedding(hash, provider) {
        try {
            const result = await this.pool.query(
                `SELECT embedding FROM chunk_embeddings 
                 WHERE content_hash = $1 AND embedding_provider = $2`,
                [hash, provider]
            );

            if (result.rows.length > 0) {
                // Update access stats (async, non-blocking)
                this.pool.query(
                    `UPDATE chunk_embeddings 
                     SET last_accessed_at = NOW(), access_count = access_count + 1 
                     WHERE content_hash = $1`,
                    [hash]
                ).catch(err => console.error('[EmbeddingCache] Failed to update stats:', err.message));

                // Parse embedding from database
                const embedding = result.rows[0].embedding;
                return Array.isArray(embedding) ? embedding : JSON.parse(embedding);
            }

            return null;
        } catch (error) {
            console.error('[EmbeddingCache] Error fetching from cache:', error.message);
            return null; // Graceful degradation
        }
    }

    /**
     * Store embedding in cache
     * @private
     */
    async storeEmbedding(hash, chunkText, embedding, provider) {
        try {
            // Limit chunk text storage to 2000 chars for database efficiency
            const truncatedText = chunkText.length > 2000
                ? chunkText.substring(0, 2000) + '...'
                : chunkText;

            await this.pool.query(
                `INSERT INTO chunk_embeddings (content_hash, chunk_text, embedding, embedding_provider)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (content_hash) DO UPDATE 
                 SET last_accessed_at = NOW(), access_count = chunk_embeddings.access_count + 1`,
                [hash, truncatedText, JSON.stringify(embedding), provider]
            );

            console.log(`[EmbeddingCache] 💾 Stored embedding for hash ${hash.substring(0, 8)}...`);
        } catch (error) {
            console.error('[EmbeddingCache] Error storing in cache:', error.message);
            // Non-fatal - embedding generation succeeded, caching is optimization
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache performance metrics
     */
    getStats() {
        const total = this.cacheHits + this.cacheMisses;
        const hitRate = total > 0 ? (this.cacheHits / total) * 100 : 0;
        const uptime = Date.now() - this.sessionStart;

        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            total,
            hitRate: hitRate.toFixed(2) + '%',
            uptime: Math.round(uptime / 1000) + 's'
        };
    }

    /**
     * Clear cache statistics (not the database)
     */
    resetStats() {
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.sessionStart = Date.now();
    }
}

export default EmbeddingCache;
