// REHYDRATION LOGIC + STATE PERSISTENCE
// Add to proSearchRoutes.js after imports and before routes

import { SearchStateService } from '../services/searchStateService.js';

// Add after line 568 (after getting context) in /conversational endpoint:

// REHYDRATION: Restore search state if conversation exists but no in-memory context
const isNewSession = !hasContext(userId, conversationId);

if (conversationId && isNewSession) {
    console.log(`[Rehydration] Checking for saved search state...`);

    const searchStateService = new SearchStateService(pool);
    const savedState = await searchStateService.loadSearchState(conversationId);

    if (savedState) {
        console.log(`[Rehydration] Found saved state from ${new Date(savedState.updatedAt).toLocaleString()}`);

        // Fetch full idea objects from database using IDs
        const ideaIds = savedState.currentResultIds;

        if (ideaIds && ideaIds.length > 0) {
            const ideasResult = await pool.query(
                `SELECT id, title, summary, problem_statement, solution, 
                        business_group, technologies, created_at
                 FROM ideas WHERE id = ANY($1::int[])`,
                [ideaIds]
            );

            // Map to ChromaDB format with metadata
            const restoredResults = ideasResult.rows.map(idea => ({
                id: idea.id.toString(),
                document: `${idea.title} ${idea.summary} ${idea.problem_statement || ''} ${idea.solution || ''}`,
                metadata: {
                    idea_id: idea.id,
                    title: idea.title,
                    summary: idea.summary,
                    business_group: idea.business_group,
                    technologies: idea.technologies,
                    created_at: idea.created_at
                },
                similarity: 1.0 // Restored results don't have similarity scores
            }));

            // Restore context
            context.setBaseResults(savedState.baseQuery, restoredResults);
            context.filters = savedState.appliedFilters || {};
            context.lastActionType = 'rehydrated';

            console.log(`[Rehydration] ✅ Restored ${restoredResults.length}/${savedState.baseResultIds.length} results`);

            // Return restored results immediately if query is empty
            if (!trimmedQuery || trimmedQuery.length === 0) {
                return res.json({
                    intent: 'rehydrated',
                    conversationId: context.conversationId,
                    results: formatResults(restoredResults),
                    aiResponse: `Restored ${restoredResults.length} previous results`,
                    suggestions: [],
                    filtersApplied: context.filters,
                    resultContext: {
                        query: savedState.baseQuery,
                        action: 'rehydrated',
                        conversationId: context.conversationId,
                        filters: context.filters
                    },
                    metadata: {
                        intent: 'rehydrated',
                        totalResults: restoredResults.length,
                        processingTime: Date.now() - startTime
                    }
                });
            }
        }
    }
}

// PERSISTENCE: Add after results are finalized (around line 980, after formattedResults)

// Save search state to database
if (conversationId && (intent === INTENTS.SEMANTIC_SEARCH || intent === INTENTS.REFINE_SEARCH)) {
    const searchStateService = new SearchStateService(pool);
    const saveSuccess = await searchStateService.saveSearchState(conversationId, {
        baseQuery: context.baseQuery,
        baseResultIds: context.baseResultIds,
        currentResultIds: context.currentResultIds,
        appliedFilters: context.filters,
        baseDomain: context.filters?.domains?.[0] || null
    });

    if (saveSuccess) {
        console.log(`[Persistence] ✅ Saved search state (${context.currentResultIds.length} results)`);
    }
}
