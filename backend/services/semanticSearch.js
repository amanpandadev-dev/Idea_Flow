import { getEmbeddingVector } from './embeddingProvider.js';
import { getAllDocumentEmbeddings } from './vectorStoreService.js';

/**
 * Perform semantic search on idea submissions
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} db - PostgreSQL database instance
 * @param {string} query - Search query
 * @param {string} embeddingProvider - 'gemini', 'grok' or 'llama'
 * @param {number} candidateLimit - Maximum candidates to fetch (default 300)
 * @param {number} minSimilarity - Minimum similarity threshold (default 0.3)
 * @returns {Promise<Array>} Array of similar ideas with metadata
 */
export async function searchSimilarIdeas(chromaClient, db, query, embeddingProvider = 'gemini', candidateLimit = 300, minSimilarity = 0.3) {
    try {
        console.log(`[SemanticSearch] Searching for ideas similar to: "${query}" (threshold: ${minSimilarity})`);

        // Generate embedding for the query
        const queryEmbedding = await getEmbeddingVector(query, embeddingProvider);
        console.log(`[SemanticSearch] Generated query embedding (${queryEmbedding.length} dimensions)`);

        // Get or create ideas collection
        const collection = await chromaClient.getOrCreateCollection({
            name: 'ideas_semantic_index',
            metadata: { description: 'Innovation idea submissions - Single authoritative collection' }
        });

        // Perform vector similarity search with large candidate pool
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: candidateLimit // Fetch more candidates, filter by threshold later
        });

        console.log(`[SemanticSearch] Found ${results.ids[0]?.length || 0} candidate ideas`);

        if (!results.ids[0] || results.ids[0].length === 0) {
            return [];
        }

        // Extract unique idea IDs from results and normalize them
        // ChromaDB stores as "idea_123" but PostgreSQL expects integer 123
        const ideaIds = [...new Set(results.ids[0])].map(id => {
            // Strip "idea_" prefix if present
            return id.toString().replace(/^idea_/, '');
        });

        console.log(`[SemanticSearch] Found ${ideaIds.length} candidate ideas`);

        // Fetch full idea details from PostgreSQL
        if (ideaIds.length === 0) {
            return [];
        }

        const placeholders = ideaIds.map((_, i) => `$${i + 1}`).join(',');
        const dbQuery = `
            SELECT idea_id, title, summary as description, theme as category, build_phase as status, 
                   business_group as team, code_preference as tags, created_at
            FROM ideas
            WHERE idea_id IN (${placeholders})
        `;

        const dbResult = await db.query(dbQuery, ideaIds);
        const ideasFromDb = new Map(dbResult.rows.map(row => [row.idea_id.toString(), row]));

        const ideasWithScores = [];
        const distances = results.distances[0];
        const metadatas = results.metadatas[0];

        for (let i = 0; i < results.ids[0].length; i++) {
            const chromaIdeaId = results.ids[0][i];
            const normalizedIdeaId = chromaIdeaId.toString().replace(/^idea_/, '');
            const distance = distances[i];
            const metadata = metadatas[i];

            // Convert distance to similarity (1 - distance for cosine)
            // Apply non-linear scaling for better discrimination
            let similarity;
            if (distance < 0.5) {
                similarity = 0.95 - (distance * 0.2);
            } else if (distance < 1.0) {
                similarity = 0.85 - ((distance - 0.5) * 0.4);
            } else if (distance < 1.5) {
                similarity = 0.65 - ((distance - 1.0) * 0.3);
            } else {
                similarity = Math.max(0.1, 0.50 - ((distance - 1.5) * 0.2));
            }

            // Ensure similarity is in 0-1 range
            similarity = Math.max(0, Math.min(1, similarity));

            // Filter by minimum similarity threshold
            if (similarity < minSimilarity) {
                continue; // Skip ideas below threshold
            }

            // Check if this idea is already in our map
            const ideaData = ideasFromDb.get(normalizedIdeaId);

            if (ideaData) {
                // Parse tags from comma-separated string to array
                let tagsArray = [];
                if (ideaData.tags && typeof ideaData.tags === 'string') {
                    tagsArray = ideaData.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
                }

                ideasWithScores.push({
                    id: `IDEA-${ideaData.idea_id}`,
                    title: ideaData.title || 'Untitled',
                    description: ideaData.description || '',
                    team: ideaData.team || 'Unknown',
                    tags: tagsArray,
                    similarity: parseFloat(similarity.toFixed(3)),
                    createdAt: ideaData.created_at,
                    category: ideaData.category || metadata?.category,
                    status: ideaData.status || metadata?.status || 'Submitted'
                });
            }
        }

        // Sort by similarity score (highest first)
        ideasWithScores.sort((a, b) => b.similarity - a.similarity);

        console.log(`[SemanticSearch] Returning ${ideasWithScores.length} ideas above threshold ${minSimilarity}`);
        return ideasWithScores;

    } catch (error) {
        console.error('[SemanticSearch] Error performing semantic search:', error.message);
        throw error;
    }
}

/**
 * Context-aware semantic search using uploaded document chunks
 * Performs multi-vector similarity search using all chunk embeddings
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} db - PostgreSQL database instance
 * @param {string} userId - User ID for fetching document context
 * @param {string} embeddingProvider - 'gemini', 'grok' or 'llama'
 * @param {number} minSimilarity - Minimum similarity threshold (default 0.35)
 * @returns {Promise<Array>} Array of context-relevant ideas with aggregated scores
 */
export async function searchSimilarIdeasWithContext(chromaClient, db, userId, embeddingProvider = 'llama', minSimilarity = 0.35) {
    try {
        console.log(`[SemanticSearch] Context-aware search for user ${userId} (threshold: ${minSimilarity})`);

        // Get all document chunk embeddings from user collection
        const collectionId = `user_${userId}`;
        const documentChunks = await getAllDocumentEmbeddings(collectionId);

        if (!documentChunks || documentChunks.length === 0) {
            console.log(`[SemanticSearch] No document context found for user ${userId}, falling back to empty results`);
            return [];
        }

        console.log(`[SemanticSearch] Using ${documentChunks.length} document chunks for multi-vector search`);

        // Get ideas collection
        const collection = await chromaClient.getOrCreateCollection({
            name: 'ideas_semantic_index',
            metadata: { description: 'Innovation idea submissions - Single authoritative collection' }
        });

        // Track aggregated scores per idea (using max similarity)
        const ideaScores = new Map(); // ideaId -> {maxSimilarity, distance, metadata}

        // Perform multi-vector query - query with each chunk embedding
        for (let chunkIndex = 0; chunkIndex < documentChunks.length; chunkIndex++) {
            const chunk = documentChunks[chunkIndex];

            try {
                // Query ideas using this chunk's embedding
                const results = await collection.query({
                    queryEmbeddings: [chunk.embedding],
                    nResults: 100 // Get top 100 per chunk
                });

                if (results.ids[0] && results.ids[0].length > 0) {
                    const ideaIds = results.ids[0];
                    const distances = results.distances[0];
                    const metadatas = results.metadatas[0];

                    for (let i = 0; i < ideaIds.length; i++) {
                        const ideaId = ideaIds[i];
                        const distance = distances[i];
                        const metadata = metadatas[i];

                        // Convert distance to similarity
                        let similarity;
                        if (distance === 0) {
                            similarity = 1.0;
                        } else if (distance < 0.5) {
                            similarity = 0.95 - (distance * 0.2);
                        } else if (distance < 1.0) {
                            similarity = 0.85 - ((distance - 0.5) * 0.4);
                        } else if (distance < 1.5) {
                            similarity = 0.65 - ((distance - 1.0) * 0.3);
                        } else {
                            similarity = Math.max(0.1, 0.50 - ((distance - 1.5) * 0.2));
                        }
                        similarity = Math.max(0, Math.min(1, similarity));

                        // Aggregate using MAX similarity (best match across all chunks)
                        if (!ideaScores.has(ideaId) || similarity > ideaScores.get(ideaId).maxSimilarity) {
                            ideaScores.set(ideaId, {
                                maxSimilarity: similarity,
                                distance,
                                metadata
                            });
                        }
                    }
                }
            } catch (queryError) {
                console.error(`[SemanticSearch] Error querying with chunk ${chunkIndex}:`, queryError.message);
            }
        }

        console.log(`[SemanticSearch] Aggregated results from ${ideaScores.size} unique ideas`);

        // Filter by similarity threshold and fetch full details
        // Get final list of unique idea IDs sorted by max similarity
        const finalIdeaIds = Array.from(ideaScores.entries())
            .filter(([, scoreData]) => scoreData.maxSimilarity >= minSimilarity)
            .sort((a, b) => b[1].maxSimilarity - a[1].maxSimilarity)
            .map(([id,]) => id);

        console.log(`[SemanticSearch] Aggregated results from ${finalIdeaIds.length} unique ideas`);

        // Fetch idea details from PostgreSQL (batch query for efficiency)
        const ideasWithScores = [];

        if (finalIdeaIds.length > 0) {
            // Normalize IDs: strip "idea_" prefix for PostgreSQL
            const normalizedIds = finalIdeaIds.map(id => id.toString().replace(/^idea_/, ''));

            const placeholders = normalizedIds.map((_, i) => `$${i + 1}`).join(',');
            const dbQuery = `
                SELECT idea_id, title, summary as description, theme as category, build_phase as status,
                       business_group as team, code_preference as tags, created_at
                FROM ideas
                WHERE idea_id IN (${placeholders})
            `;

            try {
                const dbResult = await db.query(dbQuery, normalizedIds);
                const ideasFromDb = new Map(dbResult.rows.map(row => [row.idea_id.toString(), row]));

                // Match ideas with their scores
                for (const chromaIdeaId of finalIdeaIds) {
                    const normalizedId = chromaIdeaId.toString().replace(/^idea_/, '');
                    const ideaData = ideasFromDb.get(normalizedId);

                    if (ideaData) {
                        const score = ideaScores.get(chromaIdeaId);

                        // Parse tags from comma-separated string to array
                        let tagsArray = [];
                        if (ideaData.tags && typeof ideaData.tags === 'string') {
                            tagsArray = ideaData.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
                        }

                        ideasWithScores.push({
                            id: `IDEA-${ideaData.idea_id}`, // Re-add IDEA- prefix for consistency with other search
                            title: ideaData.title || 'Untitled',
                            description: ideaData.description || '',
                            team: ideaData.team || 'Unknown',
                            tags: tagsArray,
                            similarity: parseFloat(score.maxSimilarity.toFixed(3)),
                            createdAt: ideaData.created_at,
                            category: ideaData.category || score.metadata?.category,
                            status: ideaData.status || score.metadata?.status || 'Submitted'
                        });
                    }
                }
            } catch (dbError) {
                console.error('[SemanticSearch] Database query error:', dbError.message);
            }
        }

        // Sort by similarity score (highest first)
        ideasWithScores.sort((a, b) => b.similarity - a.similarity);

        console.log(`[SemanticSearch] Returning ${ideasWithScores.length} context-relevant ideas`);
        return ideasWithScores;

    } catch (error) {
        console.error('[SemanticSearch] Error in context-aware search:', error.message);
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
                name: 'ideas_semantic_index',
                metadata: { description: 'Innovation idea submissions - Single authoritative collection' }
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
