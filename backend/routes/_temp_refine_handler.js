// ENTERPRISE: Updated REFINE_SEARCH handler
// Copy this case statement to replace the existing REFINE_SEARCH case in proSearchRoutes.js (around line 738)

case INTENTS.REFINE_SEARCH:
// GUARD: Prevent operating without base results
if (context.baseResults.length === 0) {
    console.warn('[Refine] No base results - cannot refine');
    semanticResults = [];
    break;
}

console.log(`[Refine] Starting from ${context.currentResults.length} results`);
const refineStart = Date.now();

// ENTERPRISE: Extract metadata using regex (NO LLM!)
const enterpriseMetadata = extractEnterpriseMetadata(trimmedQuery);

if (Object.keys(enterpriseMetadata).length > 0) {
    // Use in-memory indexes (O(1), <10ms target)
    semanticResults = context.refineByMetadata(enterpriseMetadata);

    const refineTime = Date.now() - refineStart;
    console.log(`[Refine] Index-based: ${context.previousCount} → ${semanticResults.length} in ${refineTime}ms ${refineTime < 10 ? '✅' : '⚠️'}`);

    // Track applied filters
    if (enterpriseMetadata.technology) context.addFilter('technologies', enterpriseMetadata.technology);
    if (enterpriseMetadata.year) context.addFilter('years', enterpriseMetadata.year);
    if (enterpriseMetadata.businessGroup) context.addFilter('businessGroups', enterpriseMetadata.businessGroup);
    if (enterpriseMetadata.domain) context.addFilter('domains', enterpriseMetadata.domain);
    if (enterpriseMetadata.aiTheme) context.addFilter('themes', enterpriseMetadata.aiTheme);

} else {
    // Fallback: keyword matching (when no metadata detected)
    const queryTerms = trimmedQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    semanticResults = context.narrowResults(result => {
        const searchText = [
            result.metadata?.title || '',
            result.metadata?.summary || '',
            result.document || ''
        ].join(' ').toLowerCase();

        return queryTerms.some(term => searchText.includes(term));
    });

    const refineTime = Date.now() - refineStart;
    console.log(`[Refine] Keyword: ${context.previousCount} → ${semanticResults.length} in ${refineTime}ms`);
}

// Update query for context
const refinedQuery = buildRefinedQuery(context.semanticQuery, trimmedQuery);
context.updateSemanticQuery(refinedQuery);

break;
