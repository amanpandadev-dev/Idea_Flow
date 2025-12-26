/**
 * PostgreSQL Filter Service
 * 
 * Fast indexed filtering BEFORE semantic search (Two-Stage Architecture)
 * Replaces slow in-memory JS filtering
 */

/**
 * Get filtered idea IDs from PostgreSQL using indexed queries
 * 
 * @param {Object} filters - { technologies, businessGroups, domains, years }
 * @param {Object} pool - PostgreSQL connection pool
 * @returns {Promise<number[]>} Array of idea IDs
 */
export async function getFilteredIdeaIds(filters, pool) {
    const whereClauses = [];
    const params = [];
    let paramIndex = 1;

    console.log(`[PostgresFilter] Incoming filters:`, filters);

    // Technology filter (ILIKE for case-insensitive match)
    // OR logic within technologies (match ANY)
    if (filters.technologies?.length > 0) {
        const techConditions = filters.technologies.map(tech => {
            params.push(`%${tech}%`);
            return `code_preference ILIKE $${paramIndex++}`;
        });
        whereClauses.push(`(${techConditions.join(' AND ')})`);
    }

    // Business Group filter (OR logic)
    if (filters.businessGroups?.length > 0) {
        const bgConditions = filters.businessGroups.map(bg => {
            params.push(`%${bg}%`);
            return `business_group ILIKE $${paramIndex++}`;
        });
        whereClauses.push(`(${bgConditions.join(' OR ')})`);
    }

    // Domain/Theme filter (OR logic)
    if (filters.domains?.length > 0) {
        const domainConditions = filters.domains.map(domain => {
            params.push(`%${domain}%`);
            return `theme ILIKE $${paramIndex++}`;
        });
        whereClauses.push(`(${domainConditions.join(' AND ')})`);
    }

    // Year filter (OR logic)
    if (filters.years?.length > 0) {
        const yearConditions = filters.years.map(year => {
            params.push(year);
            return `EXTRACT(YEAR FROM created_at) = $${paramIndex++}`;
        });
        whereClauses.push(`(${yearConditions.join(' OR ')})`);
    }

    // Build final query
    const whereClause = whereClauses.length > 0
        ? `WHERE ${whereClauses.join(' AND ')}`  // AND between filter types
        : '';

    const query = `
        SELECT idea_id 
        FROM ideas 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT 1000
    `;

    console.log(`[PostgresFilter] SQL Query:`, query);
    console.log(`[PostgresFilter] Params:`, params);

    const startTime = Date.now();

    try {
        const result = await pool.query(query, params);
        const duration = Date.now() - startTime;

        const ideaIds = result.rows.map(row => row.idea_id);
        console.log(`[PostgresFilter] ✅ Found ${ideaIds.length} filtered IDs in ${duration}ms`);

        return ideaIds;

    } catch (error) {
        console.error(`[PostgresFilter] ❌ Query error:`, error.message);
        throw error;
    }
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters(filters) {
    if (!filters) return false;

    return Object.values(filters).some(arr =>
        Array.isArray(arr) && arr.length > 0
    );
}

/**
 * Merge filters from multiple sources (NLP extraction + Explore UI)
 * DEFAULT MODE: ADD (cumulative across conversation turns)
 * REPLACE MODE: Only when user says "only", "reset", "clear"
 * 
 * @param {Object} existing - Existing filters from context
 * @param {Object} incoming - New filters to merge
 * @param {string} mode - 'ADD' (default) or 'REPLACE'
 * @returns {Object} Merged filters
 */
export function mergeFilters(existing, incoming, mode = 'ADD') {
    // Start with existing filters
    const merged = {
        technologies: [...(existing.technologies || [])],
        businessGroups: [...(existing.businessGroups || [])],
        domains: [...(existing.domains || [])],
        years: [...(existing.years || [])]
    };

    // Merge technologies
    if (incoming.technologies && incoming.technologies.length > 0) {
        if (mode === 'REPLACE') {
            merged.technologies = [...incoming.technologies];
        } else {
            // ADD mode: cumulative
            merged.technologies.push(...incoming.technologies);
        }
    }
    if (incoming.techStack && incoming.techStack.length > 0) {
        if (mode === 'REPLACE') {
            merged.technologies = [...incoming.techStack];
        } else {
            merged.technologies.push(...incoming.techStack);
        }
    }

    // Merge business groups
    if (incoming.businessGroups && incoming.businessGroups.length > 0) {
        if (mode === 'REPLACE') {
            merged.businessGroups = [...incoming.businessGroups];
        } else {
            merged.businessGroups.push(...incoming.businessGroups);
        }
    }
    if (incoming.businessGroup) {
        const groups = Array.isArray(incoming.businessGroup)
            ? incoming.businessGroup
            : [incoming.businessGroup];
        if (mode === 'REPLACE') {
            merged.businessGroups = groups;
        } else {
            merged.businessGroups.push(...groups);
        }
    }

    // Merge domains/themes
    if (incoming.domains && incoming.domains.length > 0) {
        if (mode === 'REPLACE') {
            merged.domains = [...incoming.domains];
        } else {
            merged.domains.push(...incoming.domains);
        }
    }
    if (incoming.domain) {
        const doms = Array.isArray(incoming.domain)
            ? incoming.domain
            : [incoming.domain];
        if (mode === 'REPLACE') {
            merged.domains = doms;
        } else {
            merged.domains.push(...doms);
        }
    }
    if (incoming.themes && incoming.themes.length > 0) {
        if (mode === 'REPLACE') {
            merged.domains = [...incoming.themes];
        } else {
            merged.domains.push(...incoming.themes);
        }
    }

    // Merge years
    if (incoming.years && incoming.years.length > 0) {
        if (mode === 'REPLACE') {
            merged.years = [...incoming.years];
        } else {
            merged.years.push(...incoming.years);
        }
    }

    // Deduplicate all arrays
    merged.technologies = [...new Set(merged.technologies)];
    merged.businessGroups = [...new Set(merged.businessGroups)];
    merged.domains = [...new Set(merged.domains)];
    merged.years = [...new Set(merged.years)];

    console.log(`[FilterMerge] Mode: ${mode}`);
    console.log(`[FilterMerge] Existing:`, existing);
    console.log(`[FilterMerge] Incoming:`, incoming);
    console.log(`[FilterMerge] Merged:`, merged);

    return merged;
}

/**
 * Detect whether to ADD or REPLACE filters based on query language
 * @param {string} query - User query
 * @returns {string} 'ADD' or 'REPLACE'
 */
export function detectFilterMode(query) {
    const lowerQuery = query.toLowerCase();

    // REPLACE mode keywords
    const replaceKeywords = ['only', 'just', 'reset', 'clear', 'instead of'];

    if (replaceKeywords.some(kw => lowerQuery.includes(kw))) {
        console.log(`[FilterMode] REPLACE detected (keyword match)`);
        return 'REPLACE';
    }

    // Default: ADD (cumulative)
    console.log(`[FilterMode] ADD (default cumulative)`);
    return 'ADD';
}

export default {
    getFilteredIdeaIds,
    hasActiveFilters,
    mergeFilters,
    detectFilterMode
};
