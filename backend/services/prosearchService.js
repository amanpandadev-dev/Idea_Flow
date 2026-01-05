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
import pg from 'pg';
const { Pool } = pg;

// Database pool for lexical search
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Configuration
const CHROMA_COLLECTION = 'ideas_semantic_index';
const MAX_RESULTS = 300; // Increased from 100 to 300
const DEFAULT_EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'gemini';

/**
 * Detect if query is keyword-style (short, exact terms)
 * @param {string} query - User query
 * @returns {boolean} True if keyword-style query
 */
function isKeywordStyleQuery(query) {
    const trimmed = query.trim();
    const wordCount = trimmed.split(/\s+/).length;

    return (
        wordCount <= 2 ||
        /^[a-zA-Z]+$/.test(trimmed) ||
        trimmed === trimmed.toLowerCase()
    );
}

/**
 * Perform lexical search against ideas database
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of {ideaId, lexicalScore}
 */
async function lexicalSearch(query) {
    const q = query.toLowerCase();

    try {
        const result = await pool.query(`
            SELECT 
                idea_id,
                title,
                summary,
                theme,
                benefits,
                CASE
                    WHEN LOWER(title) LIKE $1 THEN 1.0
                    WHEN LOWER(summary) LIKE $1 THEN 0.6
                    WHEN LOWER(theme) LIKE $1 THEN 0.4
                    WHEN LOWER(benefits) LIKE $1 THEN 0.3
                    ELSE 0
                END as lexical_score
            FROM ideas
            WHERE 
                LOWER(title) LIKE $1 OR
                LOWER(summary) LIKE $1 OR
                LOWER(theme) LIKE $1 OR
                LOWER(benefits) LIKE $1
            ORDER BY lexical_score DESC
            LIMIT 100
        `, [`%${q}%`]);

        return result.rows.map(row => ({
            ideaId: row.idea_id,
            lexicalScore: parseFloat(row.lexical_score)
        }));
    } catch (error) {
        console.error('[lexicalSearch] Error:', error);
        return []; // Return empty array on error, don't break semantic search
    }
}

/**
 * Merge semantic and lexical search results
 * @param {number[]} semanticIds - IDs from ChromaDB (ordered by relevance)
 * @param {Array} lexicalResults - Array of {ideaId, lexicalScore}
 * @returns {number[]} Merged and ranked idea IDs
 */
function mergeResults(semanticIds, lexicalResults) {
    const merged = new Map();

    // Add semantic results (normalized score based on rank)
    semanticIds.forEach((id, index) => {
        const semanticScore = 1.0 - (index / Math.max(semanticIds.length, 1));
        merged.set(id, {
            ideaId: id,
            semanticScore,
            lexicalScore: 0,
            finalScore: semanticScore * 0.5
        });
    });

    // Add/merge lexical results
    lexicalResults.forEach(({ ideaId, lexicalScore }) => {
        if (merged.has(ideaId)) {
            // Idea exists in both - combine scores
            const existing = merged.get(ideaId);
            existing.lexicalScore = lexicalScore;
            existing.finalScore = (existing.semanticScore * 0.5) + (lexicalScore * 0.5);
        } else {
            // Lexical-only match
            merged.set(ideaId, {
                ideaId,
                semanticScore: 0,
                lexicalScore,
                finalScore: lexicalScore * 0.5
            });
        }
    });

    // Sort by final score and return IDs
    return Array.from(merged.values())
        .sort((a, b) => b.finalScore - a.finalScore)
        .map(item => item.ideaId);
}

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

        // Step 2: Semantic search via ChromaDB (existing)
        console.log('[createNewConversation] Querying ChromaDB...');
        const chromaClient = getChromaClient();
        const collection = await chromaClient.getOrCreateCollection({ name: CHROMA_COLLECTION });

        const searchResults = await collection.query({
            queryEmbeddings: [embedding],
            nResults: MAX_RESULTS
        });

        // Extract idea IDs from ChromaDB results
        const semanticIds = extractIdeaIds(searchResults);
        console.log('[createNewConversation] Semantic results:', semanticIds.length);

        // Step 3: Lexical search (NEW - Hybrid Retrieval)
        console.log('[createNewConversation] Running lexical search...');
        const lexicalResults = await lexicalSearch(query);
        console.log('[createNewConversation] Lexical results:', lexicalResults.length);

        // Step 4: Merge results (NEW - Hybrid Retrieval)
        console.log('[createNewConversation] Merging semantic + lexical results...');
        const mergedIds = mergeResults(semanticIds, lexicalResults);
        console.log('[createNewConversation] Merged results:', mergedIds.length, '(semantic:', semanticIds.length, ', lexical:', lexicalResults.length, ')');

        // Step 5: Store conversation state using conversationStateManager
        console.log('[createNewConversation] Storing conversation state...');
        const newConversationId = await createConversation(query, mergedIds);
        console.log('[createNewConversation] Conversation created:', newConversationId);

        // Step 6: Hydrate results using resultHydrator
        console.log('[createNewConversation] Hydrating results...');
        const results = await hydrateResults(mergedIds, mergedIds);

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

        // Step 5: Hydrate results using resultHydrator
        console.log('[processFollowUp] Hydrating results...');
        const results = await hydrateResults(filteredIds, conversation.base_result_ids);

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
 * Extract idea IDs from ChromaDB search results
 * 
 * @param {Object} searchResults - ChromaDB query results
 * @returns {number[]} Array of idea IDs
 */
function extractIdeaIds(searchResults) {
    if (!searchResults || !searchResults.ids || searchResults.ids.length === 0) {
        return [];
    }

    // ChromaDB returns results as [[id1, id2, ...]]
    const ids = searchResults.ids[0] || [];

    // Extract numeric idea_id from metadata or parse from ID string
    const ideaIds = [];
    const metadatas = searchResults.metadatas?.[0] || [];

    for (let i = 0; i < ids.length; i++) {
        const metadata = metadatas[i];

        // Try to get idea_id from metadata first
        if (metadata && metadata.idea_id) {
            ideaIds.push(parseInt(metadata.idea_id));
        } else {
            // Fallback: parse from ID string (format: "idea_123")
            const idString = ids[i];
            const match = idString.match(/idea_(\d+)/);
            if (match) {
                ideaIds.push(parseInt(match[1]));
            }
        }
    }

    return ideaIds;
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
