/**
 * ProSearch Service
 * Core orchestration service for conversational semantic search
 * 
 * This service coordinates the entire ProSearch workflow:
 * - New conversations: Embedding → ChromaDB query → Store state
 * - Follow-ups: Load state → Extract filters → Apply filters → Update state
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4
 * 
 * @module prosearchService
 */

import { generateEmbeddingWithRetry } from './embeddingService.js';
import { getChromaClient } from '../config/chroma.js';
import { createConversation, loadConversation, updateConversation } from './conversationStateManager.js';
import { extractFilters } from './filterExtractor.js';
import { applyFilters, getEffectiveFilters } from './filterApplicator.js';
import { hydrateResults } from './resultHydrator.js';

// Configuration
const CHROMA_COLLECTION = 'ideas_semantic_index';
const MAX_RESULTS = 250; // Reduced from 300 for better quality focus
const DEFAULT_EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'gemini';

/**
 * Process a ProSearch chat message
 * Main entry point for all ProSearch interactions
 * 
 * @param {string|null} conversationId - Existing conversation ID or null for new conversation
 * @param {string} message - User's natural language query/message
 * @returns {Promise<ProSearchResponse>}
 */
export async function processChat(conversationId, message) {
    // Validate inputs
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('message must be a non-empty string');
    }

    // Route to appropriate handler
    if (!conversationId) {
        // New conversation - perform semantic search
        return await createNewConversation(message);
    } else {
        // Existing conversation - apply filters
        return await processFollowUp(conversationId, message);
    }
}

/**
 * Create new conversation with initial semantic search
 * 
 * Flow:
 * 1. Generate embedding for user query
 * 2. Query ChromaDB for semantic matches
 * 3. Store conversation state in PostgreSQL
 * 4. Hydrate and return results
 * 
 * @param {string} query - User's search query
 * @returns {Promise<ProSearchResponse>}
 */
export async function createNewConversation(query) {
    try {
        console.log('[createNewConversation] Starting new conversation with query:', query);

        // Step 1: Generate embedding using embeddingService
        console.log('[createNewConversation] Generating embedding...');
        const embedding = await generateEmbeddingWithRetry(query, DEFAULT_EMBEDDING_PROVIDER);
        console.log('[createNewConversation] Embedding generated, dimension:', embedding.length);

        // Step 2: Query ChromaDB using existing chroma.js client
        console.log('[createNewConversation] Querying ChromaDB...');
        const chromaClient = getChromaClient();
        const collection = await chromaClient.getOrCreateCollection({ name: CHROMA_COLLECTION });

        const searchResults = await collection.query({
            queryEmbeddings: [embedding],
            nResults: MAX_RESULTS
        });

        // Extract idea IDs AND similarity scores from ChromaDB results
        const { ideaIds, similarities } = extractIdeaIdsWithScores(searchResults);
        console.log('[ProSearch] Query:', query);
        console.log('[ProSearch] Raw results from Chroma:', ideaIds.length);

        // Calculate normalized scores (direct conversion: similarity * 100)
        const normalizedScores = calculateNormalizedScores(similarities);

        if (similarities.length > 0 && normalizedScores.length > 0) {
            const minScore = Math.min(...normalizedScores);
            const maxScore = Math.max(...normalizedScores);
            console.log('[ProSearch] Similarity range: ' + (Math.min(...similarities) * 100).toFixed(2) + '% - ' + (Math.max(...similarities) * 100).toFixed(2) + '%');
            console.log('[ProSearch] Score range: ' + minScore + '% - ' + maxScore + '%');
        }

        // Step 3: Store conversation state WITH normalized scores
        console.log('[createNewConversation] Storing conversation state with scores...');
        const newConversationId = await createConversation(query, ideaIds, normalizedScores);
        console.log('[createNewConversation] Conversation created:', newConversationId);

        // Step 4: Hydrate results using normalized scores
        console.log('[createNewConversation] Hydrating results with normalized scores...');
        const results = await hydrateResults(ideaIds, ideaIds, {
            applyScoreFilter: true,
            chromaScores: normalizedScores  // Pass normalized scores
        });

        console.log('[ProSearch] >=90% results count:', results.length);

        // Return ProSearchResponse
        return {
            conversationId: newConversationId,
            results: results,
            appliedFilters: {
                technologies: [],
                businessGroups: [],
                themes: [],
                years: []
            },
            isNewBaseSearch: true
        };
    } catch (error) {
        console.error('[createNewConversation] Error:', error);
        throw new Error(`Failed to create new conversation: ${error.message}`);
    }
}

/**
 * Process follow-up message in existing conversation
 * 
 * Flow:
 * 1. Load conversation state from PostgreSQL
 * 2. Extract filters from user message
 * 3. Apply filters to base result set
 * 4. Update conversation state
 * 5. Hydrate and return results
 * 
 * @param {string} conversationId - Conversation UUID
 * @param {string} message - User message
 * @returns {Promise<ProSearchResponse>}
 */
export async function processFollowUp(conversationId, message) {
    try {
        console.log('[processFollowUp] Processing follow-up for conversation:', conversationId);

        // Step 1: Load conversation state
        console.log('[processFollowUp] Loading conversation state...');
        const conversation = await loadConversation(conversationId);

        if (!conversation) {
            throw new Error(`Conversation not found: ${conversationId}`);
        }

        console.log('[processFollowUp] Conversation loaded, base results:', conversation.base_result_ids.length);

        // Step 2: Extract filters using filterExtractor
        console.log('[processFollowUp] Extracting filters from message...');
        const extractedFilters = extractFilters(message);
        console.log('[processFollowUp] Extracted filters:', extractedFilters);

        // Step 3: Apply filters using filterApplicator
        console.log('[processFollowUp] Applying filters to base results...');
        const filteredIds = await applyFilters(
            conversation.base_result_ids,
            extractedFilters,
            conversation.applied_filters,
            extractedFilters.mode
        );
        console.log('[processFollowUp] Filtered results:', filteredIds.length);

        // Calculate effective filters after applying mode
        const effectiveFilters = getEffectiveFilters(
            extractedFilters,
            conversation.applied_filters,
            extractedFilters.mode
        );

        // Step 4: Update conversation state
        console.log('[processFollowUp] Updating conversation state...');
        await updateConversation(conversationId, filteredIds, effectiveFilters);

        // Step 5: Hydrate results using resultHydrator WITH stored scores
        console.log('[processFollowUp] Hydrating results with stored scores...');

        // Get scores for the filtered IDs from the stored base scores
        const filteredScores = filteredIds.map(id => {
            const index = conversation.base_result_ids.indexOf(id);
            return index !== -1 && conversation.base_result_scores?.[index]
                ? conversation.base_result_scores[index]
                : 0;
        });

        const results = await hydrateResults(filteredIds, conversation.base_result_ids, {
            applyScoreFilter: true,
            chromaScores: filteredScores  // Use stored scores
        });

        // Return ProSearchResponse
        return {
            conversationId: conversationId,
            results: results,
            appliedFilters: effectiveFilters,
            isNewBaseSearch: false
        };
    } catch (error) {
        console.error('[processFollowUp] Error:', error);
        throw new Error(`Failed to process follow-up: ${error.message}`);
    }
}

/**
 * Calculate scores relative to TOP result
 * Top match = 100%, others scaled proportionally
 * Filter at 70% means: show results down to 70% of the top score
 * 
 * @param {number[]} similarities - ChromaDB similarity scores (0-1 range, where 1 = perfect match)
 * @returns {number[]} Array of percentage scores (0-100) relative to top result
 */
function calculateNormalizedScores(similarities) {
    if (similarities.length === 0) return [];

    // LOG: Raw Chroma distance stats for debugging
    const rawDistances = similarities.map(sim => 1 - sim);
    console.log('[ProSearch] Raw Chroma distances: min=' + Math.min(...rawDistances).toFixed(3) + ', max=' + Math.max(...rawDistances).toFixed(3));

    // Find the BEST similarity (top result)
    const maxSimilarity = Math.max(...similarities);

    // RELATIVE SCORING TO TOP RESULT
    // Top result gets 100%, others scaled proportionally
    // If top = 0.57, and current = 0.40 → (0.40 / 0.57) * 100 = 70%
    const scores = similarities.map(sim => {
        if (maxSimilarity === 0) return 0; // Avoid division by zero
        const scorePercent = Math.round((sim / maxSimilarity) * 100);
        return scorePercent;
    });

    // LOG: Score distribution for debugging
    const above90 = scores.filter(s => s >= 90).length;
    console.log('[ProSearch] Top similarity: ' + (maxSimilarity * 100).toFixed(2) + '% (absolute)');
    console.log('[ProSearch] Score distribution: ' + scores.length + ' total, ' + above90 + ' >=90% of top');
    console.log('[ProSearch] Display score range: ' + Math.min(...scores) + '% - ' + Math.max(...scores) + '%');

    return scores;
}

/**
 * Extract idea IDs AND similarity scores from ChromaDB search results
 * 
 * @param {Object} searchResults - ChromaDB query results
 * @returns {Object} { ideaIds: number[], similarities: number[] }
 */
function extractIdeaIdsWithScores(searchResults) {
    if (!searchResults || !searchResults.ids || searchResults.ids.length === 0) {
        return { ideaIds: [], similarities: [] };
    }

    // ChromaDB returns results as [[id1, id2, ...]]
    const ids = searchResults.ids[0] || [];
    const distances = searchResults.distances?.[0] || [];
    const metadatas = searchResults.metadatas?.[0] || [];

    // Extract numeric idea_id from metadata or parse from ID string
    const ideaIds = [];
    const similarities = [];

    for (let i = 0; i < ids.length; i++) {
        const metadata = metadatas[i];

        // Extract idea_id
        let ideaId = null;
        if (metadata && metadata.idea_id) {
            ideaId = parseInt(metadata.idea_id);
        } else {
            // Fallback: parse from ID string (format: "idea_123")
            const idString = ids[i];
            const match = idString.match(/idea_(\d+)/);
            if (match) {
                ideaId = parseInt(match[1]);
            }
        }

        if (ideaId) {
            ideaIds.push(ideaId);

            // Convert distance to similarity (distance: 0 = best, 1 = worst)
            // similarity = 1 - distance
            const distance = distances[i] !== undefined ? distances[i] : 0;
            const similarity = 1 - distance;
            similarities.push(similarity);
        }
    }

    return { ideaIds, similarities };
}

/**
 * Get conversation state (for debugging/testing)
 * 
 * @param {string} conversationId - Conversation UUID
 * @returns {Promise<Object>} Conversation state
 */
export async function getConversationState(conversationId) {
    return await loadConversation(conversationId);
}

export default {
    processChat,
    createNewConversation,
    processFollowUp,
    getConversationState
};
