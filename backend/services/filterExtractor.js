/**
 * Filter Extractor Service
 * Deterministic, rule-based extraction of filters from user messages
 * 
 * This service implements a deterministic filter extraction system that parses
 * user messages to identify filter criteria without using AI/LLM inference.
 * 
 * Supported Filter Types:
 * - Technologies: Known technology names (e.g., Java, Python, Kubernetes)
 * - Business Groups: Known business group names (e.g., Healthcare, Banking)
 * - Themes: Known theme names (e.g., AI for Organization, Edge AI)
 * - Years: Year values between 2021 and 2025
 * 
 * Filter Modes:
 * - ADD: Include additional filters (default)
 * - REMOVE: Exclude items matching filters
 * - REPLACE: Replace current filters with new ones
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 * 
 * @module filterExtractor
 */

// Predefined filter values based on database schema
const KNOWN_TECHNOLOGIES = [
    'AI/ML',
    'Java',
    'JavaScript',
    'Python',
    'Flutter',
    'React',
    'Node.js',
    'TypeScript',
    'Go',
    'Rust',
    'C++',
    'C#',
    'Ruby',
    'PHP',
    'Swift',
    'Kotlin',
    'Datadog',
    'Kubernetes',
    'Docker',
    'AWS',
    'Azure',
    'GCP',
    'Terraform',
    'Ansible'
];

const KNOWN_BUSINESS_GROUPS = [
    'Product Engineering & IoT',
    'Sales, Marketing & Alliances',
    'Business Group',
    'Travel, Hospitality & Services (THS)',
    'Finance & Procurement',
    'Hi-Tech',
    'Management Consulting',
    'Enterprise Architecture Group',
    'Healthcare',
    'Banking',
    'Retail',
    'Manufacturing',
    'Energy',
    'Telecommunications',
    'Government',
    'Education'
];

const KNOWN_THEMES = [
    'AI for Organization',
    'AI for accessibility',
    'AI for creative',
    'Edge AI',
    'Proprietary models',
    'Classical AI/ML/DL for prediction/recommendations',
    'Agents and APIs',
    'Virtual workers/copilots',
    'AI for Cybersecurity',
    'AI for Data Analytics',
    'AI for Customer Experience',
    'AI for Operations',
    'FinOps',
    'DevOps',
    'MLOps'
];

// Control words for mode detection
const ADD_KEYWORDS = ['show', 'include', 'add', 'also', 'and', 'with', 'plus'];
const REMOVE_KEYWORDS = ['exclude', 'remove', 'without', 'not', 'except', 'minus'];
const REPLACE_KEYWORDS = ['only', 'just', 'switch to', 'change to', 'replace with'];

// Year range validation
const MIN_YEAR = 2021;
const MAX_YEAR = 2025;

/**
 * Extract filters from user message using rule-based patterns
 * @param {string} message - User message
 * @param {Object} context - Current filter state and available values (optional)
 * @returns {FilterExtractionResult}
 */
export function extractFilters(message, context = {}) {
    if (!message || typeof message !== 'string') {
        throw new Error('message must be a non-empty string');
    }

    const normalizedMessage = message.toLowerCase().trim();

    // Extract each filter type
    const technologies = extractTechnologies(normalizedMessage);
    const businessGroups = extractBusinessGroups(normalizedMessage);
    const themes = extractThemes(normalizedMessage);
    const years = extractYears(normalizedMessage);
    const mode = detectMode(normalizedMessage);

    return {
        technologies,
        businessGroups,
        themes,
        years,
        mode
    };
}

/**
 * Extract technology names from message
 * @param {string} normalizedMessage - Lowercase message
 * @returns {string[]} Array of technology names
 */
function extractTechnologies(normalizedMessage) {
    const found = [];

    // Check each known technology
    for (const tech of KNOWN_TECHNOLOGIES) {
        const techLower = tech.toLowerCase();
        
        // Use word boundary matching for better precision
        const wordBoundaryPattern = new RegExp(`\\b${escapeRegex(techLower)}\\b`, 'i');
        if (wordBoundaryPattern.test(normalizedMessage)) {
            found.push(tech);
            continue;
        }

        // Common variations
        const variations = getTechnologyVariations(tech);
        for (const variation of variations) {
            const variationPattern = new RegExp(`\\b${escapeRegex(variation)}\\b`, 'i');
            if (variationPattern.test(normalizedMessage)) {
                found.push(tech);
                break;
            }
        }
    }

    return [...new Set(found)]; // Remove duplicates
}

/**
 * Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get common variations for technology names
 * @param {string} tech - Technology name
 * @returns {string[]} Array of variations
 */
function getTechnologyVariations(tech) {
    const variations = {
        'Kubernetes': ['k8s', 'kube'],
        'JavaScript': ['js', 'javascript'],
        'TypeScript': ['ts', 'typescript'],
        'Python': ['py', 'python'],
        'AI/ML': ['ai', 'ml', 'machine learning', 'artificial intelligence'],
        'Node.js': ['node', 'nodejs'],
        'React': ['reactjs', 'react.js'],
        'AWS': ['amazon web services'],
        'Azure': ['microsoft azure'],
        'GCP': ['google cloud', 'google cloud platform']
    };

    return variations[tech] || [];
}

/**
 * Extract business group names from message
 * @param {string} normalizedMessage - Lowercase message
 * @returns {string[]} Array of business group names
 */
function extractBusinessGroups(normalizedMessage) {
    const found = [];

    for (const group of KNOWN_BUSINESS_GROUPS) {
        const groupLower = group.toLowerCase();
        
        // Direct match
        if (normalizedMessage.includes(groupLower)) {
            found.push(group);
            continue;
        }

        // Partial match (e.g., "health" matches "Healthcare")
        const words = groupLower.split(/[\s,&()]+/);
        for (const word of words) {
            if (word.length > 3 && normalizedMessage.includes(word)) {
                found.push(group);
                break;
            }
        }
    }

    return [...new Set(found)]; // Remove duplicates
}

/**
 * Extract theme names from message
 * @param {string} normalizedMessage - Lowercase message
 * @returns {string[]} Array of theme names
 */
function extractThemes(normalizedMessage) {
    const found = [];

    for (const theme of KNOWN_THEMES) {
        const themeLower = theme.toLowerCase();
        
        // Direct match
        if (normalizedMessage.includes(themeLower)) {
            found.push(theme);
            continue;
        }

        // Fuzzy match for multi-word themes
        const themeWords = themeLower.split(/[\s/]+/).filter(w => w.length > 2);
        const matchCount = themeWords.filter(word => 
            normalizedMessage.includes(word)
        ).length;

        // If most words match, consider it a match
        if (matchCount >= Math.ceil(themeWords.length * 0.6)) {
            found.push(theme);
        }
    }

    return [...new Set(found)]; // Remove duplicates
}

/**
 * Extract years from message
 * @param {string} normalizedMessage - Lowercase message
 * @returns {number[]} Array of year values
 */
function extractYears(normalizedMessage) {
    const found = [];

    // Handle "latest" keyword
    if (normalizedMessage.includes('latest') || normalizedMessage.includes('recent')) {
        found.push(MAX_YEAR);
    }

    // Extract 4-digit years in valid range
    const yearPattern = /\b(202[1-5])\b/g;
    const matches = normalizedMessage.matchAll(yearPattern);
    
    for (const match of matches) {
        const year = parseInt(match[1]);
        if (year >= MIN_YEAR && year <= MAX_YEAR) {
            found.push(year);
        }
    }

    // Handle year ranges (e.g., "2023 to 2024", "2023-2024")
    const rangePattern = /\b(202[1-5])\s*(?:to|-|through)\s*(202[1-5])\b/g;
    const rangeMatches = normalizedMessage.matchAll(rangePattern);
    
    for (const match of rangeMatches) {
        const startYear = parseInt(match[1]);
        const endYear = parseInt(match[2]);
        
        for (let year = startYear; year <= endYear; year++) {
            if (year >= MIN_YEAR && year <= MAX_YEAR) {
                found.push(year);
            }
        }
    }

    return [...new Set(found)].sort(); // Remove duplicates and sort
}

/**
 * Detect filter mode from message
 * @param {string} normalizedMessage - Lowercase message
 * @returns {string} Mode: "ADD", "REMOVE", or "REPLACE"
 */
function detectMode(normalizedMessage) {
    // Check for REPLACE keywords first (most specific)
    for (const keyword of REPLACE_KEYWORDS) {
        if (normalizedMessage.includes(keyword)) {
            return 'REPLACE';
        }
    }

    // Check for REMOVE keywords
    for (const keyword of REMOVE_KEYWORDS) {
        if (normalizedMessage.includes(keyword)) {
            return 'REMOVE';
        }
    }

    // Check for ADD keywords (or default)
    for (const keyword of ADD_KEYWORDS) {
        if (normalizedMessage.includes(keyword)) {
            return 'ADD';
        }
    }

    // Default mode is ADD
    return 'ADD';
}

/**
 * Get available filter values (for context)
 * @returns {Object} Available filter options
 */
export function getAvailableFilters() {
    return {
        technologies: [...KNOWN_TECHNOLOGIES],
        businessGroups: [...KNOWN_BUSINESS_GROUPS],
        themes: [...KNOWN_THEMES],
        yearRange: { min: MIN_YEAR, max: MAX_YEAR }
    };
}

export default {
    extractFilters,
    getAvailableFilters
};
