import pg from 'pg';
import { getEphemeralCollection, queryCollection } from '../../services/vectorStoreService.js';
import { generateSingleEmbedding as generateEmbedding } from '../../services/embeddingService.js';

const { Pool } = pg;

/**
 * TIER-1 ENHANCEMENT: Re-ranking configuration
 */
const RERANK_CONFIG = {
    weights: {
        similarity: 0.6,
        recency: 0.2,
        metadata: 0.2
    },
    topKInitial: 20,
    topKFinal: 5
};

/**
 * Base Tool class
 */
class BaseTool {
    constructor(name, description) {
        this.name = name;
        this.description = description;
    }

    async execute(input) {
        throw new Error('execute() must be implemented');
    }

    async _call(input) {
        return this.execute(input);
    }
}

/**
 * Internal RAG Tool for searching idea repository
 * Combines PostgreSQL search with optional ephemeral context
 */
export class InternalRAGTool extends BaseTool {
    constructor(pool, userId = null, embeddingProvider = 'gemini') {
        super(
            'internal_rag',
            `Search the internal idea repository for relevant innovations and projects.
Use this tool when you need:
- Internal ideas and innovations
- Past projects and solutions
- Team expertise and capabilities
- Similar ideas or synergies
- Domain-specific internal knowledge
Input should be a search query describing what you're looking for.`
        );

        this.pool = pool;
        this.userId = userId;
        this.embeddingProvider = embeddingProvider;
    }

    /**
     * Execute internal search combining DB and ephemeral context
     * @param {string} query - Search query
     * @returns {Promise<string>} Search results as formatted string
     */
    async execute(query) {
        try {
            console.log(`🔍 Internal RAG search: "${query}"`);

            // Check for ephemeral context
            const ephemeralResults = await this.searchEphemeralContext(query);

            // Search PostgreSQL
            const dbResults = await this.searchDatabase(query);

            // Combine and format results
            return this.formatResults(dbResults, ephemeralResults);
        } catch (error) {
            console.error('Internal RAG error:', error.message);
            return `Internal search failed: ${error.message}`;
        }
    }

    /**
     * Search ephemeral context if available
     * @param {string} query - Search query
     * @returns {Promise<Array>} Ephemeral context results
     */
    async searchEphemeralContext(query) {
        // Return early if no user ID (no uploaded context)
        if (!this.userId) {
            console.log('[InternalRAG] No user ID - skipping ephemeral context search');
            return [];
        }

        const collectionId = `user_${this.userId}`;

        try {
            const collection = await getEphemeralCollection(collectionId);
            if (!collection) {
                console.log(`[InternalRAG] No ephemeral collection found for user: ${this.userId}`);
                return [];
            }

            // Generate query embedding
            const queryEmbedding = await generateEmbedding(query, this.embeddingProvider);

            if (!queryEmbedding || queryEmbedding.length === 0) {
                console.warn('[InternalRAG] Failed to generate query embedding');
                return [];
            }

            // TIER-1 ENHANCEMENT: Query more results for re-ranking
            const results = await queryCollection(collectionId, queryEmbedding, RERANK_CONFIG.topKInitial);

            if (!results || !results.documents || results.documents.length === 0) {
                console.log('[InternalRAG] No documents found in ephemeral context');
                return [];
            }

            // Re-rank results
            const reranked = this.rerank(results, query);
            const topResults = reranked.slice(0, RERANK_CONFIG.topKFinal);

            console.log(`[InternalRAG] ✅ Re-ranked ${results.documents.length} → ${topResults.length} results`);

            // Return re-ranked results with scores
            return topResults.map(result => ({
                source: 'ephemeral_context',
                content: result.document,
                relevance: result.score,
                metadata: result.metadata
            }));
        } catch (error) {
            console.warn('[InternalRAG] Ephemeral context search failed:', error.message);
            return [];
        }
    }

    /**
     * Search PostgreSQL database
     * @param {string} query - Search query
     * @returns {Promise<Array>} Database results
     */
    async searchDatabase(query) {
        if (!this.pool) {
            return [];
        }

        try {
            const searchQuery = `
        SELECT 
          i.idea_id,
          i.title,
          i.summary,
          i.theme as domain,
          i.business_group,
          i.code_preference as technologies,
          i.score,
          i.created_at
        FROM ideas i
        WHERE 
          i.title ILIKE $1 OR 
          i.summary ILIKE $1 OR 
          i.theme ILIKE $1
        ORDER BY i.score DESC, i.created_at DESC
        LIMIT 5
      `;

            const result = await this.pool.query(searchQuery, [`%${query}%`]);

            return result.rows.map(row => ({
                source: 'database',
                ideaId: `IDEA-${row.idea_id}`,
                title: row.title,
                summary: row.summary || '',
                domain: row.domain || '',
                businessGroup: row.business_group || '',
                technologies: row.technologies || '',
                score: row.score || 0,
                createdAt: row.created_at
            }));
        } catch (error) {
            console.error('Database search error:', error.message);
            return [];
        }
    }

    /**
     * Format combined results with clear source indicators
     * @param {Array} dbResults - Database results
     * @param {Array} ephemeralResults - Ephemeral context results
     * @returns {string} Formatted results
     */
    formatResults(dbResults, ephemeralResults) {
        let output = 'Internal Search Results:\n\n';

        // Add ephemeral context results first (if available)
        if (ephemeralResults.length > 0) {
            output += '📄 FROM UPLOADED DOCUMENT CONTEXT:\n';
            output += '─'.repeat(50) + '\n';

            // Sort by relevance (highest first)
            const sortedEphemeral = [...ephemeralResults].sort((a, b) => b.relevance - a.relevance);

            sortedEphemeral.forEach((result, index) => {
                const relevancePercent = (result.relevance * 100).toFixed(0);
                output += `\n[Document Chunk ${index + 1}] Relevance: ${relevancePercent}%\n`;

                if (result.metadata?.filename) {
                    output += `Source: ${result.metadata.filename}\n`;
                }

                // Show more content for highly relevant chunks
                const contentLength = result.relevance > 0.7 ? 300 : 200;
                output += `${result.content.substring(0, contentLength)}${result.content.length > contentLength ? '...' : ''}\n`;
            });

            output += '\n' + '─'.repeat(50) + '\n\n';
        }

        // Add database results
        if (dbResults.length > 0) {
            output += '💡 FROM IDEA REPOSITORY:\n';
            output += '─'.repeat(50) + '\n';

            dbResults.forEach((idea, index) => {
                output += `\n[${index + 1}] ${idea.ideaId}: ${idea.title}\n`;
                output += `   Domain: ${idea.domain || 'N/A'}\n`;
                output += `   Business Group: ${idea.businessGroup || 'N/A'}\n`;
                output += `   Summary: ${idea.summary.substring(0, 150)}${idea.summary.length > 150 ? '...' : ''}\n`;
                output += `   Score: ${idea.score}/10\n`;
            });

            output += '\n' + '─'.repeat(50) + '\n';
        } else if (ephemeralResults.length === 0) {
            output += 'No matching ideas found in repository.\n';
        }

        if (dbResults.length === 0 && ephemeralResults.length === 0) {
            output = 'No internal results found. Try broader search terms or upload a document for context.';
        }

        return output;
    }

    /**
     * TIER-1 ENHANCEMENT: Re-rank search results using multi-signal scoring
     * @param {Object} results - ChromaDB query results
     * @param {string} query - Original query
     * @returns {Array} Scored and sorted results
     */
    rerank(results, query) {
        const scoredResults = results.documents.map((doc, i) => {
            const similarity = 1 - (results.distances[i] || 0);
            const metadata = results.metadatas[i];

            // Calculate recency boost (0-1)
            const recencyScore = this.calculateRecencyScore(metadata.uploadedAt || metadata.createdAt);

            // Calculate metadata relevance (0-1)
            const metadataScore = this.calculateMetadataScore(metadata, query);

            // Weighted final score
            const finalScore =
                RERANK_CONFIG.weights.similarity * similarity +
                RERANK_CONFIG.weights.recency * recencyScore +
                RERANK_CONFIG.weights.metadata * metadataScore;

            console.log(`[Rerank] ${i}: sim=${similarity.toFixed(3)}, rec=${recencyScore.toFixed(3)}, meta=${metadataScore.toFixed(3)} → final=${finalScore.toFixed(3)}`);

            return {
                id: results.ids[i],
                score: finalScore,
                similarity,
                recencyScore,
                metadataScore,
                document: doc,
                metadata
            };
        });

        // Sort by final score descending
        return scoredResults.sort((a, b) => b.score - a.score);
    }

    /**
     * Calculate recency boost score
     * @param {string|number} timestamp - Upload timestamp
     * @returns {number} Score 0-1
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
     * @param {Object} metadata - Document metadata
     * @param {string} query - Search query
     * @returns {number} Score 0-1
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
}

export default InternalRAGTool;
