import { getEmbeddingVector } from './embeddingProvider.js';

/**
 * Perform semantic search on idea submissions
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} db - PostgreSQL database instance
 * @param {string} query - Search query
 * @param {string} embeddingProvider - 'grok' or 'llama'
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of similar ideas with metadata
 */
export async function searchSimilarIdeas(chromaClient, db, query, embeddingProvider = 'grok', limit = 10) {
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
            const similarity = 1 / (1 + distance);

            try {
                // Fetch idea from database
                const ideaResult = await db.query(
                    'SELECT id, title, description, team, tags, created_at FROM ideas WHERE id = $1',
                    [ideaId]
                );

                if (ideaResult.rows.length > 0) {
                    const idea = ideaResult.rows[0];
                    ideasWithScores.push({
                        id: idea.id,
                        title: idea.title,
                        description: idea.description,
                        team: idea.team,
                        tags: idea.tags || [],
                        similarity: parseFloat(similarity.toFixed(3)),
                        createdAt: idea.created_at,
                        // Include metadata if available
                        category: metadata?.category,
                        status: metadata?.status
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
 * Index an idea in the vector database
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} idea - Idea object with id, title, description
 * @param {string} embeddingProvider - 'grok' or 'llama'
 */
export async function indexIdea(chromaClient, idea, embeddingProvider = 'grok') {
    try {
        console.log(`[SemanticSearch] Indexing idea: ${idea.id}`);

        // Create text for embedding (title + description)
        const text = `${idea.title}\n${idea.description}`;

        // Generate embedding
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
    } catch (error) {
        console.error(`[SemanticSearch] Error indexing idea ${idea.id}:`, error.message);
        throw error;
    }
}
