/**
 * Advanced Search Engine Module
 * Implements BM25+, Vector Similarity, and Reciprocal Rank Fusion (RRF)
 * for state-of-the-art semantic search capabilities
 */

// --- SCORING ALGORITHMS ---

/**
 * Calculate Cosine Similarity between two vectors
 * Used for semantic similarity between query and document embeddings
 */
export const cosineSimilarity = (vecA, vecB) => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    return magnitude === 0 ? 0 : dot / magnitude;
};

/**
 * BM25+ Scoring Algorithm
 * An improved version of BM25 that handles edge cases better
 * 
 * @param {number} termFreq - Frequency of term in document
 * @param {number} docLength - Length of document
 * @param {number} avgDocLength - Average document length in corpus
 * @param {number} totalDocs - Total number of documents
 * @param {number} docsWithTerm - Number of documents containing the term
 * @param {number} k1 - Term frequency saturation parameter (default: 1.5)
 * @param {number} b - Length normalization parameter (default: 0.75)
 * @param {number} delta - Lower bound for TF normalization (default: 0.5)
 * @returns {number} BM25+ score for the term
 */
export const calculateBM25Plus = (
    termFreq,
    docLength,
    avgDocLength,
    totalDocs,
    docsWithTerm,
    k1 = 1.5,
    b = 0.75,
    delta = 0.5
) => {
    // IDF (Inverse Document Frequency) with BM25+ smoothing
    const idf = Math.log((totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);

    // Length normalization
    const lengthNorm = 1 - b + b * (docLength / avgDocLength);

    // BM25+ formula with delta parameter
    const tfComponent = ((k1 + 1) * termFreq) / (k1 * lengthNorm + termFreq);
    const bm25Plus = idf * (tfComponent + delta);

    return Math.max(0, bm25Plus);
};

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines multiple ranked lists into a single unified ranking
 * 
 * @param {Array<Array<{id: string, score: number}>>} rankedLists - Multiple ranked result lists
 * @param {number} k - RRF constant (default: 60, standard value)
 * @returns {Map<string, number>} Map of document IDs to RRF scores
 */
export const reciprocalRankFusion = (rankedLists, k = 60) => {
    const scores = new Map();

    rankedLists.forEach(rankedList => {
        rankedList.forEach((item, index) => {
            const rank = index + 1;
            const rrfScore = 1 / (k + rank);

            const currentScore = scores.get(item.id) || 0;
            scores.set(item.id, currentScore + rrfScore);
        });
    });

    return scores;
};

/**
 * Normalize scores to 0-1 range using min-max normalization
 * 
 * @param {Map<string, number>} scores - Map of IDs to scores
 * @returns {Map<string, number>} Normalized scores
 */
export const normalizeScores = (scores) => {
    const values = Array.from(scores.values());
    if (values.length === 0) return scores;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range === 0) {
        // All scores are the same, return uniform distribution
        const normalized = new Map();
        scores.forEach((score, id) => normalized.set(id, 0.5));
        return normalized;
    }

    const normalized = new Map();
    scores.forEach((score, id) => {
        normalized.set(id, (score - min) / range);
    });

    return normalized;
};

/**
 * Calculate BM25+ scores for all documents given a query
 * 
 * @param {Array<string>} queryTerms - Tokenized query terms
 * @param {Array<Object>} documents - Array of document objects with text content
 * @param {Function} getDocText - Function to extract text from document
 * @returns {Map<string, number>} Map of document IDs to BM25+ scores
 */
export const calculateBM25Scores = (queryTerms, documents, getDocText) => {
    const bm25Scores = new Map();

    // Calculate corpus statistics
    const totalDocs = documents.length;
    const docLengths = documents.map(doc => getDocText(doc).length);
    const avgDocLength = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;

    documents.forEach((doc, docIndex) => {
        const docText = getDocText(doc).toLowerCase();
        const docLength = docLengths[docIndex];
        let totalBM25 = 0;

        // Calculate BM25+ for each query term
        queryTerms.forEach(term => {
            // Count term frequency in document
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            const matches = docText.match(regex);
            const termFreq = matches ? matches.length : 0;

            if (termFreq > 0) {
                // Count documents containing this term
                const docsWithTerm = documents.filter(d => {
                    const text = getDocText(d).toLowerCase();
                    return text.includes(term);
                }).length;

                // Calculate BM25+ for this term
                const termScore = calculateBM25Plus(
                    termFreq,
                    docLength,
                    avgDocLength,
                    totalDocs,
                    docsWithTerm
                );

                totalBM25 += termScore;
            }
        });

        bm25Scores.set(doc.idea_id, totalBM25);
    });

    return bm25Scores;
};

/**
 * Calculate vector similarity scores for all documents
 * 
 * @param {Array<number>} queryEmbedding - Query embedding vector
 * @param {Array<Object>} documents - Array of document objects
 * @param {Function} getEmbedding - Async function to get document embedding
 * @returns {Promise<Map<string, number>>} Map of document IDs to similarity scores
 */
export const calculateVectorScores = async (queryEmbedding, documents, getEmbedding) => {
    const vectorScores = new Map();

    await Promise.all(documents.map(async (doc) => {
        const docEmbedding = await getEmbedding(doc);

        let similarity = 0;
        if (docEmbedding && docEmbedding.length > 0) {
            similarity = cosineSimilarity(queryEmbedding, docEmbedding);
        }

        vectorScores.set(doc.idea_id, similarity);
    }));

    return vectorScores;
};

/**
 * Hybrid Search Engine
 * Combines BM25+, Vector Similarity, and RRF for optimal results
 * 
 * @param {Object} config - Search configuration
 * @param {Array<string>} config.queryTerms - Tokenized query terms
 * @param {Array<number>} config.queryEmbedding - Query embedding vector
 * @param {Array<Object>} config.documents - Documents to search
 * @param {Function} config.getDocText - Function to extract text from document
 * @param {Function} config.getEmbedding - Async function to get document embedding
 * @param {Object} config.weights - Scoring weights (optional)
 * @returns {Promise<Array<Object>>} Ranked and scored documents
 */
export const hybridSearch = async ({
    queryTerms,
    queryEmbedding,
    documents,
    getDocText,
    getEmbedding,
    weights = { bm25: 0.30, vector: 0.50, rrf: 0.20 }
}) => {
    console.log(`[HybridSearch] Processing ${documents.length} documents`);
    console.log(`[HybridSearch] Weights - BM25: ${weights.bm25}, Vector: ${weights.vector}, RRF: ${weights.rrf}`);

    // STEP 1: Calculate BM25+ Scores
    console.log("[HybridSearch] Calculating BM25+ scores...");
    const bm25Scores = calculateBM25Scores(queryTerms, documents, getDocText);

    // STEP 2: Calculate Vector Similarity Scores
    console.log("[HybridSearch] Calculating vector similarity scores...");
    const vectorScores = await calculateVectorScores(queryEmbedding, documents, getEmbedding);

    // STEP 3: Create Ranked Lists for RRF
    console.log("[HybridSearch] Applying Reciprocal Rank Fusion...");

    // Rank by BM25+
    const bm25Ranked = documents
        .map(doc => ({ id: doc.idea_id, score: bm25Scores.get(doc.idea_id) || 0, doc }))
        .sort((a, b) => b.score - a.score);

    // Rank by Vector Similarity
    const vectorRanked = documents
        .map(doc => ({ id: doc.idea_id, score: vectorScores.get(doc.idea_id) || 0, doc }))
        .sort((a, b) => b.score - a.score);

    // Apply RRF
    const rrfScores = reciprocalRankFusion([bm25Ranked, vectorRanked], 60);

    // STEP 4: Normalize All Scores
    const normalizedBM25 = normalizeScores(bm25Scores);
    const normalizedVector = normalizeScores(vectorScores);
    const normalizedRRF = normalizeScores(rrfScores);

    // STEP 5: Weighted Combination
    console.log("[HybridSearch] Computing final weighted scores...");

    const scoredDocuments = documents.map(doc => {
        const bm25 = normalizedBM25.get(doc.idea_id) || 0;
        const vector = normalizedVector.get(doc.idea_id) || 0;
        const rrf = normalizedRRF.get(doc.idea_id) || 0;

        // Weighted combination
        const compositeScore = (bm25 * weights.bm25) + (vector * weights.vector) + (rrf * weights.rrf);

        // Convert to 0-100 scale
        const matchScore = Math.min(Math.round(compositeScore * 100), 100);

        return {
            ...doc,
            matchScore: Math.max(matchScore, 0),
            bm25Score: Math.round(bm25 * 100),
            vectorScore: Math.round(vector * 100),
            rrfScore: Math.round(rrf * 100),
            // Individual component scores for debugging/analysis
            _debug: {
                bm25Raw: bm25Scores.get(doc.idea_id) || 0,
                vectorRaw: vectorScores.get(doc.idea_id) || 0,
                rrfRaw: rrfScores.get(doc.idea_id) || 0
            }
        };
    });

    // STEP 6: Sort by Final Score
    const rankedResults = scoredDocuments.sort((a, b) => b.matchScore - a.matchScore);

    console.log(`[HybridSearch] ✅ Ranked ${rankedResults.length} results`);

    return rankedResults;
};

/**
 * Extract and tokenize query terms
 * 
 * @param {string} query - Raw query string
 * @returns {Array<string>} Tokenized terms
 */
export const tokenizeQuery = (query) => {
    return query
        .toLowerCase()
        .replace(/[^\w\s]/gi, '')
        .split(/\s+/)
        .filter(term => term.length > 2); // Filter out very short terms
};

/**
 * Default configuration for hybrid search
 */
export const DEFAULT_SEARCH_CONFIG = {
    weights: {
        bm25: 0.30,    // 30% - Keyword relevance
        vector: 0.50,  // 50% - Semantic similarity
        rrf: 0.20      // 20% - Rank fusion consensus
    },
    bm25Params: {
        k1: 1.5,       // Term frequency saturation
        b: 0.75,       // Length normalization
        delta: 0.5     // Lower bound for TF
    },
    rrfK: 60         // RRF constant
};

export default {
    cosineSimilarity,
    calculateBM25Plus,
    reciprocalRankFusion,
    normalizeScores,
    calculateBM25Scores,
    calculateVectorScores,
    hybridSearch,
    tokenizeQuery,
    DEFAULT_SEARCH_CONFIG
};
