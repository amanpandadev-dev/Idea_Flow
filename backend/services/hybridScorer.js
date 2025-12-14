/**
 * Hybrid Scorer for ProSearch
 * 
 * Combines vector similarity, metadata matching, and keyword frequency
 * Formula: s_total = α·s_vector + β·s_metadata + γ·s_text
 */

// Configurable weights (optimized for Llama embeddings)
const CONFIG = {
    ALPHA: 0.70,  // Semantic similarity dominates (was 0.60)
    BETA: 0.20,   // Metadata refinement (was 0.30)
    GAMMA: 0.10,  // Keyword support

    // Score thresholds (lowered for Llama)
    COSINE_THRESHOLD: 0.50,  // Llama produces lower similarities (was 0.70)

    // Metadata scoring weights
    DOMAIN_MATCH_SCORE: 0.4,
    YEAR_MATCH_SCORE: 0.3,
    TECH_MATCH_SCORE: 0.3,
    BUSINESS_GROUP_SCORE: 0.3,
    THEME_MATCH_SCORE: 0.2
};

/**
 * Normalize vector score from [threshold, 1.0] to [0.0, 1.0]
 */
function normalizeVectorScore(cosineSimilarity, threshold = CONFIG.COSINE_THRESHOLD) {
    if (cosineSimilarity < threshold) return 0.0;
    return (cosineSimilarity - threshold) / (1.0 - threshold);
}

/**
 * Calculate metadata match score [0.0, 1.0]
 */
function calculateMetadataScore(idea, context) {
    let score = 0.0;
    let maxPossible = 0.0;

    // Domain match
    if (context.constraints.domains.size > 0) {
        maxPossible += CONFIG.DOMAIN_MATCH_SCORE;
        const ideaDomain = (idea.domain || '').toLowerCase();
        for (const domain of context.constraints.domains) {
            if (ideaDomain.includes(domain.toLowerCase())) {
                score += CONFIG.DOMAIN_MATCH_SCORE;
                break;
            }
        }
    }

    // Year match
    if (context.constraints.years.size > 0) {
        maxPossible += CONFIG.YEAR_MATCH_SCORE;
        const ideaYear = idea.submissionDate ? new Date(idea.submissionDate).getFullYear() : null;
        if (ideaYear && context.constraints.years.has(ideaYear)) {
            score += CONFIG.YEAR_MATCH_SCORE;
        }
    }

    // Technology match
    if (context.constraints.technologies.size > 0) {
        maxPossible += CONFIG.TECH_MATCH_SCORE;
        const ideaTechs = (idea.technologies || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
        const contextTechs = Array.from(context.constraints.technologies).map(t => t.toLowerCase());

        const hasMatch = ideaTechs.some(tech =>
            contextTechs.some(contextTech =>
                tech.includes(contextTech) || contextTech.includes(tech)
            )
        );

        if (hasMatch) {
            score += CONFIG.TECH_MATCH_SCORE;
        }
    }

    // Business group match
    if (context.constraints.businessGroups.size > 0) {
        maxPossible += CONFIG.BUSINESS_GROUP_SCORE;
        const ideaBg = (idea.businessGroup || '').toLowerCase();
        for (const bg of context.constraints.businessGroups) {
            if (ideaBg.includes(bg.toLowerCase())) {
                score += CONFIG.BUSINESS_GROUP_SCORE;
                break;
            }
        }
    }

    // Normalize to [0, 1]
    if (maxPossible === 0) return 0;
    return Math.min(1.0, score / maxPossible);
}

/**
 * Calculate keyword match score (simple TF)
 */
function calculateKeywordScore(idea, query) {
    if (!query || query.trim().length === 0) return 0.0;

    // Tokenize query (skip stopwords)
    const stopwords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'with', 'from', 'by']);
    const queryTokens = query.toLowerCase()
        .split(/\s+/)
        .filter(token => token.length > 2 && !stopwords.has(token));

    if (queryTokens.length === 0) return 0.0;

    // Create searchable text from idea
    const ideaText = [
        idea.title || '',
        idea.description || '',
        idea.domain || '',
        idea.technologies || ''
    ].join(' ').toLowerCase();

    // Count matches
    const matches = queryTokens.filter(token => ideaText.includes(token));

    // Simple TF score
    return matches.length / queryTokens.length;
}

/**
 * Calculate hybrid score for a single result
 */
function calculateHybridScore(result, query, context) {
    const { similarity, idea } = result;

    // Component scores
    const s_vector = normalizeVectorScore(similarity, CONFIG.COSINE_THRESHOLD);
    const s_metadata = calculateMetadataScore(idea, context);
    const s_text = calculateKeywordScore(idea, query);

    // Weighted combination
    const s_total =
        CONFIG.ALPHA * s_vector +
        CONFIG.BETA * s_metadata +
        CONFIG.GAMMA * s_text;

    return {
        hybridScore: s_total,
        scoreBreakdown: {
            vector: s_vector,
            metadata: s_metadata,
            keyword: s_text,
            raw_similarity: similarity
        }
    };
}

/**
 * Re-rank results using hybrid scoring
 * Returns sorted results with hybrid scores
 */
export function hybridRerank(results, query, context) {
    // Calculate hybrid scores for all results
    const scoredResults = results.map(result => {
        const scores = calculateHybridScore(result, query, context);
        return {
            ...result,
            ...scores
        };
    });

    // Sort by hybrid score (descending)
    return scoredResults.sort((a, b) => b.hybridScore - a.hybridScore);
}

/**
 * Filter results by threshold and apply hybrid scoring
 */
export function applyThresholdAndRerank(results, query, context, threshold = CONFIG.COSINE_THRESHOLD) {
    console.log(`[HybridScorer] Filtering ${results.length} results with threshold ${threshold}`);

    // Step 1: Filter by cosine similarity threshold
    const filtered = results.filter(result => result.similarity >= threshold);
    console.log(`[HybridScorer] ${filtered.length} results after threshold filtering`);

    if (filtered.length === 0) {
        return [];
    }

    // Step 2: Apply hybrid scoring and re-rank
    const reranked = hybridRerank(filtered, query, context);

    console.log(`[HybridScorer] Top 5 hybrid scores:`,
        reranked.slice(0, 5).map(r => ({
            title: r.idea.title?.substring(0, 40),
            hybridScore: r.hybridScore.toFixed(3),
            breakdown: {
                vector: r.scoreBreakdown.vector.toFixed(2),
                metadata: r.scoreBreakdown.metadata.toFixed(2),
                keyword: r.scoreBreakdown.keyword.toFixed(2)
            }
        }))
    );

    return reranked;
}

/**
 * Export configuration for tuning
 */
export function getConfig() {
    return { ...CONFIG };
}

export function setConfig(updates) {
    Object.assign(CONFIG, updates);
    console.log('[HybridScorer] Config updated:', CONFIG);
}

export default {
    hybridRerank,
    applyThresholdAndRerank,
    calculateHybridScore,
    getConfig,
    setConfig
};
