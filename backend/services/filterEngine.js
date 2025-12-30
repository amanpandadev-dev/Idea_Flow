/**
 * ProSearch Filter Engine
 * Hard AND-based filtering on base result IDs
 * 
 * CRITICAL: Filters are applied ONLY on base_result_ids
 * No soft scoring, no "maybe" results
 */

/**
 * Apply hard filters to idea IDs
 * @param {Object} pool - PostgreSQL connection pool
 * @param {number[]} baseIds - Base result IDs from vector search
 * @param {Object} filters - Filters to apply
 * @returns {Promise<number[]>} Filtered idea IDs
 */
export async function applyFilters(pool, baseIds, filters) {
    // If no base IDs, return empty
    if (!baseIds || baseIds.length === 0) {
        console.log('[FilterEngine] No base IDs to filter');
        return [];
    }

    // If no filters, return all base IDs
    const hasFilters = (
        (filters.technologies && filters.technologies.length > 0) ||
        (filters.businessGroups && filters.businessGroups.length > 0) ||
        (filters.themes && filters.themes.length > 0) ||
        (filters.years && filters.years.length > 0)
    );

    if (!hasFilters) {
        console.log('[FilterEngine] No filters applied, returning all base IDs');
        return baseIds;
    }

    console.log('[FilterEngine] Applying filters:', filters);
    console.log('[FilterEngine] Base IDs count:', baseIds.length);

    // Build WHERE clauses for each filter type
    const conditions = [];
    const params = [baseIds]; // $1 = baseIds array
    let paramIndex = 2;

    // Technology filter (code_preference column contains comma-separated tech stack)
    if (filters.technologies && filters.technologies.length > 0) {
        const techConditions = filters.technologies.map(tech => {
            params.push(`%${tech}%`);
            return `code_preference ILIKE $${paramIndex++}`;
        });
        // ALL technologies must be present (AND logic)
        conditions.push(`(${techConditions.join(' AND ')})`);
    }

    // Business group filter
    if (filters.businessGroups && filters.businessGroups.length > 0) {
        params.push(filters.businessGroups);
        conditions.push(`business_group = ANY($${paramIndex++})`);
    }

    // Theme filter
    if (filters.themes && filters.themes.length > 0) {
        const themeConditions = filters.themes.map(theme => {
            params.push(`%${theme}%`);
            return `theme ILIKE $${paramIndex++}`;
        });
        conditions.push(`(${themeConditions.join(' OR ')})`);
    }

    // Year filter (extract year from created_at)
    if (filters.years && filters.years.length > 0) {
        params.push(filters.years);
        conditions.push(`EXTRACT(YEAR FROM created_at) = ANY($${paramIndex++})`);
    }

    // Build final query
    const whereClause = conditions.length > 0
        ? `AND ${conditions.join(' AND ')}`
        : '';

    const query = `
        SELECT idea_id
        FROM ideas
        WHERE idea_id = ANY($1)
        ${whereClause}
        ORDER BY array_position($1, idea_id)
    `;

    console.log('[FilterEngine] Query:', query);
    console.log('[FilterEngine] Params:', params);

    try {
        const result = await pool.query(query, params);
        const filteredIds = result.rows.map(row => row.idea_id);

        console.log(`[FilterEngine] Filtered: ${baseIds.length} → ${filteredIds.length} IDs`);

        if (filteredIds.length === 0) {
            console.log('[FilterEngine] ⚠️  No results match filters (valid state)');
        }

        return filteredIds;

    } catch (error) {
        console.error('[FilterEngine] Error:', error.message);
        throw new Error(`Filter application failed: ${error.message}`);
    }
}

/**
 * Check if filters would result in empty set (for UX hints)
 * @param {number[]} filteredIds - Result of applyFilters
 * @returns {boolean} True if no results
 */
export function hasNoResults(filteredIds) {
    return !filteredIds || filteredIds.length === 0;
}
