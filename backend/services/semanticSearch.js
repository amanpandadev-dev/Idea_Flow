import { getEmbeddingVector } from './embeddingProvider.js';

/**
 * Perform semantic search on idea submissions
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} db - PostgreSQL database instance
 * @param {string} query - Search query
 * @param {string} embeddingProvider - 'gemini', 'grok' or 'llama'
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of similar ideas with metadata
 */
export async function searchSimilarIdeas(chromaClient, db, query, embeddingProvider = 'gemini', limit = 10) {
    try {
        console.log(`[SemanticSearch] Searching for ideas similar to: "${query}"`);

        // Generate embedding for the query
        const queryEmbedding = await getEmbeddingVector(query, embeddingProvider);
        console.log(`[SemanticSearch] Generated query embedding (${queryEmbedding.length} dimensions)`);

        // Get or create ideas collection
        const collection = await chromaClient.getOrCreateCollection({
            name: 'ideas_collection',
            metadata: { description: 'Innovation idea submissions' }
        });

        // Perform vector similarity search
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: limit
        });

        console.log(`[SemanticSearch] Found ${results.ids[0]?.length || 0} similar ideas`);

        if (!results.ids[0] || results.ids[0].length === 0) {
            return [];
        }

        // Extract idea IDs and distances
        const ideaIds = results.ids[0];
        const distances = results.distances[0];
        const metadatas = results.metadatas[0];

        // Fetch full idea details from PostgreSQL
        const ideasWithScores = [];

        for (let i = 0; i < ideaIds.length; i++) {
            const ideaId = ideaIds[i];
            const distance = distances[i];
            const metadata = metadatas[i];

            // Convert distance to similarity score (0-1, higher is better)
            // ChromaDB uses L2 distance, so smaller distance = more similar
            // Typical L2 distance range: 0 (identical) to 2+ (very different)
            // Use exponential decay for better score distribution
            let similarity;
            if (distance === 0) {
                similarity = 1.0;
            } else if (distance < 0.5) {
                similarity = 0.95 - (distance * 0.2);  // 0.95-0.85 for very similar
            } else if (distance < 1.0) {
                similarity = 0.85 - ((distance - 0.5) * 0.4);  // 0.85-0.65 for similar
            } else if (distance < 1.5) {
                similarity = 0.65 - ((distance - 1.0) * 0.3);  // 0.65-0.50 for somewhat similar
            } else {
                similarity = Math.max(0.1, 0.50 - ((distance - 1.5) * 0.2));  // 0.50-0.10 for less similar
            }

            // Ensure similarity is in 0-1 range
            similarity = Math.max(0, Math.min(1, similarity));

            try {
                // Fetch idea from database using correct schema
                // ChromaDB stores idea_id as string, PostgreSQL expects integer
                const numericId = ideaId.toString().replace('IDEA-', '');

                const ideaResult = await db.query(
                    `SELECT 
                        i.idea_id,
                        i.title,
                        i.summary as description,
                        i.challenge_opportunity as category,
                        i.build_phase as status,
                        i.business_group as team,
                        i.code_preference as tags,
                        i.created_at
                    FROM ideas i
                    WHERE i.idea_id = $1`,
                    [numericId]
                );

                if (ideaResult.rows.length > 0) {
                    const idea = ideaResult.rows[0];

                    // Parse tags from comma-separated string to array
                    let tagsArray = [];
                    if (idea.tags && typeof idea.tags === 'string') {
                        tagsArray = idea.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
                    }

                    ideasWithScores.push({
                        id: `IDEA-${idea.idea_id}`,
                        title: idea.title || 'Untitled',
                        description: idea.description || '',
                        team: idea.team || 'Unknown',
                        tags: tagsArray,
                        similarity: parseFloat(similarity.toFixed(3)),
                        createdAt: idea.created_at,
                        category: idea.category || metadata?.category,
                        status: idea.status || metadata?.status || 'Submitted'
                    });
                }
            } catch (dbError) {
                console.error(`[SemanticSearch] Error fetching idea ${ideaId}:`, dbError.message);
            }
        }

        // Sort by similarity score (highest first)
        ideasWithScores.sort((a, b) => b.similarity - a.similarity);

        console.log(`[SemanticSearch] Returning ${ideasWithScores.length} ideas with details`);
        return ideasWithScores;

    } catch (error) {
        console.error('[SemanticSearch] Error performing semantic search:', error.message);
        throw error;
    }
}

/**
 * Index an idea in the vector database with retry logic
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} idea - Idea object with id, title, description
 * @param {string} embeddingProvider - 'gemini', 'grok' or 'llama'
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function indexIdea(chromaClient, idea, embeddingProvider = 'gemini', maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[SemanticSearch] Indexing idea: ${idea.id} (attempt ${attempt}/${maxRetries})`);

            // Create text for embedding (title + description)
            const text = `${idea.title}\n${idea.description}`;

            // Generate embedding with retry
            const embedding = await getEmbeddingVector(text, embeddingProvider);

            // Get or create collection
            const collection = await chromaClient.getOrCreateCollection({
                name: 'ideas_collection',
                metadata: { description: 'Innovation idea submissions' }
            });

            // Add to collection
            await collection.add({
                ids: [idea.id.toString()],
                embeddings: [embedding],
                metadatas: [{
                    title: idea.title,
                    team: idea.team || '',
                    category: idea.category || '',
                    status: idea.status || 'submitted'
                }],
                documents: [text]
            });

            console.log(`[SemanticSearch] Successfully indexed idea: ${idea.id}`);
            return true;

        } catch (error) {
            lastError = error;
            console.error(`[SemanticSearch] Error indexing idea ${idea.id} (attempt ${attempt}/${maxRetries}):`, error.message);

            // Exponential backoff before retry
            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`[SemanticSearch] Retrying in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    // Graceful degradation - log error but don't throw
    console.error(`[SemanticSearch] Failed to index idea ${idea.id} after ${maxRetries} attempts. Continuing without indexing.`);
    return false;
}
