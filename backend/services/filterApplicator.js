import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

export async function applyFilters(baseResultIds, filters, currentFilters = {}, mode = 'ADD') {
    if (!Array.isArray(baseResultIds)) {
        throw new Error('baseResultIds must be an array');
    }
    if (!filters || typeof filters !== 'object') {
        throw new Error('filters must be an object');
    }
    if (!['ADD', 'REMOVE', 'REPLACE'].includes(mode)) {
        throw new Error('mode must be "ADD", "REMOVE", or "REPLACE"');
    }
    if (baseResultIds.length === 0) {
        return [];
    }

    const effectiveFilters = computeEffectiveFilters(filters, currentFilters, mode);
    if (isEmptyFilters(effectiveFilters)) {
        return baseResultIds;
    }

    try {
        const { query, params } = buildFilterQuery(baseResultIds, effectiveFilters);
        const result = await pool.query(query, params);
        const filteredIds = result.rows.map(row => row.idea_id);
        const orderedIds = baseResultIds.filter(id => filteredIds.includes(id));
        return orderedIds;
    } catch (error) {
        console.error('[applyFilters] Error:', error);
        throw error;
    }
}

function computeEffectiveFilters(newFilters, currentFilters, mode) {
    const effective = { technologies: [], businessGroups: [], themes: [], years: [] };
    const current = {
        technologies: currentFilters.technologies || [],
        businessGroups: currentFilters.businessGroups || [],
        themes: currentFilters.themes || [],
        years: currentFilters.years || []
    };
    const newF = {
        technologies: newFilters.technologies || [],
        businessGroups: newFilters.businessGroups || [],
        themes: newFilters.themes || [],
        years: newFilters.years || []
    };

    if (mode === 'REPLACE') {
        effective.technologies = [...newF.technologies];
        effective.businessGroups = [...newF.businessGroups];
        effective.themes = [...newF.themes];
        effective.years = [...newF.years];
    } else if (mode === 'ADD') {
        effective.technologies = [...new Set([...current.technologies, ...newF.technologies])];
        effective.businessGroups = [...new Set([...current.businessGroups, ...newF.businessGroups])];
        effective.themes = [...new Set([...current.themes, ...newF.themes])];
        effective.years = [...new Set([...current.years, ...newF.years])].sort();
    } else if (mode === 'REMOVE') {
        effective.technologies = current.technologies.filter(t => !newF.technologies.includes(t));
        effective.businessGroups = current.businessGroups.filter(bg => !newF.businessGroups.includes(bg));
        effective.themes = current.themes.filter(th => !newF.themes.includes(th));
        effective.years = current.years.filter(y => !newF.years.includes(y));
    }
    return effective;
}

function isEmptyFilters(filters) {
    return (
        (!filters.technologies || filters.technologies.length === 0) &&
        (!filters.businessGroups || filters.businessGroups.length === 0) &&
        (!filters.themes || filters.themes.length === 0) &&
        (!filters.years || filters.years.length === 0)
    );
}

function buildFilterQuery(baseResultIds, filters) {
    const conditions = [];
    const params = [baseResultIds];
    let paramIndex = 2;

    conditions.push('idea_id = ANY($1)');

    if (filters.technologies && filters.technologies.length > 0) {
        const techConditions = filters.technologies.map(tech => {
            params.push(tech);
            const paramPlaceholder = '$' + paramIndex;
            const condition = `code_preference ILIKE '%' || ${paramPlaceholder} || '%'`;
            paramIndex++;
            return condition;
        });
        conditions.push('(' + techConditions.join(' AND ') + ')');
    }

    if (filters.businessGroups && filters.businessGroups.length > 0) {
        params.push(filters.businessGroups);
        const paramPlaceholder = '$' + paramIndex;
        conditions.push(`business_group = ANY(${paramPlaceholder})`);
        paramIndex++;
    }

    if (filters.themes && filters.themes.length > 0) {
        const themeConditions = filters.themes.map(theme => {
            params.push(theme);
            const paramPlaceholder = '$' + paramIndex;
            const condition = `theme ILIKE ${paramPlaceholder}`;
            paramIndex++;
            return condition;
        });
        conditions.push('(' + themeConditions.join(' OR ') + ')');
    }

    if (filters.years && filters.years.length > 0) {
        params.push(filters.years);
        const paramPlaceholder = '$' + paramIndex;
        conditions.push(`EXTRACT(YEAR FROM created_at)::INTEGER = ANY(${paramPlaceholder})`);
        paramIndex++;
    }

    const query = 'SELECT idea_id FROM ideas WHERE ' + conditions.join(' AND ');
    return { query, params };
}

export function getEffectiveFilters(newFilters, currentFilters, mode) {
    return computeEffectiveFilters(newFilters, currentFilters, mode);
}

export default {
    applyFilters,
    getEffectiveFilters
};
