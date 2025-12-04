/**
 * Advanced Search Routes
 * Provides enterprise-grade search with NLP, spell correction, and hybrid ranking
 */

import express from 'express';
import {
  advancedHybridSearch,
  optimizedHybridSearch,
  adaptiveHybridSearch,
  WEIGHT_PROFILES
} from '../services/advancedSearchService.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

/**
 * Helper: Get embedding function using Gemini 2.0 Flash for semantic similarity
 * Since free tier doesn't support text-embedding-004, we use Gemini to generate
 * semantic similarity scores directly
 */
function createEmbeddingFunction(ai, aiAvailable) {
  // Return empty embeddings - we'll rely on BM25 and RRF for ranking
  // The free tier doesn't support embedding models
  return async (doc) => {
    // Return empty array - vector similarity will be skipped
    // Search will use BM25+ and RRF only (still very effective)
    return [];
  };
}

/**
 * Helper: Use Gemini 2.0 Flash for semantic relevance scoring
 * This is an alternative to embeddings for the free tier
 */
async function getSemanticRelevanceScore(ai, query, docText) {
  if (!ai || !query || !docText) return 0;

  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Rate the semantic relevance of the following document to the search query on a scale of 0-100.
    
Query: "${query}"
Document: "${docText.substring(0, 500)}"

Return ONLY a number between 0 and 100. Nothing else.`;

    const result = await model.generateContent(prompt);
    const score = parseInt(result.response.text().trim());
    return isNaN(score) ? 0 : Math.min(100, Math.max(0, score));
  } catch (e) {
    console.error('[SemanticScore] Error:', e.message);
    return 0;
  }
}

/**
 * Helper: Extract document text
 */
function getDocText(doc) {
  return `${doc.title || ''} ${doc.summary || ''} ${doc.challenge_opportunity || ''} ${doc.code_preference || ''}`.toLowerCase();
}

/**
 * Helper: Map database row to frontend format
 */
function mapDBToFrontend(row, matchScore = 0) {
  const safeInt = (val) => (val !== null && val !== undefined) ? parseInt(val, 10) : 0;

  return {
    id: `IDEA-${row.idea_id}`,
    dbId: row.idea_id,
    title: row.title,
    description: row.summary || '',
    domain: row.challenge_opportunity || 'Other',
    status: row.build_phase || 'Submitted',
    businessGroup: row.idea_bg || 'Corporate Functions',
    buildType: row.build_preference || 'New Solution / IP',
    technologies: row.code_preference ?
      (row.code_preference.includes(',') ?
        row.code_preference.split(',').map(s => s.trim()) :
        [row.code_preference]) : [],
    submissionDate: row.created_at,
    associateId: row.associate_id,
    associateAccount: row.account || 'Unknown',
    associateBusinessGroup: row.assoc_bg || 'Unknown',
    score: row.idea_score !== undefined && row.idea_score !== null ? safeInt(row.idea_score) : 0,
    likesCount: safeInt(row.likes_count),
    isLiked: !!row.is_liked,
    matchScore: matchScore || 0,
    futureScope: "Integration with wider enterprise ecosystems.",
    impactScore: 8,
    confidenceScore: 8,
    feasibilityScore: 8
  };
}

/**
 * GET /api/ideas/search
 * Advanced search with NLP, spell correction, and hybrid ranking
 */
router.get('/search', async (req, res) => {
  try {
    const { q, profile = 'balanced', topK = 50, minScore = 10, useAI = 'true' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        error: true,
        message: 'Search query (q) is required'
      });
    }

    const pool = req.app.get('db');
    if (!pool) {
      return res.status(503).json({
        error: true,
        message: 'Database not available'
      });
    }

    console.log(`\n[SearchRoute] 🔍 Advanced search request: "${q}"`);
    console.log(`[SearchRoute] Profile: ${profile}, TopK: ${topK}, MinScore: ${minScore}`);

    // Get user ID for likes
    const userId = req.user ? req.user.user.emp_id : '';

    // Fetch all ideas from database
    const query = `
      SELECT DISTINCT ON (i.idea_id)
        i.score as idea_score,
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count,
        (EXISTS (SELECT 1 FROM likes WHERE idea_id = i.idea_id AND user_id = $1)) as is_liked
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
      ORDER BY i.idea_id, i.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    const documents = result.rows;

    console.log(`[SearchRoute] 📊 Loaded ${documents.length} documents from database`);

    // Initialize AI
    const apiKey = process.env.API_KEY;
    let ai = null;
    let aiAvailable = false;

    if (apiKey) {
      try {
        ai = new GoogleGenerativeAI(apiKey);
        aiAvailable = true;
      } catch (e) {
        console.warn('[SearchRoute] AI initialization failed:', e.message);
      }
    }

    // Create embedding functions
    const getEmbedding = createEmbeddingFunction(ai, aiAvailable);
    const getQueryEmbedding = async (text) => getEmbedding(text);

    // Select weight profile
    const weights = WEIGHT_PROFILES[profile] || WEIGHT_PROFILES.balanced;

    // Perform advanced search
    const searchResults = await optimizedHybridSearch({
      rawQuery: q.trim(),
      documents,
      getDocText,
      getEmbedding,
      getQueryEmbedding,
      weights,
      apiKey,
      useAI: useAI === 'true',
      topK: parseInt(topK) || 50,
      minScore: parseInt(minScore) || 10
    });

    // Map results to frontend format
    const mappedResults = searchResults.results.map(doc => {
      const mapped = mapDBToFrontend(doc, doc.matchScore);
      return {
        ...mapped,
        // Include scoring details for debugging
        _scoring: doc._scoring
      };
    });

    console.log(`[SearchRoute] ✅ Returning ${mappedResults.length} results`);

    res.json({
      success: true,
      results: mappedResults,
      metadata: searchResults.metadata,
      facets: {
        domains: [...new Set(mappedResults.map(r => r.domain))],
        businessGroups: [...new Set(mappedResults.map(r => r.businessGroup))],
        technologies: [...new Set(mappedResults.flatMap(r => r.technologies))]
      }
    });

  } catch (error) {
    console.error('[SearchRoute] Error:', error);
    res.status(500).json({
      error: true,
      message: 'Search failed',
      details: error.message
    });
  }
});

/**
 * GET /api/ideas/adaptive-search
 * Adaptive search that automatically selects the best weight profile
 */
router.get('/adaptive-search', async (req, res) => {
  try {
    const { q, topK = 50, minScore = 10, useAI = 'true' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        error: true,
        message: 'Search query (q) is required'
      });
    }

    const pool = req.app.get('db');
    if (!pool) {
      return res.status(503).json({
        error: true,
        message: 'Database not available'
      });
    }

    console.log(`\n[AdaptiveSearchRoute] 🧠 Adaptive search request: "${q}"`);

    // Get user ID for likes
    const userId = req.user ? req.user.user.emp_id : '';

    // Fetch all ideas
    const query = `
      SELECT DISTINCT ON (i.idea_id)
        i.score as idea_score,
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count,
        (EXISTS (SELECT 1 FROM likes WHERE idea_id = i.idea_id AND user_id = $1)) as is_liked
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
      ORDER BY i.idea_id, i.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    const documents = result.rows;

    // Initialize AI
    const apiKey = process.env.API_KEY;
    let ai = null;
    let aiAvailable = false;

    if (apiKey) {
      try {
        ai = new GoogleGenerativeAI(apiKey);
        aiAvailable = true;
      } catch (e) {
        console.warn('[AdaptiveSearchRoute] AI initialization failed:', e.message);
      }
    }

    // Create embedding functions
    const getEmbedding = createEmbeddingFunction(ai, aiAvailable);
    const getQueryEmbedding = async (text) => getEmbedding(text);

    // Perform adaptive search (automatically selects best profile)
    const searchResults = await adaptiveHybridSearch({
      rawQuery: q.trim(),
      documents,
      getDocText,
      getEmbedding,
      getQueryEmbedding,
      apiKey,
      useAI: useAI === 'true'
    });

    // Apply topK and minScore filtering
    const filteredResults = searchResults.results
      .filter(doc => doc.matchScore >= parseInt(minScore))
      .slice(0, parseInt(topK));

    // Map results
    const mappedResults = filteredResults.map(doc => {
      const mapped = mapDBToFrontend(doc, doc.matchScore);
      return {
        ...mapped,
        _scoring: doc._scoring
      };
    });

    console.log(`[AdaptiveSearchRoute] ✅ Returning ${mappedResults.length} results`);

    res.json({
      success: true,
      results: mappedResults,
      metadata: searchResults.metadata,
      facets: {
        domains: [...new Set(mappedResults.map(r => r.domain))],
        businessGroups: [...new Set(mappedResults.map(r => r.businessGroup))],
        technologies: [...new Set(mappedResults.flatMap(r => r.technologies))]
      }
    });

  } catch (error) {
    console.error('[AdaptiveSearchRoute] Error:', error);
    res.status(500).json({
      error: true,
      message: 'Adaptive search failed',
      details: error.message
    });
  }
});

/**
 * GET /api/ideas/search/profiles
 * Get available weight profiles
 */
router.get('/search/profiles', (req, res) => {
  res.json({
    success: true,
    profiles: Object.keys(WEIGHT_PROFILES).map(key => ({
      name: key,
      weights: WEIGHT_PROFILES[key],
      description: getProfileDescription(key)
    }))
  });
});

function getProfileDescription(profile) {
  const descriptions = {
    balanced: 'Balanced approach combining keyword and semantic search (default)',
    keyword: 'Keyword-focused for exact term matches',
    semantic: 'Semantic-focused for conceptual similarity',
    consensus: 'Consensus-based using rank fusion'
  };
  return descriptions[profile] || 'Custom profile';
}

export default router;
