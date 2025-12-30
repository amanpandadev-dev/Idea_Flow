/**
 * Conversation State Manager
 * Handles persistence and retrieval of ProSearch conversation state in PostgreSQL
 * 
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

/**
 * Create a new conversation record
 * @param {string} baseQuery - Initial search query
 * @param {number[]} baseResultIds - IDs from ChromaDB search
 * @returns {Promise<string>} conversationId - UUID of created conversation
 */
export async function createConversation(baseQuery, baseResultIds) {
    if (!baseQuery || typeof baseQuery !== 'string') {
        throw new Error('baseQuery must be a non-empty string');
    }
    
    if (!Array.isArray(baseResultIds)) {
        throw new Error('baseResultIds must be an array');
    }

    try {
        const result = await pool.query(`
            INSERT INTO prosearch_conversations (
                base_query,
                base_result_ids,
                current_result_ids,
                applied_filters
            )
            VALUES ($1, $2, $3, $4)
            RETURNING conversation_id
        `, [
            baseQuery,
            baseResultIds,
            baseResultIds, // Initially, current results = base results
            JSON.stringify({
                technologies: [],
                businessGroups: [],
                themes: [],
                years: []
            })
        ]);

        return result.rows[0].conversation_id;
    } catch (error) {
        console.error('[createConversation] Error:', error);
        throw error;
    }
}

/**
 * Load conversation state by ID
 * @param {string} conversationId - Conversation UUID
 * @returns {Promise<Object>} Conversation state object
 */
export async function loadConversation(conversationId) {
    if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('conversationId must be a non-empty string');
    }

    try {
        const result = await pool.query(`
            SELECT 
                conversation_id,
                base_query,
                base_result_ids,
                current_result_ids,
                applied_filters,
                created_at,
                updated_at
            FROM prosearch_conversations
            WHERE conversation_id = $1
        `, [conversationId]);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            conversation_id: row.conversation_id,
            base_query: row.base_query,
            base_result_ids: row.base_result_ids,
            current_result_ids: row.current_result_ids,
            applied_filters: row.applied_filters,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    } catch (error) {
        console.error('[loadConversation] Error:', error);
        throw error;
    }
}

/**
 * Update conversation with new filters and results
 * @param {string} conversationId - Conversation UUID
 * @param {number[]} currentResultIds - Filtered result IDs
 * @param {Object} appliedFilters - Current filter state
 * @returns {Promise<void>}
 */
export async function updateConversation(conversationId, currentResultIds, appliedFilters) {
    if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('conversationId must be a non-empty string');
    }
    
    if (!Array.isArray(currentResultIds)) {
        throw new Error('currentResultIds must be an array');
    }
    
    if (!appliedFilters || typeof appliedFilters !== 'object') {
        throw new Error('appliedFilters must be an object');
    }

    try {
        const result = await pool.query(`
            UPDATE prosearch_conversations
            SET 
                current_result_ids = $1,
                applied_filters = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE conversation_id = $3
            RETURNING conversation_id
        `, [
            currentResultIds,
            JSON.stringify(appliedFilters),
            conversationId
        ]);

        if (result.rows.length === 0) {
            throw new Error(`Conversation not found: ${conversationId}`);
        }
    } catch (error) {
        console.error('[updateConversation] Error:', error);
        throw error;
    }
}

export default {
    createConversation,
    loadConversation,
    updateConversation
};
