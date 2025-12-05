import pg from 'pg';
import { getEphemeralCollection, queryCollection } from '../../services/vectorStoreService.js';
import { generateSingleEmbedding as generateEmbedding } from '../../services/embeddingService.js';

const { Pool } = pg;

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

            // Query collection
            const results = await queryCollection(collectionId, queryEmbedding, 3);

            if (!results || !results.documents || results.documents.length === 0) {
                console.log('[InternalRAG] No documents found in ephemeral context');
                return [];
            }

            // Calculate relevance scores (normalize distance to 0-1 similarity)
            return results.documents.map((doc, index) => {
                const distance = results.distances[index] || 0;
                // Convert L2 distance to similarity score (0-1, higher is better)
                const relevance = 1 / (1 + distance);

                return {
                    source: 'ephemeral_context',
                    content: doc,
                    relevance: Math.max(0, Math.min(1, relevance)),
                    metadata: results.metadatas[index]
                };
            });
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
          i.challenge_opportunity as domain,
          i.business_group,
          i.code_preference as technologies,
          i.score,
          i.created_at
        FROM ideas i
        WHERE 
          i.title ILIKE $1 OR 
          i.summary ILIKE $1 OR 
          i.challenge_opportunity ILIKE $1
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
}

export default InternalRAGTool;
