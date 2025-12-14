/**
 * Metadata Filter Service
 * Applies metadata filtering AFTER semantic search
 * Only when user explicitly requests
 * Uses OR logic by default
 */

/**
 * Apply metadata filters to results
 * 
 * FILTER LOGIC:
 * - AND between different filter types (tech AND year AND domain)
 * - ALL for technologies (must have ALL specified techs)
 * - ANY for years (can match ANY specified year)
 * - ANY for other filters
 * 
 * @param {Array} results - Semantic search results
 * @param {Object} filters - Filter object from context
 * @returns {Array} Filtered results
 */
export function applyMetadataFilters(results, filters) {
    if (!filters || Object.keys(filters).length === 0) {
        return results;
    }

    const activeFilters = Object.entries(filters).filter(([_, values]) =>
        Array.isArray(values) && values.length > 0
    );

    if (activeFilters.length === 0) {
        return results;
    }

    const filtered = results.filter(result => {
        const metadata = result.metadata || result;

        // Technology filter (ALL logic - must have ALL specified technologies)
        if (filters.technologies?.length > 0) {
            const techString = (metadata.technologies || metadata.code_preference || '').toLowerCase();
            const hasAllTech = filters.technologies.every(tech =>
                techString.includes(tech.toLowerCase())
            );
            if (!hasAllTech) return false;  // Must have ALL technologies
        }

        // Year filter (ANY logic - can match ANY year)
        if (filters.years?.length > 0) {
            const createdAt = metadata.created_at || metadata.submissionDate;
            if (createdAt) {
                const year = new Date(createdAt).getFullYear();
                const hasAnyYear = filters.years.includes(year);
                if (!hasAnyYear) return false;  // Must match at least one year
            } else {
                return false;  // No date = doesn't match year filter
            }
        }

        // Domain filter (ANY logic - can match ANY domain)
        if (filters.domains?.length > 0) {
            const domainString = (metadata.domain || metadata.challenge_opportunity || '').toLowerCase();
            const hasAnyDomain = filters.domains.some(domain =>
                domainString.includes(domain.toLowerCase())
            );
            if (!hasAnyDomain) return false;
        }

        // Business Group filter (ANY logic)
        if (filters.businessGroups?.length > 0) {
            const bgString = (metadata.businessGroup || metadata.business_group || '').toLowerCase();
            const hasAnyGroup = filters.businessGroups.some(group =>
                bgString.includes(group.toLowerCase())
            );
            if (!hasAnyGroup) return false;
        }

        // Theme filter (ANY logic)
        if (filters.themes?.length > 0) {
            const themeString = (metadata.theme || '').toLowerCase();
            const hasAnyTheme = filters.themes.some(theme =>
                themeString.includes(theme.toLowerCase())
            );
            if (!hasAnyTheme) return false;
        }

        return true;  // Passes all filters
    });

    return filtered;
}

/**
 * Count active filters
 */
export function countActiveFilters(filters) {
    if (!filters) return 0;

    return Object.values(filters).reduce((count, values) => {
        return count + (Array.isArray(values) ? values.length : 0);
    }, 0);
}

export default {
    applyMetadataFilters,
    countActiveFilters
};
