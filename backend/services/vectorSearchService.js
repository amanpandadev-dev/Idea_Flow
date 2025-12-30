/**
 * ProSearch Vector Search Service
 * ONE-TIME semantic search using existing ChromaDB collection
 * 
 * CRITICAL: This should ONLY be called for NEW conversations
 */

import { getChromaClient } from '../config/chroma.js';
import { getEmbeddingVector } from './embeddingProvider.js';

/**
 * Perform semantic search on ideas (ONE TIME ONLY)
 * @param {string} query - User's search query
 * @returns {Promise<{ideaIds: number[], scores: number[]}>}
 */
export async function semanticSearch(query) {
    console.log('[VectorSearch] Performing ONE-TIME semantic search');
    console.log('[VectorSearch] Query:', query.substring(0, 100));

    try {
        // Step 1: Generate embedding for query
        const embedding = await getEmbeddingVector(query.substring(0, 1500), 'llama');
        console.log(`[VectorSearch] Generated embedding: ${embedding.length} dimensions`);

        // Step 2: Query existing ChromaDB collection
        const chromaClient = getChromaClient();
        const collection = await chromaClient.getCollection({ name: 'ideas_semantic_index' });

        // Query for top 300 results
        const results = await collection.query({
            queryEmbeddings: [embedding],
            nResults: 300
        });

        console.log(`[VectorSearch] ChromaDB returned ${results.ids[0]?.length || 0} results`);

        // Step 3: Extract idea IDs and scores
        const ideaIds = [];
        const scores = [];

        if (results.ids && results.ids[0]) {
            for (let i = 0; i < results.ids[0].length; i++) {
                const id = results.ids[0][i];
                const distance = results.distances[0][i];

                // Convert ChromaDB ID format (e.g., "idea_4460") to integer
                const ideaId = parseInt(id.replace(/[^\d]/g, ''), 10);

                if (!isNaN(ideaId)) {
                    ideaIds.push(ideaId);
                    // Convert distance to similarity score (lower distance = higher similarity)
                    scores.push(1 - distance);
                }
            }
        }

        console.log(`[VectorSearch] Extracted ${ideaIds.length} idea IDs`);
        console.log(`[VectorSearch] Score range: ${Math.min(...scores).toFixed(3)} - ${Math.max(...scores).toFixed(3)}`);

        return { ideaIds, scores };

    } catch (error) {
        console.error('[VectorSearch] Error:', error.message);
        throw new Error(`Semantic search failed: ${error.message}`);
    }
}

/**
 * Validate that this is a NEW conversation (should not have base results yet)
 * @param {Object|null} conversation - Existing conversation or null
 * @throws {Error} If trying to run vector search on existing conversation
 */
export function validateNewConversation(conversation) {
    if (conversation && conversation.base_result_ids && conversation.base_result_ids.length > 0) {
        throw new Error('INVALID: Attempted vector search on existing conversation');
    }
}
