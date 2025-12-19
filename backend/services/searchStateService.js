/**
 * Search State Service
 * Manages persistence of search results across conversation sessions
 */

export class SearchStateService {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Save search state to database
     * @param {string} conversationId - UUID of conversation
     * @param {Object} state - Search state object
     */
    async saveSearchState(conversationId, state) {
        const {
            baseQuery,
            baseResultIds,
            currentResultIds,
            appliedFilters,
            baseDomain,
            baseResultsMetadata  // NEW: Full metadata array
        } = state;

        try {
            await this.pool.query(`
                INSERT INTO conversation_search_state 
                (conversation_id, base_query, base_result_ids, current_result_ids, applied_filters, base_domain, base_results_metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (conversation_id) 
                DO UPDATE SET
                    base_query = $2,
                    base_result_ids = $3,
                    current_result_ids = $4,
                    applied_filters = $5,
                    base_domain = $6,
                    base_results_metadata = $7,
                    updated_at = NOW()
            `, [
                conversationId,
                baseQuery,
                baseResultIds,
                currentResultIds,
                JSON.stringify(appliedFilters),
                baseDomain,
                JSON.stringify(baseResultsMetadata || [])
            ]);

            return true;
        } catch (error) {
            console.error('[SearchState] Save failed:', error.message);
            return false;
        }
    }

    /**
     * Load search state from database
     * @param {string} conversationId - UUID of conversation
     * @returns {Object|null} Search state or null if not found
     */
    async loadSearchState(conversationId) {
        try {
            const result = await this.pool.query(
                `SELECT * FROM conversation_search_state WHERE conversation_id = $1`,
                [conversationId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const state = result.rows[0];

            // Parse JSONB back to object
            return {
                baseQuery: state.base_query,
                baseResultIds: state.base_result_ids,
                currentResultIds: state.current_result_ids,
                appliedFilters: state.applied_filters || {},
                baseDomain: state.base_domain,
                baseResultsMetadata: state.base_results_metadata || [],  // NEW: Restore metadata
                createdAt: state.created_at,
                updatedAt: state.updated_at
            };
        } catch (error) {
            console.error('[SearchState] Load failed:', error.message);
            return null;
        }
    }

    /**
     * Delete search state for a conversation
     * @param {string} conversationId - UUID of conversation
     */
    async deleteSearchState(conversationId) {
        try {
            await this.pool.query(
                `DELETE FROM conversation_search_state WHERE conversation_id = $1`,
                [conversationId]
            );
            return true;
        } catch (error) {
            console.error('[SearchState] Delete failed:', error.message);
            return false;
        }
    }

    /**
     * Check if search state exists
     * @param {string} conversationId - UUID of conversation
     * @returns {boolean}
     */
    async hasSearchState(conversationId) {
        try {
            const result = await this.pool.query(
                `SELECT 1 FROM conversation_search_state WHERE conversation_id = $1 LIMIT 1`,
                [conversationId]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('[SearchState] Check failed:', error.message);
            return false;
        }
    }
}
