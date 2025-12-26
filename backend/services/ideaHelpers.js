/**
 * Idea Helpers
 * Utility functions for fetching and manipulating idea data
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

/**
 * Fetch full idea details by IDs
 * Used to rehydrate results from stored IDs in conversation_search_state
 * 
 * @param {number[]} ideaIds - Array of idea IDs
 * @returns {Promise<Array>} Array of idea objects with metadata
 */
export async function fetchIdeasByIds(ideaIds) {
    if (!ideaIds || ideaIds.length === 0) {
        return [];
    }

    try {
        const result = await pool.query(`
            SELECT 
                idea_id,
                title,
                summary,
                theme,
                business_group,
                score
            FROM ideas
            WHERE idea_id = ANY($1::int[])
        `, [ideaIds]);

        // Format results to match ChromaDB structure
        // NOTE: Technologies and other metadata will be populated from ChromaDB in the initial search
        // For rehydration, we rely on the context's indexes which are rebuilt from these base results
        return result.rows.map(row => ({
            id: `idea_${row.idea_id}`,
            ideaId: row.idea_id,
            title: row.title,
            summary: row.summary,
            document: `${row.title}. ${row.summary}`,
            metadata: {
                idea_id: row.idea_id,
                title: row.title,
                summary: row.summary,
                theme: row.theme,
                domain: row.theme,  // Map for compatibility
                business_group: row.business_group,
                score: row.score,
                impact_score: row.score  // Map for compatibility
            },
            // Placeholder similarity score
            similarity: 0.85
        }));
    } catch (error) {
        console.error('[fetchIdeasByIds] Error:', error);
        throw error;
    }
}

export default { fetchIdeasByIds };
