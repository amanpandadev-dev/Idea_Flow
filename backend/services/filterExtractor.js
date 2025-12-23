/**
 * Filter Extractor Service
 * Extracts filter type, value, and action (REPLACE/ADD/REMOVE) from user message
 * Uses Llama for intelligent extraction
 */

import { generateStructuredJSON } from '../config/ollama.js';

/**
 * Known categories/themes from the database
 * These should be checked BEFORE sending to LLM to avoid misidentification
 */
const KNOWN_CATEGORIES = [
    'GenAI & its techniques',
    'Multi-modal UX',
    'Edge AI',
    'Agentic AI',
    'Responsible AI',
    'AI for accessibility',
    'AI for Organization',
    'AI for Industry',
    'AI for Data & Data for AI',
    'AI in service line',
    'Classical AI/ML/DL for prediction/recommendations',
    'Orchestration & MCP',
    'Proprietary models'
];

/**
 * Extract filter information from message with action semantics
 * STRICT MODE: Only extract filters when EXPLICITLY mentioned
 * @param {string} message - User message
 * @returns {Promise<Object>} {type, value, action: 'REPLACE'|'ADD'|'REMOVE'}
 */
export async function extractFilterInfo(message) {
    // PRE-CHECK: Match against known categories first
    const lowerMessage = message.toLowerCase();

    // Check for category/theme matches
    for (const category of KNOWN_CATEGORIES) {
        if (lowerMessage.includes(category.toLowerCase())) {
            console.log(`[Filter Extractor] Matched known category: "${category}"`);

            // Determine action based on keywords
            let action = 'ADD'; // default for categories
            if (lowerMessage.includes('only') || lowerMessage.includes('just')) {
                action = 'REPLACE';
            } else if (lowerMessage.includes('remove') || lowerMessage.includes('without')) {
                action = 'REMOVE';
            } else if (lowerMessage.includes('also') || lowerMessage.includes('and')) {
                action = 'ADD';
            }

            return {
                type: 'theme',
                value: category,
                action: action
            };
        }
    }

    // 🚨 STRICT FILTER EXTRACTION - Only extract if EXPLICIT

    // Check for EXPLICIT year mentions (e.g., "from 2024", "in 2023", "created in 2024")
    const yearPattern = /\b(from|in|at|year|created\s+in|submitted\s+in|during)\s+(20\d{2})\b/i;
    const yearMatch = message.match(yearPattern);
    if (yearMatch) {
        const year = parseInt(yearMatch[2]);
        console.log(`[Filter Extractor] EXPLICIT year detected: ${year}`);
        return {
            type: 'year',
            value: year,
            action: 'REPLACE'
        };
    }

    // Check for EXPLICIT technology mentions (e.g., "using Python", "with React")
    const techPattern = /\b(using|with|in|built\s+with|written\s+in)\s+(Python|Java|JavaScript|React|Angular|Node\.?js|TypeScript|Go|Rust|C\+\+|Ruby|PHP|Swift|Kotlin)\b/i;
    const techMatch = message.match(techPattern);
    if (techMatch) {
        const tech = techMatch[2];
        console.log(`[Filter Extractor] EXPLICIT technology detected: ${tech}`);
        return {
            type: 'technology',
            value: tech,
            action: lowerMessage.includes('only') ? 'REPLACE' : 'ADD'
        };
    }

    // Check for EXPLICIT domain/business group mentions (e.g., "in BFSI", "for healthcare")
    const domainPattern = /\b(in|for|domain|sector)\s+(BFSI|Healthcare|Retail|Finance|Banking)\b/i;
    const domainMatch = message.match(domainPattern);
    if (domainMatch) {
        const domain = domainMatch[2];
        console.log(`[Filter Extractor] EXPLICIT domain detected: ${domain}`);
        return {
            type: 'domain',
            value: domain,
            action: lowerMessage.includes('only') ? 'REPLACE' : 'ADD'
        };
    }

    // 🚨 NO IMPLICIT FILTERS!
    // "latest", "find", "show me" → NOT treated as filters
    // They affect SORTING, not FILTERING

    console.log(`[Filter Extractor] No EXPLICIT filter detected in: "${message}"`);
    return { type: null, value: null, action: null };
}

/**
 * Normalize filter type
 */
export function normalizeFilterType(type) {
    if (!type) return null;

    const normalized = type.toLowerCase();

    if (normalized.includes('tech')) return 'technologies';
    if (normalized.includes('domain')) return 'domains';
    if (normalized.includes('year')) return 'years';
    if (normalized.includes('business') || normalized.includes('group')) return 'businessGroups';
    if (normalized.includes('theme')) return 'themes';

    return type;
}

/**
 * Normalize filter value
 */
export function normalizeFilterValue(value, type) {
    if (!value) return null;

    // Handle arrays
    if (Array.isArray(value)) {
        return value.map(v => normalizeFilterValue(v, type));
    }

    // Convert year strings to numbers
    if (type === 'years' || type === 'year') {
        const yearNum = parseInt(value);
        return isNaN(yearNum) ? null : yearNum;
    }

    // Capitalize first letter for display
    if (typeof value === 'string') {
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }

    return value;
}

/**
 * Extract filters from query and convert to PostgreSQL-compatible format
 * Used for two-stage search architecture
 * @param {string} query - User query
 * @returns {Promise<Object>} { technologies, businessGroups, domains, years }
 */
export async function extractFiltersForPostgres(query) {
    const extracted = await extractFilterInfo(query);

    const filters = {
        technologies: [],
        businessGroups: [],
        domains: [],
        years: []
    };

    if (!extracted.type || !extracted.value) {
        return filters;
    }

    const normalizedType = normalizeFilterType(extracted.type);
    let normalizedValue = normalizeFilterValue(extracted.value, extracted.type);

    // Ensure value is array
    if (!Array.isArray(normalizedValue)) {
        normalizedValue = [normalizedValue];
    }

    // Map to correct filter category
    switch (normalizedType) {
        case 'technologies':
        case 'techStack':
            filters.technologies = normalizedValue;
            break;
        case 'businessGroups':
        case 'businessGroup':
            filters.businessGroups = normalizedValue;
            break;
        case 'domains':
        case 'domain':
        case 'themes':
        case 'theme':
            filters.domains = normalizedValue;
            break;
        case 'years':
        case 'year':
            filters.years = normalizedValue;
            break;
    }

    console.log(`[FilterExtractor] Postgres format:`, filters);
    return filters;
}

export default {
    extractFilterInfo,
    normalizeFilterType,
    normalizeFilterValue,
    extractFiltersForPostgres
};
