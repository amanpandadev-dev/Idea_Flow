/**
 * ProSearch Filter Extractor
 * Deterministic filter extraction from natural language (NO LLM)
 * 
 * Extracts:
 * - Technologies (Datadog, Kubernetes, PyTorch, etc.)
 * - Business Groups (Healthcare, Banking, Telecom, etc.)
 * - Themes (AI for Cybersecurity, FinOps for AI, etc.)
 * - Years (2021-2025)
 */

// Known technology keywords
const TECH_KEYWORDS = [
    'datadog', 'kubernetes', 'pytorch', 'tensorflow', 'docker', 'aws', 'azure', 'gcp',
    'react', 'angular', 'vue', 'node', 'python', 'java', 'javascript', 'typescript',
    'mongodb', 'postgresql', 'mysql', 'redis', 'kafka', 'spark', 'hadoop',
    'jenkins', 'github', 'gitlab', 'jira', 'confluence', 'slack',
    'tableau', 'powerbi', 'looker', 'grafana', 'prometheus',
    'ai', 'ml', 'machine learning', 'artificial intelligence', 'nlp', 'computer vision',
    'blockchain', 'iot', 'chatbot', 'chatgpt', 'llm', 'generative ai'
];

// Known business groups
const BUSINESS_GROUPS = [
    'healthcare', 'banking', 'finance', 'insurance', 'telecom', 'retail',
    'manufacturing', 'logistics', 'energy', 'utilities', 'government',
    'education', 'media', 'entertainment', 'hospitality', 'real estate',
    'automotive', 'aerospace', 'defense', 'pharmaceuticals',
    'digital operations', 'corporate functions'
];

// Known themes/domains
const THEMES = [
    'cybersecurity', 'finops', 'devops', 'mlops', 'aiops',
    'data analytics', 'business intelligence', 'automation',
    'cloud migration', 'digital transformation', 'customer experience',
    'supply chain', 'fraud detection', 'risk management',
    'personalization', 'recommendation', 'predictive analytics'
];

// Control words
const CONTROL_WORDS = {
    ADD: ['and', 'also', 'include', 'with', 'plus'],
    REMOVE: ['exclude', 'remove', 'without', 'not', 'except'],
    REPLACE: ['only', 'just', 'specifically', 'exclusively']
};

/**
 * Extract filters from user message
 * @param {string} message - User's natural language message
 * @returns {Object} Extracted filters with mode
 */
export function extractFilters(message) {
    const lowerMessage = message.toLowerCase();

    const filters = {
        technologies: [],
        businessGroups: [],
        themes: [],
        years: [],
        mode: 'ADD' // Default mode
    };

    // Determine mode from control words
    if (CONTROL_WORDS.REPLACE.some(word => lowerMessage.includes(word))) {
        filters.mode = 'REPLACE';
    } else if (CONTROL_WORDS.REMOVE.some(word => lowerMessage.includes(word))) {
        filters.mode = 'REMOVE';
    }

    // Extract technologies
    TECH_KEYWORDS.forEach(tech => {
        if (lowerMessage.includes(tech)) {
            // Capitalize first letter for display
            const formatted = tech.split(' ').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            if (!filters.technologies.includes(formatted)) {
                filters.technologies.push(formatted);
            }
        }
    });

    // Extract business groups
    BUSINESS_GROUPS.forEach(bg => {
        if (lowerMessage.includes(bg)) {
            const formatted = bg.split(' ').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            if (!filters.businessGroups.includes(formatted)) {
                filters.businessGroups.push(formatted);
            }
        }
    });

    // Extract themes
    THEMES.forEach(theme => {
        if (lowerMessage.includes(theme)) {
            const formatted = theme.split(' ').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            if (!filters.themes.includes(formatted)) {
                filters.themes.push(formatted);
            }
        }
    });

    // Extract years (2021-2025)
    const yearPattern = /\b(202[1-5])\b/g;
    const yearMatches = message.match(yearPattern);
    if (yearMatches) {
        filters.years = [...new Set(yearMatches.map(y => parseInt(y)))];
    }

    // Handle "latest" keyword
    if (lowerMessage.includes('latest') || lowerMessage.includes('recent')) {
        filters.years = [2024, 2025];
    }

    return filters;
}

/**
 * Merge filters based on mode
 * @param {Object} currentFilters - Current applied filters
 * @param {Object} newFilters - Newly extracted filters
 * @returns {Object} Merged filters
 */
export function mergeFilters(currentFilters, newFilters) {
    const { mode, ...extractedFilters } = newFilters;

    if (mode === 'REPLACE') {
        // Replace entirely
        return {
            technologies: extractedFilters.technologies || [],
            businessGroups: extractedFilters.businessGroups || [],
            themes: extractedFilters.themes || [],
            years: extractedFilters.years || []
        };
    }

    if (mode === 'REMOVE') {
        // Remove specified items
        return {
            technologies: currentFilters.technologies.filter(
                t => !extractedFilters.technologies.includes(t)
            ),
            businessGroups: currentFilters.businessGroups.filter(
                bg => !extractedFilters.businessGroups.includes(bg)
            ),
            themes: currentFilters.themes.filter(
                th => !extractedFilters.themes.includes(th)
            ),
            years: currentFilters.years.filter(
                y => !extractedFilters.years.includes(y)
            )
        };
    }

    // Default: ADD mode - merge with current
    return {
        technologies: [...new Set([
            ...currentFilters.technologies,
            ...extractedFilters.technologies
        ])],
        businessGroups: [...new Set([
            ...currentFilters.businessGroups,
            ...extractedFilters.businessGroups
        ])],
        themes: [...new Set([
            ...currentFilters.themes,
            ...extractedFilters.themes
        ])],
        years: [...new Set([
            ...currentFilters.years,
            ...extractedFilters.years
        ])]
    };
}
