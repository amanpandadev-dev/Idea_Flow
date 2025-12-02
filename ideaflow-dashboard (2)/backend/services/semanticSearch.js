import { getEmbeddingVector } from './embeddingProvider.js';
import { mapDBToFrontend } from '../utils/mappers.js';

/**
 * Perform hybrid semantic search (Vector + BM25)
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} db - PostgreSQL pool
 * @param {string} query - Search query
 * @param {string} embeddingProvider - 'llama' or 'grok'
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @param {boolean} useDocumentContext - Whether to use document context (not implemented yet)
 * @param {string} sessionId - Session ID (not used yet)
 */
export async function searchSimilarIdeas(chromaClient, db, query, embeddingProvider, limit = 10, offset = 0, useDocumentContext = false, sessionId = null) {
    try {
        console.log(`[HybridSearch] Query: "${query}", Provider: ${embeddingProvider}, Limit: ${limit}, Offset: ${offset}`);

        const fetchLimit = limit + offset;

        // 1. Vector Search
        const vectorResults = await performVectorSearch(chromaClient, query, embeddingProvider, fetchLimit * 2);

        // 2. Keyword Search (BM25)
        const bm25Results = await performBM25Search(db, query, fetchLimit * 2);

        // 3. Reciprocal Rank Fusion
        const fusedResults = fuseResults(vectorResults, bm25Results, fetchLimit);

        // 4. Pagination
        const paginatedResults = fusedResults.slice(offset, offset + limit);

        // 5. Fetch full details from DB
        const finalResults = await fetchAndFormatResults(db, paginatedResults);

        console.log(`[HybridSearch] Returning ${finalResults.length} fused results`);
        return finalResults;

    } catch (error) {
        console.error('[HybridSearch] Error:', error.message);
        throw error;
    }
}

async function performVectorSearch(chromaClient, query, embeddingProvider, limit) {
    const queryEmbedding = await getEmbeddingVector(query, embeddingProvider);
    const COLLECTION_NAME = 'ideas_collection';

    if (!chromaClient.hasCollection(COLLECTION_NAME)) {
        return [];
    }

    const results = chromaClient.query(COLLECTION_NAME, queryEmbedding, limit);

    if (!results.ids || results.ids.length === 0) return [];

    const vectorItems = [];
    const distances = results.distances;
    const metadatas = results.metadatas;

    for (let i = 0; i < distances.length; i++) {
        const id = metadatas[i]?.id;
        if (!id) continue;

        // Normalize distance to 0-1 score (1 = exact match)
        // Assuming L2 distance, smaller is better. 
        // 1 / (1 + distance) maps [0, inf) to [1, 0)
        const score = 1 / (1 + distances[i]);
        vectorItems.push({ id, score });
    }
    return vectorItems;
}

async function performBM25Search(db, query, limit) {
    try {
        // Simple text processing for tsquery
        const formattedQuery = query.trim().split(/\s+/).join(' & ');

        const sql = `
            SELECT idea_id, 
                   ts_rank(to_tsvector('english', title || ' ' || COALESCE(summary, '') || ' ' || COALESCE(challenge_opportunity, '')), to_tsquery('english', $1)) as score
            FROM ideas
            WHERE to_tsvector('english', title || ' ' || COALESCE(summary, '') || ' ' || COALESCE(challenge_opportunity, '')) @@ to_tsquery('english', $1)
            ORDER BY score DESC
            LIMIT $2
        `;

        const result = await db.query(sql, [formattedQuery, limit]);
        return result.rows.map(row => ({ id: row.idea_id, score: row.score }));
    } catch (err) {
        console.warn('[HybridSearch] BM25 search failed (likely syntax), returning empty:', err.message);
        return [];
    }
}

function fuseResults(vectorResults, bm25Results, limit) {
    const scores = new Map();
    const k = 60; // RRF constant

    // Process Vector Results
    vectorResults.forEach((item, rank) => {
        const current = scores.get(item.id) || { id: item.id, vectorScore: 0, bm25Score: 0, rrfScore: 0 };
        current.vectorScore = item.score;
        current.rrfScore += 1 / (k + rank + 1);
        scores.set(item.id, current);
    });

    // Process BM25 Results
    bm25Results.forEach((item, rank) => {
        const current = scores.get(item.id) || { id: item.id, vectorScore: 0, bm25Score: 0, rrfScore: 0 };
        current.bm25Score = item.score;
        current.rrfScore += 1 / (k + rank + 1);
        scores.set(item.id, current);
    });

    // Convert to array and sort by RRF score
    return Array.from(scores.values())
        .sort((a, b) => b.rrfScore - a.rrfScore)
        .slice(0, limit);
}

async function fetchAndFormatResults(db, fusedResults) {
    if (fusedResults.length === 0) return [];

    const ids = fusedResults.map(r => r.id);

    // Ensure ids are integers (if they are stored as such in DB)

    const query = `
      SELECT DISTINCT ON (i.idea_id)
        i.score as idea_score, 
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        a.location,
        (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
      WHERE i.idea_id = ANY($1)
    `;

    const result = await db.query(query, [ids]);

    const dbRows = result.rows;
    const dbMap = new Map(dbRows.map(row => [row.idea_id, row]));

    const finalResults = [];
    for (const item of fusedResults) {
        const row = dbMap.get(Number(item.id));

        if (row) {
            const mapped = mapDBToFrontend(row);
            // Attach search scores
            mapped.similarity = item.rrfScore;
            mapped.vectorScore = item.vectorScore;
            mapped.bm25Score = item.bm25Score;
            finalResults.push(mapped);
        }
    }

    return finalResults;
}

/**
 * Index an idea into ChromaDB
 */
export async function indexIdea(chromaClient, idea, embeddingProvider = 'grok') {
    try {
        console.log(`[SemanticSearch] Indexing idea: ${idea.id}`);

        // Create text for embedding (title + description)
        const text = `${idea.title}\n${idea.description}`;

        // Generate embedding
        const embedding = await getEmbeddingVector(text, embeddingProvider);

        const COLLECTION_NAME = 'ideas_collection';

        // Get or create collection
        if (!chromaClient.hasCollection(COLLECTION_NAME)) {
            chromaClient.createCollection(COLLECTION_NAME);
        }

        // Normalize ID to integer if possible
        const numericId = String(idea.id).replace('IDEA-', '');
        const id = parseInt(numericId, 10);

        // Add to collection
        chromaClient.addDocuments(
            COLLECTION_NAME,
            [text],
            [embedding],
            [{
                id: id, // Store idea_id here
                title: idea.title,
                team: idea.team || '',
                category: idea.category || '',
                status: idea.status || 'submitted'
            }]
        );

        console.log(`[SemanticSearch] Successfully indexed idea: ${idea.id}`);
    } catch (error) {
        console.error(`[SemanticSearch] Error indexing idea ${idea.id}:`, error.message);
        throw error;
    }
}
