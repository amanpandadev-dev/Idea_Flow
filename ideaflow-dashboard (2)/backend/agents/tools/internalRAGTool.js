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
    constructor(pool, sessionId = null, embeddingProvider = 'llama') {
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
        this.sessionId = sessionId;
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
        if (!this.sessionId) {
            return [];
        }

        try {
            const collection = await getEphemeralCollection(this.sessionId);
            if (!collection) {
                return [];
            }

            // Generate query embedding
            const queryEmbedding = await generateEmbedding(query, this.embeddingProvider);

            // Query collection
            const results = await queryCollection(this.sessionId, queryEmbedding, 3);

            return results.documents.map((doc, index) => ({
                source: 'ephemeral_context',
                content: doc,
                relevance: 1 - (results.distances[index] || 0), // Convert distance to similarity
                metadata: results.metadatas[index]
            }));
        } catch (error) {
            console.warn('Ephemeral context search failed:', error.message);
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
     * Format combined results
     * @param {Array} dbResults - Database results
     * @param {Array} ephemeralResults - Ephemeral context results
     * @returns {string} Formatted results
     */
    formatResults(dbResults, ephemeralResults) {
        let output = 'Internal Search Results:\n\n';

        // Add ephemeral context results first
        if (ephemeralResults.length > 0) {
            output += '📄 From Uploaded Document:\n';
            ephemeralResults.forEach((result, index) => {
                output += `[Context ${index + 1}] (Relevance: ${(result.relevance * 100).toFixed(0)}%)\n`;
                output += `${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}\n\n`;
            });
            output += '---\n\n';
        }

        // Add database results
        if (dbResults.length > 0) {
            output += '💡 From Idea Repository:\n';
            dbResults.forEach((idea, index) => {
                output += `[${index + 1}] ${idea.ideaId}: ${idea.title}\n`;
                output += `Domain: ${idea.domain}\n`;
                output += `Business Group: ${idea.businessGroup}\n`;
                output += `Summary: ${idea.summary.substring(0, 150)}${idea.summary.length > 150 ? '...' : ''}\n`;
                output += `Score: ${idea.score}/10\n\n`;
            });
        } else {
            output += 'No matching ideas found in repository.\n';
        }

        if (dbResults.length === 0 && ephemeralResults.length === 0) {
            output = 'No internal results found. Try broader search terms.';
        }

        return output;
    }
}

export default InternalRAGTool;
