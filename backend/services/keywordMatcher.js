/**
 * Perform keyword-based search in PostgreSQL
 * @param {Object} db - PostgreSQL database instance
 * @param {string[]} keywords - Array of keywords to search for
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of matching ideas
 */
async function keywordSearch(db, keywords, limit = 10) {
    if (!keywords || keywords.length === 0) {
        return [];
    }

    try {
        // Build search query with OR conditions for each keyword
        const conditions = keywords.map((_, index) => 
            `(title ILIKE $${index + 1} OR summary ILIKE $${index + 1} OR challenge_opportunity ILIKE $${index + 1})`
        ).join(' OR ');

        const query = `
            SELECT 
                idea_id as id,
                title,
                summary as description,
                business_group as team,
                challenge_opportunity as category,
                score,
                created_at
            FROM ideas
            WHERE ${conditions}
            ORDER BY score DESC, created_at DESC
            LIMIT $${keywords.length + 1}
        `;

        const params = [...keywords.map(k => `%${k}%`), limit];
        const result = await db.query(query, params);

        return result.rows.map(row => ({
            ...row,
            source: 'keyword',
            tags: []
        }));

    } catch (error) {
        console.error('[KeywordMatcher] Keyword search error:', error.message);
        return [];
    }
}

/**
 * Hybrid search combining keyword matching and semantic similarity
 * @param {Object} contextStats - Document context statistics with themes and keywords
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} db - PostgreSQL database instance
 * @param {string} embeddingProvider - 'gemini', 'grok' or 'llama'
 * @returns {Promise<Array>} Array of matching ideas with relevance scores
 */
export async function findIdeasFromDocumentKeywords(contextStats, chromaClient, db, embeddingProvider = 'gemini') {
    if (!contextStats || (!contextStats.themes?.length && !contextStats.keywords?.length)) {
        console.log('[KeywordMatcher] No themes or keywords available');
        return [];
    }

    try {
        // Import semantic search function
        const { searchSimilarIdeas } = await import('./semanticSearch.js');

        // Combine themes and keywords
        const allKeywords = [
            ...(contextStats.themes || []),
            ...(contextStats.keywords || [])
        ];

        // Use themes as search query for semantic search
        const searchQuery = (contextStats.themes || []).join(' ');
        console.log(`[KeywordMatcher] Hybrid search for: ${searchQuery}`);

        // Perform both searches in parallel
        const [semanticResults, keywordResults] = await Promise.all([
            searchSimilarIdeas(chromaClient, db, searchQuery, embeddingProvider, 10),
            keywordSearch(db, allKeywords, 10)
        ]);

        console.log(`[KeywordMatcher] Found ${semanticResults.length} semantic + ${keywordResults.length} keyword matches`);

        // Merge results, prioritizing semantic matches
        const mergedResults = new Map();

        // Add semantic results first (higher priority)
        semanticResults.forEach(idea => {
            mergedResults.set(idea.id, {
                ...idea,
                matchType: 'semantic',
                matchedKeywords: allKeywords.filter(keyword =>
                    idea.title?.toLowerCase().includes(keyword.toLowerCase()) ||
                    idea.description?.toLowerCase().includes(keyword.toLowerCase())
                )
            });
        });

        // Add keyword results (if not already present)
        keywordResults.forEach(idea => {
            if (!mergedResults.has(idea.id)) {
                mergedResults.set(idea.id, {
                    ...idea,
                    similarity: 0.5, // Default similarity for keyword-only matches
                    matchType: 'keyword',
                    matchedKeywords: allKeywords.filter(keyword =>
                        idea.title?.toLowerCase().includes(keyword.toLowerCase()) ||
                        idea.description?.toLowerCase().includes(keyword.toLowerCase())
                    )
                });
            } else {
                // Boost similarity for ideas found in both searches
                const existing = mergedResults.get(idea.id);
                existing.similarity = Math.min(1, existing.similarity * 1.2);
                existing.matchType = 'hybrid';
            }
        });

        // Convert to array and sort by similarity
        const results = Array.from(mergedResults.values())
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 10); // Limit to top 10

        console.log(`[KeywordMatcher] Returning ${results.length} hybrid search results`);
        return results;

    } catch (error) {
        console.error('[KeywordMatcher] Error in hybrid search:', error.message);
        return [];
    }
}
