/**
 * Anonymize user queries before sending to external APIs
 * Removes internal references while preserving semantic intent
 */

// Patterns to anonymize
const IDEA_ID_PATTERN = /IDEA-\d+/gi;
const EMPLOYEE_ID_PATTERN = /\b[A-Z]{2,3}\d{4,6}\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Internal terminology to generalize
const INTERNAL_TERMS = {
    'ideaflow': 'innovation platform',
    'associate': 'team member',
    'business group': 'department',
    'build phase': 'development stage',
    'hackathon': 'innovation event'
};

/**
 * Anonymize a query by removing internal references
 * @param {string} query - Original user query
 * @returns {string} Anonymized query
 */
export function anonymizeQuery(query) {
    if (!query || typeof query !== 'string') {
        return '';
    }

    let anonymized = query;

    // Remove idea IDs
    anonymized = anonymized.replace(IDEA_ID_PATTERN, 'innovation idea');

    // Remove employee IDs
    anonymized = anonymized.replace(EMPLOYEE_ID_PATTERN, 'team member');

    // Remove email addresses
    anonymized = anonymized.replace(EMAIL_PATTERN, 'contact');

    // Replace internal terminology
    Object.entries(INTERNAL_TERMS).forEach(([internal, generic]) => {
        const regex = new RegExp(`\\b${internal}\\b`, 'gi');
        anonymized = anonymized.replace(regex, generic);
    });

    // Remove specific company/project names (customize as needed)
    // anonymized = anonymized.replace(/\bYourCompanyName\b/gi, 'organization');

    return anonymized.trim();
}

/**
 * Check if query contains sensitive information
 * @param {string} query - Query to check
 * @returns {boolean} True if query contains sensitive info
 */
export function containsSensitiveInfo(query) {
    if (!query) return false;

    const sensitivePatterns = [
        IDEA_ID_PATTERN,
        EMPLOYEE_ID_PATTERN,
        EMAIL_PATTERN,
        /\b(password|secret|api[_-]?key|token)\b/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(query));
}

/**
 * Extract domain/theme from query for better anonymization
 * @param {string} query - Original query
 * @returns {string} Extracted domain or empty string
 */
export function extractDomain(query) {
    const domainKeywords = [
        'AI', 'machine learning', 'healthcare', 'retail', 'finance',
        'manufacturing', 'automation', 'analytics', 'cloud', 'security'
    ];

    const lowerQuery = query.toLowerCase();
    const found = domainKeywords.find(keyword =>
        lowerQuery.includes(keyword.toLowerCase())
    );

    return found || '';
}

export default {
    anonymizeQuery,
    containsSensitiveInfo,
    extractDomain
};
