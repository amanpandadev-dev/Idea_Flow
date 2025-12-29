/**
 * Synonym Resolver for ProSearch Filters
 * Maps user-friendly terms to exact taxonomy values
 * Enables "banking" → "Banking, Financial Services & Insurance (BFSI)"
 */

// Synonym dictionary for business groups, themes, and tech stack
const SYNONYMS = {
    // Business Groups
    'banking': 'Banking, Financial Services & Insurance (BFSI)',
    'finance': 'Banking, Financial Services & Insurance (BFSI)',
    'bfsi': 'Banking, Financial Services & Insurance (BFSI)',
    'financial services': 'Banking, Financial Services & Insurance (BFSI)',
    'insurance': 'Banking, Financial Services & Insurance (BFSI)',
    'bank': 'Banking, Financial Services & Insurance (BFSI)',

    'healthcare': 'Healthcare & Life Sciences',
    'medical': 'Healthcare & Life Sciences',
    'pharma': 'Healthcare & Life Sciences',
    'health': 'Healthcare & Life Sciences',
    'life sciences': 'Healthcare & Life Sciences',

    'retail': 'Retail & Consumer Goods',
    'consumer': 'Retail & Consumer Goods',
    'ecommerce': 'Retail & Consumer Goods',
    'e-commerce': 'Retail & Consumer Goods',
    'shopping': 'Retail & Consumer Goods',

    'manufacturing': 'Manufacturing & Industrial',
    'industrial': 'Manufacturing & Industrial',
    'factory': 'Manufacturing & Industrial',

    'telecom': 'Telecommunications',
    'telecommunications': 'Telecommunications',
    'telco': 'Telecommunications',

    // Themes
    'ai': 'GenAI & Its Techniques',
    'genai': 'GenAI & Its Techniques',
    'llm': 'GenAI & Its Techniques',
    'machine learning': 'GenAI & Its Techniques',
    'ml': 'GenAI & Its Techniques',
    'artificial intelligence': 'GenAI & Its Techniques',
    'gpt': 'GenAI & Its Techniques',
    'chatbot': 'GenAI & Its Techniques',

    'blockchain': 'Blockchain & Web3',
    'web3': 'Blockchain & Web3',
    'crypto': 'Blockchain & Web3',
    'cryptocurrency': 'Blockchain & Web3',
    'nft': 'Blockchain & Web3',
    'defi': 'Blockchain & Web3',

    'cloud': 'Cloud & Infrastructure',
    'infrastructure': 'Cloud & Infrastructure',
    'devops': 'Cloud & Infrastructure',
    'aws': 'Cloud & Infrastructure',
    'azure': 'Cloud & Infrastructure',
    'gcp': 'Cloud & Infrastructure',

    'data': 'Data & Analytics',
    'analytics': 'Data & Analytics',
    'big data': 'Data & Analytics',
    'data science': 'Data & Analytics',
    'bi': 'Data & Analytics',
    'business intelligence': 'Data & Analytics',

    'iot': 'IoT & Edge Computing',
    'internet of things': 'IoT & Edge Computing',
    'edge': 'IoT & Edge Computing',
    'edge computing': 'IoT & Edge Computing',

    'security': 'Cybersecurity',
    'cybersecurity': 'Cybersecurity',
    'infosec': 'Cybersecurity',
    'information security': 'Cybersecurity',

    // Tech Stack
    'python': 'Python',
    'py': 'Python',

    'javascript': 'JavaScript',
    'js': 'JavaScript',

    'typescript': 'TypeScript',
    'ts': 'TypeScript',

    'react': 'React',
    'reactjs': 'React',

    'node': 'Node.js',
    'nodejs': 'Node.js',
    'node.js': 'Node.js',

    'java': 'Java',

    'dotnet': '.NET',
    '.net': '.NET',
    'csharp': '.NET',
    'c#': '.NET',

    'go': 'Go',
    'golang': 'Go',

    'rust': 'Rust',

    'docker': 'Docker',
    'kubernetes': 'Kubernetes',
    'k8s': 'Kubernetes'
};

/**
 * Resolve a single term to its canonical form
 * @param {string} userInput - User-provided term
 * @returns {string} - Canonical term or original if no match
 */
function resolveTerm(userInput) {
    if (!userInput || typeof userInput !== 'string') {
        return userInput;
    }

    const normalized = userInput.toLowerCase().trim();
    return SYNONYMS[normalized] || userInput;
}

/**
 * Resolve business group term
 * @param {string} userInput - User input like "banking"
 * @returns {string} - Canonical name like "Banking, Financial Services & Insurance (BFSI)"
 */
export function resolveBusinessGroup(userInput) {
    return resolveTerm(userInput);
}

/**
 * Resolve theme term
 * @param {string} userInput - User input like "ai" or "blockchain"
 * @returns {string} - Canonical theme name
 */
export function resolveTheme(userInput) {
    return resolveTerm(userInput);
}

/**
 * Resolve tech stack term
 * @param {string} userInput - User input like "js" or "nodejs"
 * @returns {string} - Canonical tech name
 */
export function resolveTechStack(userInput) {
    return resolveTerm(userInput);
}

/**
 * Normalize all filters in a filter object
 * @param {Object} filters - Filter object with businessGroup, theme, techStack arrays
 * @returns {Object} - Normalized filter object
 */
export function normalizeFilters(filters) {
    if (!filters) {
        return {
            businessGroup: [],
            theme: [],
            techStack: [],
            year: null
        };
    }

    return {
        businessGroup: (filters.businessGroup || []).map(resolveBusinessGroup),
        theme: (filters.theme || []).map(resolveTheme),
        techStack: (filters.techStack || []).map(resolveTechStack),
        year: filters.year || null
    };
}

/**
 * Check if a term has a synonym mapping
 * @param {string} term - Term to check
 * @returns {boolean} - True if synonym exists
 */
export function hasSynonym(term) {
    if (!term || typeof term !== 'string') {
        return false;
    }
    const normalized = term.toLowerCase().trim();
    return SYNONYMS.hasOwnProperty(normalized);
}

/**
 * Get all possible synonyms for a canonical term (reverse lookup)
 * @param {string} canonicalTerm - Canonical term like "BFSI"
 * @returns {string[]} - Array of synonyms
 */
export function getSynonyms(canonicalTerm) {
    const synonyms = [];
    for (const [key, value] of Object.entries(SYNONYMS)) {
        if (value === canonicalTerm) {
            synonyms.push(key);
        }
    }
    return synonyms;
}

export default {
    resolveBusinessGroup,
    resolveTheme,
    resolveTechStack,
    normalizeFilters,
    hasSynonym,
    getSynonyms
};
