// ENTERPRISE: Updated Fast Intent Heuristic
// Copy this function to replace the existing fastIntentHeuristic in proSearchRoutes.js (around line 139)

function fastIntentHeuristic(query, hasContext, currentDomain = null) {
    const lower = query.toLowerCase().trim();
    const wordCount = query.split(/\s+/).length;

    // PRIORITY 1: Reset/Clear
    if (ENTERPRISE_PATTERNS.reset.test(lower)) {
        console.log(`[Heuristic] Reset detected`);
        return 'reset_filters';
    }

    // PRIORITY 2: Remove filter
    if (lower.match(/^(remove|clear|delete) (year|tech|domain|filter)/)) {
        return 'remove_filter';
    }

    // PRIORITY 3: No context = semantic search
    if (!hasContext) {
        return 'semantic_search';
    }

    // PRIORITY 4: Domain shift = new search
    if (isDomainShift(query, currentDomain)) {
        console.log(`[Heuristic] Domain shift → semantic_search`);
        return 'semantic_search';
    }

    // PRIORITY 5: Enterprise metadata = refinement
    const metadata = extractEnterpriseMetadata(query);
    if (Object.keys(metadata).length > 0) {
        console.log(`[Heuristic] Metadata detected:`, metadata, '→ refine_search');
        return 'refine_search';
    }

    // PRIORITY 6: Short with context = refinement
    if (hasContext && wordCount <= 4) {
        return 'refine_search';
    }

    // PRIORITY 7: Questions
    if (lower.match(/^(what|how|why|when|who|where|can|could|would|should|is|are|do|does)/)) {
        return 'ask_question';
    }

    // Default: semantic search
    if (wordCount >= 3) {
        return 'semantic_search';
    }

    return null;
}
