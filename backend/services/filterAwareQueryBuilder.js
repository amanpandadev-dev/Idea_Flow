/**
 * Query Builder Service - Filter-Aware Semantic Queries
 * 
 * Dual-Channel Approach:
 * Channel 1: Semantic query text (includes filter context for embeddings)
 * Channel 2: Metadata constraints (PostgreSQL/ChromaDB filtering)
 */

/**
 * Build filter-aware semantic query
 * Injects filter context into query text so embeddings understand constraints
 * 
 * @param {string} userQuery - Original user query
 * @param {Object} filters - Active filters { technologies, businessGroups, domains, years }
 * @returns {string} Enhanced query with filter context
 */
export function buildFilterAwareQuery(userQuery, filters = {}) {
    let queryParts = [userQuery.trim()];

    // Add business group context
    if (filters.businessGroups && filters.businessGroups.length > 0) {
        queryParts.push(`Business Group: ${filters.businessGroups.join(', ')}`);
    }

    // Add domain/theme context
    if (filters.domains && filters.domains.length > 0) {
        queryParts.push(`Domain: ${filters.domains.join(', ')}`);
    }

    // Add technology context
    if (filters.technologies && filters.technologies.length > 0) {
        queryParts.push(`Technology: ${filters.technologies.join(', ')}`);
    }

    // Add year context
    if (filters.years && filters.years.length > 0) {
        queryParts.push(`Year: ${filters.years.join(', ')}`);
    }

    const enhancedQuery = queryParts.join('\n\n');

    console.log(`[FilterAwareQuery] Original: "${userQuery}"`);
    console.log(`[FilterAwareQuery] Enhanced: "${enhancedQuery}"`);

    return enhancedQuery;
}

/**
 * Detect business group mentions in natural language
 * Converts informal mentions to official metadata labels
 * 
 * @param {string} query - User query
 * @returns {string[]} Detected business groups
 */
export function detectBusinessGroups(query) {
    const lowerQuery = query.toLowerCase();
    const detectedGroups = [];

    // BFSI variations
    if (lowerQuery.includes('bfsi') ||
        lowerQuery.includes('banking') ||
        lowerQuery.includes('financial services') ||
        lowerQuery.includes('insurance')) {
        detectedGroups.push('Banking, Financial Services & Insurance (BFSI)');
    }

    // Retail variations
    if (lowerQuery.includes('retail') || lowerQuery.includes('e-commerce')) {
        detectedGroups.push('Retail');
    }

    // Healthcare variations
    if (lowerQuery.includes('healthcare') ||
        lowerQuery.includes('medical') ||
        lowerQuery.includes('hospital')) {
        detectedGroups.push('Healthcare');
    }

    // Manufacturing variations
    if (lowerQuery.includes('manufacturing') || lowerQuery.includes('factory')) {
        detectedGroups.push('Manufacturing');
    }

    // Telecom variations
    if (lowerQuery.includes('telecom') || lowerQuery.includes('telecommunications')) {
        detectedGroups.push('Telecommunications');
    }

    // Energy & Utilities
    if (lowerQuery.includes('energy') || lowerQuery.includes('utilities')) {
        detectedGroups.push('Energy & Utilities');
    }

    // Government
    if (lowerQuery.includes('government') || lowerQuery.includes('public sector')) {
        detectedGroups.push('Government');
    }

    if (detectedGroups.length > 0) {
        console.log(`[BusinessGroupDetection] Detected: ${detectedGroups.join(', ')}`);
    }

    return detectedGroups;
}

/**
 * Check if query has filter-relevant terms
 * Used to decide if we need filter-aware embedding
 */
export function hasFilterTerms(query) {
    const lowerQuery = query.toLowerCase();

    // Business group terms
    const businessGroupTerms = ['bfsi', 'banking', 'retail', 'healthcare', 'manufacturing',
        'telecom', 'energy', 'government'];

    // Domain/theme terms
    const domainTerms = ['ai for', 'genai', 'agentic', 'edge ai', 'responsible ai'];

    // Technology terms
    const techTerms = ['python', 'java', 'react', 'angular', 'node', 'typescript',
        'machine learning', 'deep learning'];

    return businessGroupTerms.some(term => lowerQuery.includes(term)) ||
        domainTerms.some(term => lowerQuery.includes(term)) ||
        techTerms.some(term => lowerQuery.includes(term));
}

export default {
    buildFilterAwareQuery,
    detectBusinessGroups,
    hasFilterTerms
};
