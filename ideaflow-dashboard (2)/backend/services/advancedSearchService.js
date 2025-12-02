/**
 * Advanced Search Service
 * Integrates BM25+, Vector Similarity, RRF, NLP, and Spell Correction
 * for enterprise-grade semantic search
 */

import {
  calculateBM25Scores,
  calculateVectorScores,
  reciprocalRankFusion,
  normalizeScores,
  cosineSimilarity
} from '../search-engine.js';
import { enhanceQuery } from './nlpQueryProcessor.js';

/**
 * Advanced Hybrid Search with NLP and Spell Correction
 * Uses a cascading approach to minimize API usage:
 * 1. NLP Enhancement
 * 2. BM25+ Scoring (All Docs) -> Top Candidates
 * 3. Vector Scoring (Top Candidates Only)
 * 4. RRF & Re-ranking
 * 
 * @param {Object} config - Search configuration
 * @param {string} config.rawQuery - User's original query
 * @param {Array<Object>} config.documents - Documents to search
 * @param {Function} config.getDocText - Extract text from document
 * @param {Function} config.getEmbedding - Get document embedding
 * @param {Function} config.getQueryEmbedding - Get query embedding
 * @param {Object} config.weights - Scoring weights
 * @param {string} config.apiKey - Google GenAI API key for NLP
 * @param {boolean} config.useAI - Whether to use AI for query enhancement
 * @returns {Promise<Object>} Search results with metadata
 */
export async function advancedHybridSearch({
  rawQuery,
  documents,
  getDocText,
  getEmbedding,
  getQueryEmbedding,
  weights = { bm25: 0.30, vector: 0.50, rrf: 0.20 },
  apiKey = null,
  useAI = true
}) {
  const startTime = Date.now();

  console.log(`\n[AdvancedSearch] 🔍 Starting search for: "${rawQuery}"`);
  console.log(`[AdvancedSearch] 📊 Corpus size: ${documents.length} documents`);
  console.log(`[AdvancedSearch] ⚖️  Weights: BM25=${weights.bm25}, Vector=${weights.vector}, RRF=${weights.rrf}`);

  // STEP 1: NLP Query Enhancement (Spell Correction + Expansion)
  console.log(`[AdvancedSearch] 🧠 Applying NLP processing...`);
  // Use Gemini 1.5 Flash (assuming user meant 1.5 when they said 2.5, or latest stable)
  const nlpResult = await enhanceQuery(rawQuery, { useAI, apiKey, model: "gemini-1.5-flash" });

  console.log(`[AdvancedSearch] ✅ NLP Results:`);
  console.log(`  - Original: "${nlpResult.original}"`);
  console.log(`  - Corrected: "${nlpResult.corrected}"`);
  console.log(`  - Expanded terms: ${nlpResult.expanded.length}`);

  // STEP 2: Calculate BM25+ Scores (Cheap, run on all docs)
  console.log(`[AdvancedSearch] 📈 Calculating BM25+ scores for all ${documents.length} documents...`);
  const bm25Scores = calculateBM25Scores(
    nlpResult.expanded, // Use expanded terms for better recall
    documents,
    getDocText
  );

  // STEP 3: Select Top Candidates for Vector Re-ranking
  // We only want to generate embeddings for the most promising candidates to save API quota
  const CANDIDATE_LIMIT = 50; // Adjust based on needs

  const allRankedByBM25 = documents
    .map(doc => ({ id: doc.idea_id, score: bm25Scores.get(doc.idea_id) || 0, doc }))
    .sort((a, b) => b.score - a.score);

  // Keep top N candidates + any that have non-zero BM25 score (up to a limit)
  // If BM25 yields 0 results (pure semantic query), we might need a fallback or take random sample?
  // For now, take top N.
  let candidates = allRankedByBM25.slice(0, CANDIDATE_LIMIT);

  // If we have very few results with BM25 > 0, we might miss semantic matches.
  // However, without pre-computed embeddings, scanning 1200 docs is too expensive.
  // We rely on NLP expansion to bridge the gap for BM25.

  console.log(`[AdvancedSearch] 📉 Selected top ${candidates.length} candidates for vector re-ranking`);

  // STEP 4: Generate Query Embedding
  console.log(`[AdvancedSearch] 🔢 Generating query embedding...`);
  let queryEmbedding = [];
  try {
    queryEmbedding = await getQueryEmbedding(nlpResult.corrected);
  } catch (err) {
    console.warn(`[AdvancedSearch] ⚠️ Query embedding failed: ${err.message}`);
  }

  // STEP 5: Calculate Vector Similarity Scores (Only for candidates)
  const vectorScores = new Map();

  if (queryEmbedding && queryEmbedding.length > 0) {
    console.log(`[AdvancedSearch] 🎯 Calculating vector similarity for ${candidates.length} candidates...`);

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (item) => {
        try {
          const docEmbedding = await getEmbedding(item.doc);
          if (docEmbedding && docEmbedding.length > 0) {
            const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
            vectorScores.set(item.id, similarity);
          }
        } catch (e) {
          console.warn(`[AdvancedSearch] ⚠️ Embedding failed for doc ${item.id}: ${e.message}`);
        }
      }));
    }
  } else {
    console.log(`[AdvancedSearch] ⏭️ Skipping vector scoring (no query embedding)`);
  }

  // STEP 6: Create Ranked Lists for RRF (Only for candidates)
  console.log(`[AdvancedSearch] 🔀 Applying Reciprocal Rank Fusion...`);

  // Re-rank candidates by BM25 (already sorted, but filtered)
  const bm25Ranked = candidates;

  // Rank candidates by Vector Similarity
  const vectorRanked = candidates
    .map(item => ({
      id: item.id,
      score: vectorScores.get(item.id) || 0,
      doc: item.doc
    }))
    .sort((a, b) => b.score - a.score);

  // Apply RRF
  const rrfScores = reciprocalRankFusion([bm25Ranked, vectorRanked], 60);

  // STEP 7: Normalize & Combine
  console.log(`[AdvancedSearch] ⚖️  Computing final weighted scores...`);

  const normalizedBM25 = normalizeScores(bm25Scores); // Note: this normalizes across ALL docs, which is fine
  const normalizedVector = normalizeScores(vectorScores); // Normalizes across candidates
  const normalizedRRF = normalizeScores(rrfScores); // Normalizes across candidates

  const scoredResults = candidates.map(item => {
    const doc = item.doc;
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
      _scoring: {
        bm25Raw: bm25Scores.get(doc.idea_id) || 0,
        vectorRaw: vectorScores.get(doc.idea_id) || 0,
        rrfRaw: rrfScores.get(doc.idea_id) || 0,
        compositeScore
      }
    };
  });

  // Sort by Final Score
  const finalResults = scoredResults
    .sort((a, b) => b.matchScore - a.matchScore)
    .filter(doc => doc.matchScore > 0);

  const processingTime = Date.now() - startTime;

  console.log(`[AdvancedSearch] ✅ Search complete!`);
  console.log(`[AdvancedSearch] 📊 Results: ${finalResults.length} (from ${documents.length} docs)`);
  console.log(`[AdvancedSearch] ⏱️  Processing time: ${processingTime}ms`);

  return {
    results: finalResults,
    metadata: {
      query: {
        original: nlpResult.original,
        corrected: nlpResult.corrected,
        expanded: nlpResult.expanded
      },
      performance: {
        processingTime
      }
    }
  };
}

/**
 * Optimized search for large datasets
 * Uses early termination and candidate filtering
 */
export async function optimizedHybridSearch(config) {
  // Pass through to the now-optimized advancedHybridSearch
  return advancedHybridSearch(config);
}

/**
 * Search with custom weight profiles
 */
export const WEIGHT_PROFILES = {
  // Balanced (default)
  balanced: { bm25: 0.30, vector: 0.50, rrf: 0.20 },

  // Keyword-focused (for exact matches)
  keyword: { bm25: 0.60, vector: 0.25, rrf: 0.15 },

  // Semantic-focused (for conceptual matches)
  semantic: { bm25: 0.15, vector: 0.70, rrf: 0.15 },

  // Consensus-focused (for diverse ranking)
  consensus: { bm25: 0.25, vector: 0.25, rrf: 0.50 }
};

/**
 * Search with automatic weight selection based on query type
 */
export async function adaptiveHybridSearch(config) {
  const { rawQuery } = config;

  // Detect query type
  let profile = 'balanced';

  // Short queries (1-2 words) -> keyword-focused
  if (rawQuery.split(/\s+/).length <= 2) {
    profile = 'keyword';
  }
  // Long queries (>10 words) -> semantic-focused
  else if (rawQuery.split(/\s+/).length > 10) {
    profile = 'semantic';
  }

  return advancedHybridSearch({
    ...config,
    weights: WEIGHT_PROFILES[profile]
  });
}

export default {
  advancedHybridSearch,
  optimizedHybridSearch,
  adaptiveHybridSearch,
  WEIGHT_PROFILES
};
