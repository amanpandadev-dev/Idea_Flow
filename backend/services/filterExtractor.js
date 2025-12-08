/**
 * Filter Extraction Service
 * Extracts search filters from natural language queries for conversational context
 */

import { Domain, Status, BusinessGroup, BuildType } from '../config/enums.js';

/**
 * Extract filters from natural language query
 * @param {string} query - User's natural language query
 * @returns {Object} Extracted filters
 */
export function extractFiltersFromQuery(query) {
    const filters = {};
    const lowerQuery = query.toLowerCase();

    // Domain extraction
    const domains = Object.values(Domain);
    for (const domain of domains) {
        if (lowerQuery.includes(domain.toLowerCase())) {
            filters.domain = domain;
            break; // Take first match
        }
    }

    // Year extraction (2020-2030)
    const yearMatch = query.match(/\b(202\d)\b/);
    if (yearMatch) {
        filters.year = parseInt(yearMatch[1]);
    }

    // Technology extraction - common tech keywords
    const techKeywords = [
        'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue',
        'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'FastAPI',
        '.NET', 'C#', 'C++', 'Go', 'Rust', 'Ruby', 'PHP',
        'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch',
        'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
        'TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy',
        'GraphQL', 'REST', 'gRPC', 'Kafka', 'RabbitMQ'
    ];

    const foundTech = techKeywords.filter(tech =>
        lowerQuery.includes(tech.toLowerCase())
    );

    if (foundTech.length > 0) {
        filters.techStack = foundTech;
    }

    // Build type extraction
    const buildTypeMap = {
        'prototype': BuildType.POC,
        'mvp': 'MVP',
        'proof of concept': BuildType.POC,
        'poc': BuildType.POC,
        'development': 'Development',
        'enhancement': BuildType.ENHANCEMENT,
        'extension': BuildType.ENHANCEMENT,
        'improvement': BuildType.PROCESS_IMPROVEMENT,
        'new solution': BuildType.NEW_SOLUTION,
        'new ip': BuildType.NEW_SOLUTION
    };

    for (const [keyword, buildType] of Object.entries(buildTypeMap)) {
        if (lowerQuery.includes(keyword)) {
            filters.buildType = buildType;
            break;
        }
    }

    // Status extraction
    const statusMap = {
        'in production': Status.IN_PRODUCTION,
        'production': Status.IN_PRODUCTION,
        'in development': Status.IN_DEVELOPMENT,
        'development': Status.IN_DEVELOPMENT,
        'submitted': Status.SUBMITTED,
        'in review': Status.IN_REVIEW,
        'review': Status.IN_REVIEW,
        'rejected': Status.REJECTED
    };

    for (const [keyword, status] of Object.entries(statusMap)) {
        if (lowerQuery.includes(keyword)) {
            filters.status = status;
            break;
        }
    }

    // Business Group extraction
    const businessGroups = Object.values(BusinessGroup);
    for (const bg of businessGroups) {
        if (lowerQuery.includes(bg.toLowerCase())) {
            filters.businessGroup = bg;
            break;
        }
    }

    // Special keywords for business groups
    const bgKeywordMap = {
        'banking': BusinessGroup.FINANCE,
        'finance': BusinessGroup.FINANCE,
        'financial': BusinessGroup.FINANCE,
        'retail': BusinessGroup.RETAIL,
        'cpg': BusinessGroup.RETAIL,
        'healthcare': BusinessGroup.HEALTHCARE,
        'medical': BusinessGroup.HEALTHCARE,
        'hospital': BusinessGroup.HEALTHCARE,
        'manufacturing': BusinessGroup.MANUFACTURING,
        'logistics': BusinessGroup.MANUFACTURING,
        'tech': BusinessGroup.TECH,
        'technology': BusinessGroup.TECH,
        'media': BusinessGroup.TECH,
        'hr': BusinessGroup.CORP,
        'legal': BusinessGroup.CORP,
        'corporate': BusinessGroup.CORP
    };

    for (const [keyword, bg] of Object.entries(bgKeywordMap)) {
        if (lowerQuery.includes(keyword)) {
            filters.businessGroup = bg;
            break;
        }
    }

    return filters;
}

/**
 * Merge new filters with existing filters
 * Strategy: Replace for single-value fields, append for arrays
 * @param {Object} currentFilters - Existing cumulative filters
 * @param {Object} newFilters - Newly extracted filters
 * @returns {Object} Merged filters
 */
export function mergeFilters(currentFilters, newFilters) {
    const merged = { ...currentFilters };

    // Handle array fields (techStack) - append and deduplicate
    if (newFilters.techStack) {
        merged.techStack = [
            ...(merged.techStack || []),
            ...newFilters.techStack
        ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
    }

    // Handle scalar fields - replace (user is refining their search)
    const scalarFields = ['domain', 'year', 'buildType', 'status', 'businessGroup'];
    scalarFields.forEach(field => {
        if (newFilters[field] !== undefined) {
            merged[field] = newFilters[field];
        }
    });

    return merged;
}

/**
 * Generate human-readable context summary from filters
 * @param {Object} filters - Active filters
 * @returns {string} Human-readable summary
 */
export function generateContextSummary(filters) {
    const parts = [];

    if (filters.domain) {
        parts.push(`in ${filters.domain}`);
    }

    if (filters.businessGroup) {
        parts.push(`for ${filters.businessGroup}`);
    }

    if (filters.year) {
        parts.push(`from ${filters.year}`);
    }

    if (filters.techStack && filters.techStack.length > 0) {
        parts.push(`using ${filters.techStack.join(', ')}`);
    }

    if (filters.buildType) {
        parts.push(`as ${filters.buildType}`);
    }

    if (filters.status) {
        parts.push(`with status: ${filters.status}`);
    }

    return parts.length > 0
        ? `Searching ideas ${parts.join(' ')}`
        : 'Searching all ideas';
}

/**
 * Detect if query is asking to clear/reset filters
 * @param {string} query - User query
 * @returns {boolean} True if user wants to clear context
 */
export function shouldClearContext(query) {
    const clearKeywords = [
        'clear', 'reset', 'start over', 'new search', 'forget', 'remove all'
    ];

    const lowerQuery = query.toLowerCase();
    return clearKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Detect if query is asking to remove a specific filter
 * @param {string} query - User query
 * @returns {Object|null} Filter to remove or null
 */
export function detectFilterRemoval(query) {
    const lowerQuery = query.toLowerCase();

    // Check for removal keywords
    const removalPatterns = [
        /remove\s+(\w+)/i,
        /without\s+(\w+)/i,
        /exclude\s+(\w+)/i,
        /not\s+(\w+)/i
    ];

    for (const pattern of removalPatterns) {
        const match = query.match(pattern);
        if (match) {
            const term = match[1].toLowerCase();

            // Map term to filter field
            if (term.includes('domain') || term.includes('theme')) {
                return { field: 'domain' };
            }
            if (term.includes('year') || term.includes('date')) {
                return { field: 'year' };
            }
            if (term.includes('tech') || term.includes('technology')) {
                return { field: 'techStack' };
            }
            if (term.includes('status')) {
                return { field: 'status' };
            }
            if (term.includes('business') || term.includes('group')) {
                return { field: 'businessGroup' };
            }
            if (term.includes('build') || term.includes('type')) {
                return { field: 'buildType' };
            }
        }
    }

    return null;
}
