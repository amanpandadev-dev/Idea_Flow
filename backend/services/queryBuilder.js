/**
 * Query Builder Service
 * NO NLP mutation - uses raw user message
 * Replaces all token expansion and manipulation
 */

/**
 * Build clean semantic query (no manipulation!)
 * @param {string} rawMessage - The user's original message
 * @returns {string} Clean query for embedding
 */
export function buildSemanticQuery(rawMessage) {
    // NO manipulation, NO expansion, NO rewriting
    // Just trim whitespace
    return rawMessage.trim();
}

/**
 * Build refined query by merging with previous
 * Used for refine_search intent
 */
export function buildRefinedQuery(previousQuery, refinement) {
    if (!previousQuery) {
        return buildSemanticQuery(refinement);
    }

    // Simple concatenation - let embedding model handle semantics
    return `${previousQuery} ${refinement}`.trim();
}

export default {
    buildSemanticQuery,
    buildRefinedQuery
};
