import { indexIdea } from './semanticSearch.js';

/**
 * Index a newly submitted idea in the background
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} idea - Idea object with id, title, description
 * @param {string} embeddingProvider - Embedding provider to use
 */
export async function indexNewIdea(chromaClient, idea, embeddingProvider = 'gemini') {
    // Run indexing in background without blocking the response
    setImmediate(async () => {
        try {
            console.log(`[IdeaIndexing] Starting background indexing for idea ${idea.id}`);
            const success = await indexIdea(chromaClient, idea, embeddingProvider);

            if (success) {
                console.log(`[IdeaIndexing] Successfully indexed idea ${idea.id}`);
            } else {
                console.warn(`[IdeaIndexing] Failed to index idea ${idea.id}, but submission was successful`);
            }
        } catch (error) {
            // Log error but don't throw - indexing failure shouldn't affect idea submission
            console.error(`[IdeaIndexing] Error in background indexing for idea ${idea.id}:`, error.message);
        }
    });
}

/**
 * Ensure ideas_semantic_index exists on system startup
 * @param {Object} chromaClient - ChromaDB client instance
 */
export async function ensureIdeasCollection(chromaClient) {
    try {
        console.log('[IdeaIndexing] Ensuring ideas_semantic_index exists...');

        const collection = await chromaClient.getOrCreateCollection({
            name: 'ideas_semantic_index',
            metadata: { description: 'Innovation idea submissions - Single authoritative collection' }
        });

        console.log('✅ ideas_semantic_index is ready');
        return collection;
    } catch (error) {
        console.error('[IdeaIndexing] Error ensuring ideas_semantic_index:', error.message);
        throw error;
    }
}

/**
 * Batch index multiple ideas
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Array} ideas - Array of idea objects
 * @param {string} embeddingProvider - Embedding provider to use
 * @param {Function} progressCallback - Optional callback for progress updates
 */
export async function batchIndexIdeas(chromaClient, ideas, embeddingProvider = 'gemini', progressCallback = null) {
    console.log(`[IdeaIndexing] Starting batch indexing of ${ideas.length} ideas`);

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < ideas.length; i++) {
        const idea = ideas[i];

        try {
            const success = await indexIdea(chromaClient, idea, embeddingProvider);

            if (success) {
                successCount++;
            } else {
                failureCount++;
            }

            // Progress callback
            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: ideas.length,
                    successCount,
                    failureCount,
                    currentIdea: idea.id
                });
            }

            // Small delay to avoid rate limiting
            if (i < ideas.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

        } catch (error) {
            failureCount++;
            console.error(`[IdeaIndexing] Error indexing idea ${idea.id}:`, error.message);
        }
    }

    console.log(`[IdeaIndexing] Batch indexing complete: ${successCount} successful, ${failureCount} failed`);

    return {
        total: ideas.length,
        successCount,
        failureCount
    };
}

export default {
    indexNewIdea,
    ensureIdeasCollection,
    batchIndexIdeas
};
