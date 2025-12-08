/**
 * Optimized Indexer Service v2.0
 * High-performance indexing for ChromaDB with:
 * - Parallel batch processing
 * - Efficient embedding caching
 * - Dynamic field indexing from ideas table
 */

import { getChromaClient } from '../config/chroma.js';

// Pre-computed embeddings cache (in-memory for speed)
const embeddingCache = new Map();
const CACHE_MAX_SIZE = 10000;

// All searchable fields from ideas table
const IDEA_TEXT_FIELDS = [
    'title', 'summary', 'challenge_opportunity', 'scalability', 'novelty',
    'benefits', 'risks', 'responsible_ai', 'additional_info', 'timeline',
    'success_metrics', 'expected_outcomes', 'scalability_potential',
    'business_model', 'competitive_analysis', 'risk_mitigation',
    'build_phase', 'build_preference', 'code_preference', 'business_group'
];

// Filterable metadata fields
const IDEA_METADATA_FIELDS = [
    'idea_id', 'title', 'summary', 'challenge_opportunity', 'business_group',
    'code_preference', 'build_phase', 'build_preference', 'scalability',
    'novelty', 'timeline', 'participation_week', 'score', 'created_at',
    'benefits', 'risks', 'responsible_ai'
];

/**
 * Ultra-fast local embedding generator with caching
 * Optimized for speed while maintaining semantic quality
 */
function generateFastEmbedding(text) {
    const EMBEDDING_DIM = 768;
    
    if (!text || text.length === 0) {
        return new Array(EMBEDDING_DIM).fill(0);
    }

    // Check cache first (use first 300 chars as key for better cache hits)
    const cacheKey = text.toLowerCase().substring(0, 300);
    if (embeddingCache.has(cacheKey)) {
        return embeddingCache.get(cacheKey);
    }

    const embedding = new Float32Array(EMBEDDING_DIM);
    const lowerText = text.toLowerCase();

    // Extract bigrams (2-word phrases) for compound term matching
    const words = lowerText
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

    if (words.length === 0) {
        return Array.from(embedding);
    }

    // Create bigrams for compound terms
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
        bigrams.push(`${words[i]}_${words[i + 1]}`);
    }

    // Word frequency with fast Map
    const termFreq = new Map();
    
    // Add individual words
    for (const word of words) {
        termFreq.set(word, (termFreq.get(word) || 0) + 1);
    }
    
    // Add bigrams with higher weight for compound term matching
    for (const bigram of bigrams) {
        termFreq.set(bigram, (termFreq.get(bigram) || 0) + 1.5);
    }

    // Generate embedding using multiple hash functions
    const totalTerms = words.length + bigrams.length;
    for (const [term, freq] of termFreq) {
        // FNV-1a hash for better distribution
        let hash = 2166136261;
        for (let i = 0; i < term.length; i++) {
            hash ^= term.charCodeAt(i);
            hash = (hash * 16777619) >>> 0;
        }
        
        // Distribute across multiple dimensions for richer representation
        const idx1 = hash % EMBEDDING_DIM;
        const idx2 = (hash * 31) % EMBEDDING_DIM;
        const idx3 = (hash * 127) % EMBEDDING_DIM;
        const idx4 = (hash * 257) % EMBEDDING_DIM;
        
        // TF-IDF style weighting - bigrams get extra weight
        const isBigram = term.includes('_');
        const tf = freq / totalTerms;
        const idf = Math.log(1 + totalTerms / (freq + 1));
        const weight = tf * idf * (isBigram ? 1.5 : 1.0);
        
        embedding[idx1] += weight;
        embedding[idx2] += weight * 0.6;
        embedding[idx3] += weight * 0.4;
        embedding[idx4] += weight * 0.2;
    }

    // Fast L2 normalization
    let magnitude = 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
        magnitude += embedding[i] * embedding[i];
    }
    magnitude = Math.sqrt(magnitude);
    
    if (magnitude > 0) {
        for (let i = 0; i < EMBEDDING_DIM; i++) {
            embedding[i] /= magnitude;
        }
    }

    const result = Array.from(embedding);
    
    // LRU-style cache management
    if (embeddingCache.size >= CACHE_MAX_SIZE) {
        const keysToDelete = Array.from(embeddingCache.keys()).slice(0, 2000);
        keysToDelete.forEach(k => embeddingCache.delete(k));
    }
    embeddingCache.set(cacheKey, result);

    return result;
}

/**
 * Prepare comprehensive searchable text from idea
 */
function prepareIdeaText(idea) {
    const parts = IDEA_TEXT_FIELDS
        .map(field => idea[field])
        .filter(Boolean);
    
    // Join and limit to 3000 chars for comprehensive but efficient indexing
    return parts.join(' ').substring(0, 3000);
}

/**
 * Prepare metadata for filtering and display
 * Includes created_year for fast year-based filtering
 */
function prepareMetadata(idea) {
    const createdAt = idea.created_at;
    const createdYear = createdAt ? new Date(createdAt).getFullYear() : null;
    
    return {
        idea_id: idea.idea_id,
        title: idea.title || '',
        summary: (idea.summary || '').substring(0, 500),
        domain: (idea.challenge_opportunity || '').toLowerCase(),
        challengeOpportunity: (idea.challenge_opportunity || '').toLowerCase(),
        businessGroup: (idea.business_group || '').toLowerCase(),
        technologies: (idea.code_preference || '').toLowerCase(),
        buildPhase: (idea.build_phase || '').toLowerCase(),
        buildPreference: (idea.build_preference || '').toLowerCase(),
        scalability: (idea.scalability || '').toLowerCase(),
        novelty: (idea.novelty || '').toLowerCase(),
        timeline: idea.timeline || '',
        participationWeek: idea.participation_week || '',
        score: idea.score || 0,
        created_at: createdAt?.toISOString() || '',
        created_year: createdYear,
        benefits: (idea.benefits || '').substring(0, 300),
        risks: (idea.risks || '').substring(0, 300),
        responsibleAI: idea.responsible_ai || ''
    };
}

/**
 * Index ideas with optimized parallel processing
 * @param {object} pool - Database pool
 * @param {object} options - Indexing options
 */
export async function indexIdeasOptimized(pool, options = {}) {
    const {
        batchSize = 200,  // Increased batch size for faster processing
        forceReindex = false
    } = options;

    const startTime = Date.now();
    const chromaClient = getChromaClient();

    // Check existing index
    if (!forceReindex) {
        const hasCollection = chromaClient.hasCollection('ideas_search');
        const stats = hasCollection ? chromaClient.getStats('ideas_search') : null;
        
        if (hasCollection && stats && stats.documentCount > 0) {
            console.log(`[Indexer] ✅ Using existing index (${stats.documentCount} docs)`);
            return { indexed: stats.documentCount, cached: true, time: 0 };
        }
    }

    console.log('[Indexer] Starting optimized indexing...');

    // Fetch ALL ideas with all fields
    const result = await pool.query(`
        SELECT 
            idea_id, title, summary, challenge_opportunity,
            scalability, novelty, benefits, risks,
            responsible_ai, additional_info, timeline,
            success_metrics, expected_outcomes, scalability_potential,
            business_model, competitive_analysis, risk_mitigation,
            participation_week, build_phase, build_preference,
            code_preference, business_group, score, created_at
        FROM ideas
        ORDER BY created_at DESC
    `);

    if (result.rows.length === 0) {
        console.log('[Indexer] No ideas to index');
        return { indexed: 0, cached: false, time: 0 };
    }

    let indexed = 0;
    const totalIdeas = result.rows.length;

    // Process in larger batches for speed
    for (let i = 0; i < totalIdeas; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        
        // Process batch in parallel
        const processedBatch = batch.map(idea => {
            const text = prepareIdeaText(idea);
            if (!text || text.length < 10) return null;
            
            const embedding = generateFastEmbedding(text);
            const metadata = prepareMetadata(idea);
            
            return { document: text, embedding, metadata };
        }).filter(Boolean);

        if (processedBatch.length > 0) {
            chromaClient.addDocuments(
                'ideas_search',
                processedBatch.map(i => i.document),
                processedBatch.map(i => i.embedding),
                processedBatch.map(i => i.metadata)
            );
            indexed += processedBatch.length;
        }

        // Progress logging every 500 items
        if ((i + batchSize) % 500 === 0 || i + batchSize >= totalIdeas) {
            const progress = Math.min(100, Math.round(((i + batchSize) / totalIdeas) * 100));
            console.log(`[Indexer] Progress: ${progress}% (${indexed}/${totalIdeas})`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [Indexer] Indexed ${indexed} ideas in ${duration}s`);

    return { indexed, cached: false, time: parseFloat(duration) };
}

/**
 * Optimized search with dynamic filtering
 * @param {string} query - Search query
 * @param {object} filters - Dynamic filters
 * @param {number} limit - Max results (default 200)
 * @param {object} pool - Database pool for fetching accurate created_at dates
 */
export async function optimizedSearch(query, filters = {}, limit = 200, pool = null) {
    try {
        const chromaClient = getChromaClient();
        
        if (!chromaClient.hasCollection('ideas_search')) {
            console.log('[OptimizedSearch] No collection found');
            return { results: [], source: 'none' };
        }

        // Generate query embedding (case-insensitive via lowercase)
        const queryEmbedding = generateFastEmbedding(query.toLowerCase());
        
        if (!queryEmbedding || queryEmbedding.length === 0) {
            return { results: [], source: 'none' };
        }

        console.log(`[OptimizedSearch] Searching for: "${query}" (limit: ${limit})`);
        
        // Query ChromaDB with higher limit for post-filtering
        const rawResults = chromaClient.query('ideas_search', queryEmbedding, Math.min(limit * 2, 500));
        
        if (!rawResults || !rawResults.documents || rawResults.documents.length === 0) {
            console.log('[OptimizedSearch] No results from ChromaDB');
            return { results: [], source: 'chromadb' };
        }

        console.log(`[OptimizedSearch] ChromaDB returned ${rawResults.documents.length} raw results`);

        // Map results with similarity scores
        let results = [];
        
        // Calculate minimum similarity threshold based on query quality
        // Garbage/nonsense queries should return no results
        const queryWords = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const isLikelyGarbageQuery = queryWords.length === 0 || 
            (queryWords.length === 1 && queryWords[0].length > 15 && !/[aeiou]{2,}/i.test(queryWords[0]));
        
        // Higher threshold for garbage queries to filter them out
        const minSimilarityThreshold = isLikelyGarbageQuery ? 50 : 15;
        
        console.log(`[OptimizedSearch] Query analysis: words=${queryWords.length}, isGarbage=${isLikelyGarbageQuery}, minThreshold=${minSimilarityThreshold}`);
        
        for (let idx = 0; idx < rawResults.documents.length; idx++) {
            const doc = rawResults.documents[idx];
            const metadata = rawResults.metadatas[idx] || {};
            const distance = rawResults.distances[idx] || 1;
            const similarity = Math.max(0, Math.round((1 - distance) * 100));

            // Skip results below the dynamic similarity threshold
            if (similarity < minSimilarityThreshold) continue;

            results.push({
                id: `IDEA-${metadata.idea_id}`,
                dbId: metadata.idea_id,
                title: metadata.title || 'Untitled',
                description: metadata.summary || (doc ? doc.substring(0, 200) : ''),
                domain: metadata.domain || '',
                businessGroup: metadata.businessGroup || '',
                technologies: metadata.technologies || '',
                buildPhase: metadata.buildPhase || '',
                scalability: metadata.scalability || '',
                novelty: metadata.novelty || '',
                score: metadata.score || 0,
                submissionDate: metadata.created_at || '',
                matchScore: similarity
            });
        }

        // Apply dynamic filters (case-insensitive) - excludes year filter
        const filterResult = applyDynamicFilters(results, filters);
        let filtered = filterResult.filtered;

        // Apply year filter with database lookup for accurate dates
        if (filters.year) {
            filtered = await applyYearFilter(filtered, filters.year, pool);
        }

        // Sort by match score and limit
        filtered = filtered
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, limit);

        console.log(`[OptimizedSearch] Final results: ${filtered.length}`);
        return { results: filtered, source: 'semantic' };
        
    } catch (error) {
        console.error('[OptimizedSearch] Error:', error.message);
        return { results: [], source: 'error' };
    }
}

/**
 * Apply dynamic filters to results with STRICT AND logic
 * When multiple filters are applied, ALL must match
 * Domain filter searches: challenge_opportunity, title, summary, description
 */
function applyDynamicFilters(results, filters) {
    // Count how many filters are active (excluding year - handled separately with DB lookup)
    const activeFilters = [];
    if (filters.domain?.length > 0) activeFilters.push('domain');
    if (filters.businessGroup?.length > 0) activeFilters.push('businessGroup');
    if (filters.techStack?.length > 0) activeFilters.push('techStack');
    if (filters.buildPhase?.length > 0) activeFilters.push('buildPhase');
    if (filters.scalability?.length > 0) activeFilters.push('scalability');
    // Note: year filter is handled separately with DB lookup for accurate dates

    if (activeFilters.length === 0) {
        return { filtered: results, activeFilters };
    }

    console.log(`[OptimizedSearch] Applying STRICT AND for ${activeFilters.length} filters: ${activeFilters.join(', ')}`);

    // Apply strict AND filtering - ALL filters must match
    const filtered = results.filter(r => {
        // Domain filter - searches across multiple fields
        if (filters.domain?.length > 0) {
            const domains = (Array.isArray(filters.domain) ? filters.domain : [filters.domain])
                .map(d => d.toLowerCase());
            const searchableText = [
                r.domain || '',
                r.title || '',
                r.description || ''
            ].join(' ').toLowerCase();
            
            if (!domains.some(d => searchableText.includes(d))) {
                return false; // Domain filter not matched
            }
        }

        // Business group filter
        if (filters.businessGroup?.length > 0) {
            const groups = (Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup])
                .map(g => g.toLowerCase());
            if (!groups.some(g => (r.businessGroup || '').toLowerCase().includes(g))) {
                return false; // Business group filter not matched
            }
        }

        // Technology filter - check in technologies field AND in description/title
        if (filters.techStack?.length > 0) {
            const techs = (Array.isArray(filters.techStack) ? filters.techStack : [filters.techStack])
                .map(t => t.toLowerCase());
            const techSearchText = [
                r.technologies || '',
                r.title || '',
                r.description || ''
            ].join(' ').toLowerCase();
            
            if (!techs.some(t => techSearchText.includes(t))) {
                return false; // Tech filter not matched
            }
        }

        // Build phase filter
        if (filters.buildPhase?.length > 0) {
            const phases = (Array.isArray(filters.buildPhase) ? filters.buildPhase : [filters.buildPhase])
                .map(p => p.toLowerCase());
            if (!phases.some(p => (r.buildPhase || '').toLowerCase().includes(p))) {
                return false; // Build phase filter not matched
            }
        }

        // Scalability filter
        if (filters.scalability?.length > 0) {
            const scales = (Array.isArray(filters.scalability) ? filters.scalability : [filters.scalability])
                .map(s => s.toLowerCase());
            if (!scales.some(s => (r.scalability || '').toLowerCase().includes(s))) {
                return false; // Scalability filter not matched
            }
        }

        // Year filter - handled separately after DB lookup
        // Skip year filter here, will be applied after fetching dates from DB

        return true; // All other filters matched
    });
    
    console.log(`[OptimizedSearch] After non-year filters: ${filtered.length} results`);

    return { filtered, activeFilters };
}

/**
 * Apply year filter with database lookup for accurate dates
 */
async function applyYearFilter(results, year, pool) {
    if (!year || results.length === 0) return results;
    
    // Fetch actual created_at from database
    if (pool) {
        try {
            const ideaIds = results.map(r => r.dbId).filter(Boolean);
            if (ideaIds.length > 0) {
                const dateResult = await pool.query(
                    `SELECT idea_id, created_at FROM ideas WHERE idea_id = ANY($1::int[])`,
                    [ideaIds]
                );
                const dateMap = new Map(dateResult.rows.map(r => [r.idea_id, r.created_at]));
                
                // Update submissionDate from database
                results = results.map(idea => ({
                    ...idea,
                    submissionDate: dateMap.get(idea.dbId) || idea.submissionDate
                }));
            }
        } catch (e) {
            console.warn('[OptimizedSearch] Failed to fetch dates from DB:', e.message);
        }
    }
    
    // Apply year filter with accurate dates
    const filtered = results.filter(r => {
        if (!r.submissionDate) return false;
        const ideaYear = new Date(r.submissionDate).getFullYear();
        return ideaYear === year;
    });
    
    console.log(`[OptimizedSearch] Year ${year} filter applied, ${filtered.length} results remaining`);
    return filtered;
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache() {
    embeddingCache.clear();
    console.log('[Indexer] Embedding cache cleared');
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    return {
        size: embeddingCache.size,
        maxSize: CACHE_MAX_SIZE
    };
}

export default {
    indexIdeasOptimized,
    optimizedSearch,
    generateFastEmbedding,
    clearEmbeddingCache,
    getCacheStats
};
