/**
 * Context Validator Service
 * 
 * Validates user queries to ensure they are:
 * 1. Related to idea search and exploration
 * 2. Not asking for personal/confidential information
 * 3. Not general knowledge questions
 * 4. Not attempting prompt injection
 */

// Off-topic patterns that should be rejected
const OFF_TOPIC_PATTERNS = [
    // Personal questions
    /who am i/i,
    /what'?s my name/i,
    /who are you/i,
    /what are you/i,
    /what do you (like|think|feel|want)/i,
    /tell me about (yourself|you)/i,
    /are you (a |an )?(human|robot|ai|bot)/i,
    /how old are you/i,
    /where (do you|are you) (live|from)/i,
    
    // General knowledge questions
    /where (is|are) (the )?(taj mahal|eiffel tower|great wall|statue of liberty|pyramids)/i,
    /what is (the )?(capital of|meaning of|definition of)/i,
    /who (is|was|were) (the )?(president|prime minister|king|queen)/i,
    /when (did|was|were) /i,
    /how (do|to) (i )?(cook|make|build|fix|repair) /i,
    /weather (in|at|for)/i,
    /current (time|date|news)/i,
    /what time is it/i,
    /what day is (it|today)/i,
    
    // Homework/assignment requests
    /solve (this|my) (problem|homework|assignment|equation)/i,
    /write (me )?(a |an )?(essay|story|poem|code|program|script) (for|about)/i,
    /help me (with my|do my) (homework|assignment)/i,
    /calculate|compute|evaluate/i,
    
    // Entertainment/casual
    /tell me a joke/i,
    /sing (me )?(a )?song/i,
    /play (a )?game/i,
    /what'?s (your )?favorite/i,
    /do you (like|love|hate)/i,
    
    // Harmful/inappropriate
    /how to (hack|steal|cheat|lie|hurt)/i,
    /illegal|drugs|weapons/i,
    
    // Meta questions about the system
    /what (can|do) you (do|know)/i,
    /how (do|does) (this|you) work/i,
    /what is your (purpose|function|job)/i,
    /ignore (previous|all) instructions/i,
    /pretend (to be|you are)/i,
    /act as (a |an )?/i,
    /you are now/i,
];

// Confidential/internal information patterns
const CONFIDENTIAL_PATTERNS = [
    /password|credential|api[- ]?key|secret[- ]?key|token/i,
    /salary|compensation|pay(roll)?|bonus|raise/i,
    /internal (document|memo|email|report|meeting)/i,
    /confidential|classified|restricted|private/i,
    /(employee|user|customer) (data|information|record|detail)/i,
    /social security|ssn|credit card|bank account/i,
    /personal (information|data|detail)/i,
    /hr (record|file|document)/i,
    /performance review|disciplinary/i,
    /trade secret|proprietary/i,
];

// Idea-related keywords that indicate valid queries
const IDEA_KEYWORDS = [
    'idea', 'ideas', 'project', 'projects', 'solution', 'solutions',
    'technology', 'tech', 'stack', 'framework',
    'business', 'group', 'domain', 'theme', 'category',
    'filter', 'search', 'find', 'show', 'list', 'explore', 'discover', 'get',
    'innovation', 'innovative', 'application', 'app', 'system',
    'year', 'timeline', 'phase', 'build', 'development', 'prototype',
    'ai', 'ml', 'blockchain', 'cloud', 'iot', 'data', 'analytics',
    'scalability', 'novelty', 'mvp', 'poc',
    'healthcare', 'finance', 'retail', 'manufacturing',
    'latest', 'recent', 'new', 'top', 'best', 'popular', 'trending',
    '2024', '2025', '2023'
];

// Common search intents
const SEARCH_INTENTS = [
    /show (me )?(all |the )?(latest|recent|new)/i,
    /find (me )?(some |any )?/i,
    /search (for )?/i,
    /list (all |the )?/i,
    /get (me )?(all |the )?/i,
    /what (are |is )(the )?(latest|recent|new|best|top)/i,
    /filter (by )?/i,
    /sort (by )?/i,
    /(ideas?|projects?) (about|for|in|with|using|related)/i,
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

    // Check if query is too short
    if (normalizedQuery.length < 2) {
        return {
            valid: false,
            reason: 'Query too short',
            suggestion: 'Please provide a more detailed query about ideas or projects.'
        };
    }

    // Check for off-topic patterns FIRST
    for (const pattern of OFF_TOPIC_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            return {
                valid: false,
                reason: 'Off-topic query',
                suggestion: 'I specialize in helping you discover innovation ideas and projects. Try asking about specific technologies, business domains, or search for ideas using keywords like "AI projects" or "healthcare innovations".'
            };
        }
    }

    // Check for confidential information requests
    for (const pattern of CONFIDENTIAL_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            return {
                valid: false,
                reason: 'Confidential information request',
                suggestion: 'I cannot provide confidential or sensitive information. I can help you search for publicly available innovation ideas and projects.'
            };
        }
    }

    // Check if it's a clear search intent
    const hasSearchIntent = SEARCH_INTENTS.some(pattern => pattern.test(normalizedQuery));
    if (hasSearchIntent) {
        return { valid: true };
    }

    // Check if query contains idea-related keywords
    const hasIdeaKeyword = IDEA_KEYWORDS.some(keyword =>
        normalizedQuery.includes(keyword.toLowerCase())
    );

    if (hasIdeaKeyword) {
        return { valid: true };
    }

    // For queries without clear intent, check length and provide guidance
    if (normalizedQuery.length < 20) {
        // Short queries without keywords - might be off-topic
        // But allow single-word tech terms
        const techTerms = ['react', 'python', 'java', 'node', 'angular', 'vue', 'docker', 'kubernetes', 'aws', 'azure'];
        if (techTerms.some(term => normalizedQuery.includes(term))) {
            return { valid: true };
        }

        return {
            valid: true,
            warning: true,
            suggestion: 'For better results, try being more specific. Example: "AI projects in healthcare" or "latest React applications".'
        };
    }

    // Allow longer queries that might be descriptive searches
    return { valid: true };
}

/**
 * Extract idea-related entities from query
 * @param {string} query - User query
 * @returns {Object} - Extracted entities
 */
export function extractEntities(query) {
    const entities = {
        technologies: [],
        domains: [],
        businessGroups: [],
        years: [],
        phases: [],
        intents: []
    };

    const normalizedQuery = query.toLowerCase();

    // Technology patterns
    const techPatterns = {
        'Python': /\bpython\b/i,
        'JavaScript': /\b(javascript|js)\b/i,
        'TypeScript': /\btypescript\b/i,
        'Java': /\bjava\b(?!script)/i,
        'React': /\breact\b/i,
        'Angular': /\bangular\b/i,
        'Vue': /\bvue\b/i,
        'Node.js': /\bnode\.?js\b/i,
        'AI/ML': /\b(ai|ml|machine learning|artificial intelligence|deep learning)\b/i,
        'Blockchain': /\b(blockchain|distributed ledger|web3)\b/i,
        'Cloud': /\b(cloud|aws|azure|gcp|serverless)\b/i,
        'IoT': /\b(iot|internet of things)\b/i,
        'Docker': /\bdocker\b/i,
        'Kubernetes': /\b(kubernetes|k8s)\b/i,
    };

    for (const [tech, pattern] of Object.entries(techPatterns)) {
        if (pattern.test(query)) {
            entities.technologies.push(tech);
        }
    }

    // Domain patterns
    const domainPatterns = {
        'Healthcare': /\b(healthcare|medical|hospital|patient|clinical|health)\b/i,
        'Finance': /\b(finance|banking|fintech|payment|loan|insurance)\b/i,
        'Retail': /\b(retail|ecommerce|e-commerce|shopping|store)\b/i,
        'Manufacturing': /\b(manufacturing|factory|production|supply chain)\b/i,
        'Education': /\b(education|learning|school|university|training)\b/i,
    };

    for (const [domain, pattern] of Object.entries(domainPatterns)) {
        if (pattern.test(query)) {
            entities.domains.push(domain);
        }
    }

    // Extract years
    const yearMatches = query.match(/\b(202[0-9]|2030)\b/g);
    if (yearMatches) {
        entities.years = yearMatches.map(y => parseInt(y));
    }

    // Extract phases
    const phasePatterns = {
        'Prototype': /\bprototype\b/i,
        'MVP': /\bmvp\b/i,
        'Development': /\b(development|in development)\b/i,
        'Production': /\b(production|live|deployed)\b/i,
        'POC': /\b(poc|proof of concept)\b/i,
    };

    for (const [phase, pattern] of Object.entries(phasePatterns)) {
        if (pattern.test(query)) {
            entities.phases.push(phase);
        }
    }

    // Detect intent
    if (/\b(latest|recent|new|newest)\b/i.test(query)) entities.intents.push('latest');
    if (/\b(top|best|popular|trending)\b/i.test(query)) entities.intents.push('popular');
    if (/\b(filter|sort|by)\b/i.test(query)) entities.intents.push('filter');

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
        'Off-topic query': "🤔 I'm designed to help you discover innovation ideas and projects.",
        'Confidential information request': '🔒 I cannot access or provide confidential information.',
        'Invalid query format': '❓ I need a valid search query to help you.',
        'Query too short': '📝 Please provide more details about what you\'re looking for.'
    };

    const prefix = prefixes[reason] || '💡 Let me help you find great ideas!';
    return `${prefix}\n\n${suggestion}`;
}

export default {
    validateQuery,
    extractEntities,
    generateErrorMessage
};
