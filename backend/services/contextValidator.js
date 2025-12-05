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
    // Personal questions about the AI
    /who am i/i,
    /what'?s my name/i,
    /who are you/i,
    /what are you/i,
    /what do you (like|think|feel|want)/i,
    /tell me about (yourself|you)/i,
    /are you (a |an )?(human|robot|ai|bot)/i,
    /how old are you/i,
    /where (do you|are you) (live|from)/i,
    /why are you/i,  // "why are you weird/here/etc"
    /how are you/i,
    /are you (okay|ok|good|fine|happy|sad|angry|weird|stupid|smart|dumb)/i,
    /you are (weird|stupid|dumb|smart|cool|bad|good|nice|mean)/i,
    /do you have (feelings|emotions|a soul|consciousness)/i,
    /can you (feel|think|dream|sleep|eat)/i,
    /what do you look like/i,
    /describe yourself/i,
    
    // Conversational/casual chat (not search related)
    /^(how'?s it going|what'?s going on|sup|yo|wassup)/i,
    /^(thanks|thank you|thx|ty)[\s!.,?]*$/i,
    /^(bye|goodbye|see you|later|cya)[\s!.,?]*$/i,
    /^(yes|no|yeah|nope|yep|nah|ok|okay|sure|fine)[\s!.,?]*$/i,
    /^(lol|haha|hehe|rofl|lmao)/i,
    /^(wow|omg|oh|ah|hmm|huh|meh)/i,
    
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
    /translate .* (to|into)/i,
    /how (tall|big|old|long|far|much|many) is/i,
    
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
    /recommend (me )?(a )?(movie|book|song|show|game)/i,
    
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
    /forget (everything|all|your)/i,
    /new (persona|personality|character)/i,
    
    // Random/nonsense
    /^[a-z]{1,3}[\s!.,?]*$/i,  // Single letters or very short nonsense
    /asdf|qwerty|test123/i,
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

// Greeting patterns
const GREETING_PATTERNS = [
    /^(hi|hello|hey|hola|greetings|good morning|good afternoon|good evening)[\s!.,?]*$/i,
    /^(hi|hello|hey) there[\s!.,?]*$/i,
    /^what'?s up[\s!.,?]*$/i,
    /^howdy[\s!.,?]*$/i,
];

/**
 * Validate if a query is contextually appropriate
 * @param {string} query - User query to validate
 * @returns {Object} - { valid: boolean, reason?: string, suggestion?: string, isGreeting?: boolean }
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

    // Check for greetings FIRST - these are valid but need special handling
    for (const pattern of GREETING_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            return {
                valid: true,
                isGreeting: true,
                greeting: true
            };
        }
    }

    // Check for off-topic patterns
    for (const pattern of OFF_TOPIC_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            return {
                valid: false,
                reason: 'Off-topic query',
                suggestion: "That's outside my knowledge area. I can only help you search for innovation ideas and projects stored in our database. Try asking things like \"show me AI projects\" or \"find healthcare innovations\"."
            };
        }
    }

    // Check for confidential information requests
    for (const pattern of CONFIDENTIAL_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            return {
                valid: false,
                reason: 'Confidential information request',
                suggestion: "I cannot provide confidential or sensitive information. I can help you search for publicly available innovation ideas and projects."
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
    const messages = {
        'Off-topic query': "🤔 That's outside my knowledge area. I can only help you search for innovation ideas and projects stored in our database.\n\nTry asking things like:\n• \"Show me AI projects\"\n• \"Find healthcare innovations\"\n• \"Latest cloud solutions\"",
        'Confidential information request': '🔒 I cannot provide confidential or sensitive information. I can help you search for publicly available innovation ideas and projects.\n\nTry searching for ideas by technology, domain, or business group.',
        'Invalid query format': '❓ I need a valid search query to help you. Try asking about specific technologies, domains, or search for ideas.',
        'Query too short': '📝 Please provide more details about what you\'re looking for. For example: "AI projects in healthcare" or "latest React applications".'
    };

    return messages[reason] || suggestion || '💡 I can help you discover innovation ideas. Try searching for specific technologies or domains!';
}

export default {
    validateQuery,
    extractEntities,
    generateErrorMessage
};
