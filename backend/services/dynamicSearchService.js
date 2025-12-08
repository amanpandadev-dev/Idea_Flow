/**
 * Dynamic Search Service
 * Handles dynamic query generation, filter management, and hybrid search
 */

/**
 * Helper: Check if search text looks like garbage/nonsense
 */
function isGarbageQuery(text) {
    if (!text || text.trim().length === 0) return false;
    const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return true;
    // Check if single long word without vowels (likely random characters)
    if (words.length === 1 && words[0].length > 10 && !/[aeiou]/i.test(words[0])) return true;
    return false;
}

/**
 * Execute dynamic database search with filters
 * @param {object} pool - Database pool
 * @param {string} searchText - Search text
 * @param {object} filters - Filter object
 * @param {object} options - Search options
 */
export async function executeDynamicSearch(pool, searchText, filters = {}, options = {}) {
    const { limit = 100, offset = 0, sortBy = 'score', sortOrder = 'DESC' } = options;

    // If garbage query, return empty results immediately
    if (isGarbageQuery(searchText)) {
        console.log(`[DynamicSearch] Garbage query detected: "${searchText}", returning 0 results`);
        return {
            results: [],
            total: 0,
            source: 'database'
        };
    }

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Add text search condition - search across ALL text fields
    // Text search is REQUIRED when provided - must match at least one term (AND logic with filters)
    if (searchText && searchText.trim().length > 0) {
        const searchTerms = searchText.trim().split(/\s+/).filter(t => t.length > 2);
        
        if (searchTerms.length > 0) {
            const textConditions = searchTerms.map(term => {
                params.push(`%${term}%`);
                const idx = paramIndex++;
                return `(
                    title ILIKE $${idx} OR 
                    summary ILIKE $${idx} OR 
                    challenge_opportunity ILIKE $${idx} OR 
                    code_preference ILIKE $${idx} OR
                    business_group ILIKE $${idx} OR
                    COALESCE(benefits, '') ILIKE $${idx} OR
                    COALESCE(additional_info, '') ILIKE $${idx} OR
                    COALESCE(build_phase, '') ILIKE $${idx} OR
                    COALESCE(scalability, '') ILIKE $${idx} OR
                    COALESCE(novelty, '') ILIKE $${idx}
                )`;
            });
            // Text search is REQUIRED - must match at least one term
            conditions.push(`(${textConditions.join(' OR ')})`);
        } else {
            // No valid search terms (all words too short) - return empty
            console.log(`[DynamicSearch] No valid search terms in: "${searchText}", returning 0 results`);
            return {
                results: [],
                total: 0,
                source: 'database'
            };
        }
    }

    // Add filter conditions (these are ANDed with text search)
    if (filters.domain?.length > 0) {
        const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
        const domainConds = domains.map(d => {
            params.push(`%${d}%`);
            return `challenge_opportunity ILIKE $${paramIndex++}`;
        });
        conditions.push(`(${domainConds.join(' OR ')})`);
    }

    if (filters.businessGroup?.length > 0) {
        const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
        const bgConds = groups.map(g => {
            params.push(`%${g}%`);
            return `business_group ILIKE $${paramIndex++}`;
        });
        conditions.push(`(${bgConds.join(' OR ')})`);
    }

    if (filters.techStack?.length > 0) {
        const techs = Array.isArray(filters.techStack) ? filters.techStack : [filters.techStack];
        const techConds = techs.map(t => {
            params.push(`%${t}%`);
            return `code_preference ILIKE $${paramIndex++}`;
        });
        conditions.push(`(${techConds.join(' OR ')})`);
    }

    if (filters.year) {
        params.push(filters.year);
        conditions.push(`EXTRACT(YEAR FROM created_at) = $${paramIndex++}`);
    }

    // Build query
    let query = `
        SELECT 
            idea_id,
            title,
            summary as description,
            challenge_opportunity as domain,
            business_group as "businessGroup",
            COALESCE(code_preference, '') as technologies,
            build_phase as "buildPhase",
            scalability,
            novelty,
            score,
            created_at as "submissionDate"
        FROM ideas
    `;

    // Add WHERE clause
    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Add sorting
    const validSortColumns = ['score', 'created_at', 'title'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'score';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${order}, created_at DESC`;

    // Add pagination
    params.push(limit);
    query += ` LIMIT $${paramIndex++}`;
    params.push(offset);
    query += ` OFFSET $${paramIndex++}`;

    try {
        console.log(`[DynamicSearch] Executing query with ${params.length} params`);
        console.log(`[DynamicSearch] Search text: "${searchText}"`);
        console.log(`[DynamicSearch] Conditions: ${conditions.length}`);
        const result = await pool.query(query, params);
        
        console.log(`[DynamicSearch] Found ${result.rows.length} results`);
        
        return {
            results: result.rows.map(row => ({
                id: `IDEA-${row.idea_id}`,
                dbId: row.idea_id,
                title: row.title,
                description: row.description,
                domain: row.domain || 'General',
                businessGroup: row.businessGroup || 'Unknown',
                technologies: row.technologies,
                buildPhase: row.buildPhase || '',
                scalability: row.scalability || '',
                novelty: row.novelty || '',
                score: row.score || 0,
                submissionDate: row.submissionDate,
                matchScore: 70
            })),
            total: result.rowCount,
            source: 'database'
        };
    } catch (error) {
        console.error('[DynamicSearch] Query error:', error.message);
        console.error('[DynamicSearch] Query:', query);
        console.error('[DynamicSearch] Params:', params);
        throw error;
    }
}


/**
 * Hybrid search - combines semantic and database search
 */
export async function hybridSearch(pool, chromaResults, searchText, filters, options = {}) {
    const { limit = 100 } = options;

    // If ChromaDB has good results, use them
    if (chromaResults && chromaResults.length >= 5) {
        return {
            results: chromaResults.slice(0, limit),
            source: 'semantic'
        };
    }

    // Fallback to database search
    const dbResults = await executeDynamicSearch(pool, searchText, filters, { limit });

    // If we have some ChromaDB results, merge them
    if (chromaResults && chromaResults.length > 0) {
        const chromaIds = new Set(chromaResults.map(r => r.dbId));
        const uniqueDbResults = dbResults.results.filter(r => !chromaIds.has(r.dbId));
        
        return {
            results: [...chromaResults, ...uniqueDbResults].slice(0, limit),
            source: 'hybrid'
        };
    }

    return dbResults;
}

/**
 * Save search to history (optional - may fail if table doesn't exist)
 */
export async function saveSearchHistory(pool, userId, sessionId, query, filters, resultIds, processingTime, searchType) {
    try {
        await pool.query(`
            INSERT INTO search_history (user_id, session_id, query, filters, result_count, result_ids, processing_time_ms, search_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            userId,
            sessionId,
            query,
            JSON.stringify(filters),
            resultIds.length,
            resultIds,
            processingTime,
            searchType
        ]);
    } catch (error) {
        // Silently fail - table might not exist
        console.warn('[DynamicSearch] Could not save search history:', error.message);
    }
}

/**
 * Get user's recent searches
 */
export async function getRecentSearches(pool, userId, limit = 10) {
    try {
        const result = await pool.query(`
            SELECT query, filters, result_count, created_at
            FROM search_history
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `, [userId, limit]);
        
        return result.rows;
    } catch (error) {
        console.warn('[DynamicSearch] Could not get recent searches:', error.message);
        return [];
    }
}

export default {
    executeDynamicSearch,
    hybridSearch,
    saveSearchHistory,
    getRecentSearches
};
