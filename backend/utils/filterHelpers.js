/**
 * Filter Utilities for ProSearch
 * 
 * Since ChromaDB only stores vectors (no metadata),
 * filters are applied to results AFTER fetching from PostgreSQL
 */

/**
 * Apply metadata filters to idea results
 * @param {Array} ideas - Array of idea objects from PostgreSQL
 * @param {Object} filters - Filter object with optional: technology, domain, year, theme
 * @returns {Array} Filtered ideas
 */
export function applyMetadataFilters(ideas, filters) {
    if (!filters || Object.keys(filters).length === 0) {
        return ideas;
    }

    return ideas.filter(idea => {
        // Technology filter
        if (filters.technology) {
            const techStack = idea.techStack || idea.tech_stack || [];
            const hasTech = Array.isArray(techStack)
                ? techStack.some(t => t.toLowerCase().includes(filters.technology.toLowerCase()))
                : false;

            if (!hasTech) return false;
        }

        // Domain/Business Group filter
        if (filters.domain) {
            const domain = idea.businessGroup || idea.business_group || '';
            if (!domain.toLowerCase().includes(filters.domain.toLowerCase())) {
                return false;
            }
        }

        // Year filter
        if (filters.year) {
            const createdAt = idea.createdAt || idea.created_at || idea.participation_week;
            if (createdAt) {
                const ideaYear = new Date(createdAt).getFullYear();
                if (ideaYear !== parseInt(filters.year)) {
                    return false;
                }
            } else {
                return false; // No date = exclude
            }
        }

        // Theme filter
        if (filters.theme) {
            const theme = idea.theme || idea.category || '';
            if (!theme.toLowerCase().includes(filters.theme.toLowerCase())) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Extract unique filter options from idea array
 * @param {Array} ideas - Array of all ideas
 * @returns {Object} Available filter options
 */
export function extractFilterOptions(ideas) {
    const technologies = new Set();
    const domains = new Set();
    const years = new Set();
    const themes = new Set();

    ideas.forEach(idea => {
        // Technologies
        const techStack = idea.techStack || idea.tech_stack || [];
        if (Array.isArray(techStack)) {
            techStack.forEach(t => technologies.add(t));
        }

        // Domains
        const domain = idea.businessGroup || idea.business_group;
        if (domain) domains.add(domain);

        // Years
        const createdAt = idea.createdAt || idea.created_at || idea.participation_week;
        if (createdAt) {
            const year = new Date(createdAt).getFullYear();
            years.add(year);
        }

        // Themes
        const theme = idea.theme || idea.category;
        if (theme) themes.add(theme);
    });

    return {
        technologies: Array.from(technologies).sort(),
        domains: Array.from(domains).sort(),
        years: Array.from(years).sort((a, b) => b - a), // Most recent first
        themes: Array.from(themes).sort()
    };
}

export default {
    applyMetadataFilters,
    extractFilterOptions
};
