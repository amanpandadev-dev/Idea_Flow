/**
 * Extract keywords from document themes and search for matching ideas
 * @param {Object} contextStats - Document context statistics with themes
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} db - PostgreSQL database instance
 * @param {string} embeddingProvider - 'grok' or 'llama'
 * @returns {Promise<Array>} Array of matching ideas with relevance scores
 */
export async function findIdeasFromDocumentKeywords(contextStats, chromaClient, db, embeddingProvider = 'grok') {
    if (!contextStats || !contextStats.themes || contextStats.themes.length === 0) {
        console.log('[KeywordMatcher] No themes available');
        return [];
    }

    try {
        // Import semantic search function
        const { searchSimilarIdeas } = await import('./semanticSearch.js');

        // Use themes as search query
        const searchQuery = contextStats.themes.join(' ');
        console.log(`[KeywordMatcher] Searching for ideas related to: ${searchQuery}`);

        // Perform semantic search using document themes
        const matchingIdeas = await searchSimilarIdeas(
            chromaClient,
            db,
            searchQuery,
            embeddingProvider,
            5 // Limit to top 5 most relevant ideas
        );

        console.log(`[KeywordMatcher] Found ${matchingIdeas.length} matching ideas`);

        return matchingIdeas.map(idea => ({
            ...idea,
            matchedKeywords: contextStats.themes.filter(theme =>
                idea.title.toLowerCase().includes(theme.toLowerCase()) ||
                idea.description.toLowerCase().includes(theme.toLowerCase())
            )
        }));

    } catch (error) {
        console.error('[KeywordMatcher] Error finding matching ideas:', error.message);
        return [];
    }
}
