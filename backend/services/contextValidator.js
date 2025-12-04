/**
 * Context Validator Service
 * 
 * Validates user queries to ensure they are:
 * 1. Related to idea search and exploration
 * 2. Not asking for personal/confidential information
 * 3. Not general knowledge questions
 */

// Off-topic patterns that should be rejected
const OFF_TOPIC_PATTERNS = [
    /who am i/i,
    /what'?s my name/i,
    /who are you/i,
    /what are you/i,
    /tell me about (yourself|you)/i,
    /where (is|are) (the )?(taj mahal|eiffel tower|great wall)/i,
    /what is (the )?(capital of|meaning of|definition of)/i,
    /how (do|to) (i )?(cook|make|build) /i,
    /weather (in|at|for)/i,
    /current (time|date)/i,
    /solve (this|my) (problem|homework|assignment)/i,
    /write (me )?(a |an )?(essay|code|program) (for|about)/i
];

// Confidential/internal information patterns
const CONFIDENTIAL_PATTERNS = [
    /password|credential|api[- ]key|secret|token/i,
    /salary|compensation|pay(ment)?|budget/i,
    /internal (document|memo|email)/i,
    /confidential|classified|restricted/i,
    /(employee|user) (data|information|record)/i
];

// Idea-related keywords that indicate valid queries
const IDEA_KEYWORDS = [
    'idea', 'project', 'technology', 'tech stack', 'business group',
    'filter', 'search', 'find', 'show', 'list', 'explore', 'discover',
    'domain', 'theme', 'innovation', 'solution', 'application',
    'year', 'timeline', 'phase', 'build', 'development',
    'ai', 'ml', 'blockchain', 'cloud', 'iot', 'data', 'analytics',
    'scalability', 'novelty', 'prototype', 'mvp'
];

/**
 * Validate if a query is contextually appropriate
 * @param {string} query - User query to validate
 * @returns {Object} - { valid: boolean, reason?: string, suggestion?: string }
 */
export function validateQuery(query) {
    if (!query || typeof query !== 'string') {
        return {
            valid: false,
            reason: 'Invalid query format',
            suggestion: 'Please provide a valid search query.'
        };
    }

    const normalizedQuery = query.trim().toLowerCase();

    // Check if query is too short (likely not meaningful)
    if (normalizedQuery.length < 3) {
        return {
            valid: false,
            reason: 'Query too short',
            suggestion: 'Please provide a more detailed query about ideas or projects.'
        };
    }

    // Check for off-topic patterns
    for (const pattern of OFF_TOPIC_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            return {
                valid: false,
                reason: 'Off-topic query',
                suggestion: 'I can only help you search for ideas and projects in our database. Try asking about specific technologies, business groups, or domains.'
            };
        }
    }

    // Check for confidential information requests
    for (const pattern of CONFIDENTIAL_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            return {
                valid: false,
                reason: 'Confidential information request',
                suggestion: 'I cannot provide confidential or sensitive information. Please ask about publicly available ideas and projects.'
            };
        }
    }

    // Check if query contains at least some idea-related context
    const hasIdeaKeyword = IDEA_KEYWORDS.some(keyword =>
        normalizedQuery.includes(keyword.toLowerCase())
    );

    // For very generic queries, provide helpful context
    if (!hasIdeaKeyword && normalizedQuery.length < 30) {
        // Allow common search terms like "latest", "recent", "2024", etc.
        const commonSearchTerms = ['latest', 'recent', 'new', 'top', 'best', '2024', '2023', '2025'];
        const hasSearchTerm = commonSearchTerms.some(term => normalizedQuery.includes(term));

        if (!hasSearchTerm) {
            return {
                valid: true, // Allow but with warning
                warning: true,
                suggestion: 'Your query seems generic. For better results, try mentioning specific technologies, business groups, or domains.'
            };
        }
    }

    return {
        valid: true
    };
}

/**
 * Extract idea-related entities from query
 * @param {string} query - User query
 * @returns {Object} - Extracted entities (technologies, domains, etc.)
 */
export function extractEntities(query) {
    const entities = {
        technologies: [],
        domains: [],
        businessGroups: [],
        years: [],
        phases: []
    };

    const normalizedQuery = query.toLowerCase();

    // Common technologies
    const techPatterns = {
        'Python': /python/i,
        'JavaScript': /javascript|js/i,
        'Java': /\bjava\b/i,
        'React': /react/i,
        'Angular': /angular/i,
        'Vue': /vue/i,
        'Node.js': /node\.?js/i,
        'AI/ML': /\b(ai|ml|machine learning|artificial intelligence)\b/i,
        'Blockchain': /blockchain|distributed ledger/i,
        'Cloud': /cloud|aws|azure|gcp/i,
        'IoT': /iot|internet of things/i,
        'Flutter': /flutter/i
    };

    for (const [tech, pattern] of Object.entries(techPatterns)) {
        if (pattern.test(query)) {
            entities.technologies.push(tech);
        }
    }

    // Extract years (2020-2030)
    const yearMatches = query.match(/\b(202[0-9]|2030)\b/g);
    if (yearMatches) {
        entities.years = yearMatches.map(y => parseInt(y));
    }

    // Extract phases
    const phases = ['prototype', 'mvp', 'development', 'production'];
    phases.forEach(phase => {
        if (normalizedQuery.includes(phase)) {
            entities.phases.push(phase.charAt(0).toUpperCase() + phase.slice(1));
        }
    });

    return entities;
}

/**
 * Generate contextual error message
 * @param {string} reason - Rejection reason
 * @param {string} suggestion - Alternative suggestion
 * @returns {string} - User-friendly error message
 */
export function generateErrorMessage(reason, suggestion) {
    const prefixes = {
        'Off-topic query': '🤔 I specialize in helping you find ideas and projects.',
        'Confidential information request': '🔒 I cannot access confidential information.',
        'Invalid query format': '❓ I need a valid question to help you.',
        'Query too short': '📝 Please provide more details.'
    };

    const prefix = prefixes[reason] || '💡 Let me help you search for ideas.';
    return `${prefix} ${suggestion}`;
}

export default {
    validateQuery,
    extractEntities,
    generateErrorMessage
};
