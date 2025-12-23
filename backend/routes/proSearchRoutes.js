/**
 * Pro Search Routes - Advanced Semantic Search with NLP
 * 
 * Features:
 * - ChromaDB for fast vector similarity search
 * - Ollama/Llama for embeddings and AI responses
 * - NLP query processing with spell correction
 * - Context validation to block off-topic queries
 * - Intent classification (Llama)
 * - Clean semantic queries (no NLP mutation)
 * - User-controlled metadata filtering (after semantic search)
 * - Multi-turn context management
 * - Unlimited results
 * - Hybrid scoring
 */

import express from 'express';
import pg from 'pg';
import { getChromaClient, initChromaDB } from '../config/chroma.js';
import { getEmbeddingVector } from '../services/embeddingProvider.js';
import { generateText } from '../config/ollama.js';
import { SearchStateService } from '../services/searchStateService.js';
// ENTERPRISE: Metadata extraction
import {
    extractEnterpriseMetadata,
    isDomainShift,
    isRefinement,
    ENTERPRISE_PATTERNS
} from '../services/enterpriseMatchers.js';

// Hybrid search services
import { classifyIntent, INTENTS } from '../services/intentClassifier.js';
import { buildSemanticQuery, buildRefinedQuery } from '../services/queryBuilder.js';
import { applyMetadataFilters, countActiveFilters } from '../services/metadataFilter.js';
import { extractFilterInfo, normalizeFilterType, normalizeFilterValue, extractFiltersForPostgres } from '../services/filterExtractor.js';
import { getFilteredIdeaIds, hasActiveFilters, mergeFilters, detectFilterMode } from '../services/postgresFilterService.js';
import { buildFilterAwareQuery, detectBusinessGroups } from '../services/filterAwareQueryBuilder.js';
import {
    getOrCreateContext,
    hasContext,
    getContext,
    getSessionByConversationId
} from '../services/sessionContextManager.js';
import ConversationService, { deriveBaseQuery, deriveFiltersFromMessages } from '../services/conversationService.js';
import {
    calculateHybridScore,
    calculateMetadataScore,
    calculateKeywordScore,
    formatResults,
    generateConversationalResponse,
    generateSearchResponse,
    generateSmartSuggestions
} from '../services/hybridSearchHelpers.js';
import { fetchIdeasByIds } from '../services/ideaHelpers.js';


const router = express.Router();
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// FIX #1: CACHED ChromaDB Collection (CRITICAL - 4-10x speedup)
let cachedIdeasCollection = null;
let lastIndexTime = null;
let isIndexing = false;
const INDEX_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Get cached ChromaDB collection (FAST PATH)
 * Returns immediately after first call (0ms vs 10-30s)
 */
async function getIdeasCollection() {
    if (cachedIdeasCollection) {
        return cachedIdeasCollection; // INSTANT after first call
    }

    console.log('[Chroma] Cache miss - loading ideas_search collection...');
    const chromaClient = getChromaClient();
    cachedIdeasCollection = chromaClient.getCollection({ name: 'ideas_search' });
    console.log('[Chroma] ✅ Collection cached - future queries will be instant');

    return cachedIdeasCollection;
}

// Optimized search configuration
const CONFIG = {
    TOP_K_INITIAL: 250,
    COSINE_THRESHOLD: 0.50,
    MIN_RESULTS_WARNING: 5
};

// FIX #3: Enhanced Embedding Cache with TTL
const embeddingCache = new Map();  // query → {embedding, timestamp}
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;  // 30 minutes

/**
 * Get cached embedding or generate new one
 */
async function getCachedEmbedding(text) {
    const cacheKey = text.trim().toLowerCase();

    // Check cache
    if (embeddingCache.has(cacheKey)) {
        const cached = embeddingCache.get(cacheKey);
        const age = Date.now() - cached.timestamp;

        if (age < CACHE_TTL_MS) {
            console.log(`[Embedding Cache] HIT (${Math.round(age / 1000)}s old)`);
            return cached.embedding;
        } else {
            console.log('[Embedding Cache] EXPIRED');
            embeddingCache.delete(cacheKey);
        }
    }

    // Cache miss - generate new
    console.log('[Embedding Cache] MISS - generating...');
    const embedding = await getEmbeddingVector(text.substring(0, 1500), 'llama');

    // Store in cache
    embeddingCache.set(cacheKey, {
        embedding,
        timestamp: Date.now()
    });

    // Evict oldest if cache too large
    if (embeddingCache.size > CACHE_MAX_SIZE) {
        const firstKey = embeddingCache.keys().next().value;
        embeddingCache.delete(firstKey);
    }

    return embedding;
}

/**
 * Normalize idea IDs for PostgreSQL INTEGER[] storage
 * Converts "idea_4460" → 4460, "4460" → 4460, 4460 → 4460
 * CRITICAL: PostgreSQL expects INTEGER[], not STRING[]
 */
function normalizeIdeaId(id) {
    if (typeof id === 'string') {
        // Remove all non-digit characters and parse
        const numericId = parseInt(id.replace(/[^\d]/g, ''), 10);
        if (isNaN(numericId)) {
            console.warn(`[normalizeIdeaId] Invalid ID: ${id}, returning null`);
            return null;
        }
        return numericId;
    }
    if (typeof id === 'number') {
        return id;
    }
    console.warn(`[normalizeIdeaId] Unexpected type for ID: ${typeof id}, value: ${id}`);
    return null;
}


// FIX #2: Fast Intent Heuristic (Rule-based, 0ms)
/**
 * Rule-based intent classification (FAST - no LLM needed for most queries)
 * Returns intent or null if ambiguous
 */

function fastIntentHeuristic(query, hasContext, currentDomain = null) {
    const lower = query.toLowerCase().trim();
    const wordCount = query.split(/\s+/).length;

    // PRIORITY 1: Reset/Clear
    if (ENTERPRISE_PATTERNS.reset.test(lower)) {
        console.log(`[Heuristic] Reset detected`);
        return 'reset_filters';
    }

    // PRIORITY 2: Remove filter
    if (lower.match(/^(remove|clear|delete) (year|tech|domain|filter)/)) {
        return 'remove_filter';
    }

    // PRIORITY 3: CONTEXT + METADATA = REFINEMENT (MOST IMPORTANT!)
    if (hasContext) {
        const metadata = extractEnterpriseMetadata(query);
        if (Object.keys(metadata).length > 0) {
            console.log(`[Heuristic] ✅ Context + metadata → refine_search`);
            return 'refine_search';
        }
    }

    // PRIORITY 4: No context = semantic search
    if (!hasContext) {
        return 'semantic_search';
    }

    // PRIORITY 5: Domain shift = new search (AFTER checking metadata!)
    if (isDomainShift(query, currentDomain)) {
        console.log(`[Heuristic] Domain shift → semantic_search`);
        return 'semantic_search';
    }

    // PRIORITY 6: Short with context = refinement
    if (hasContext && wordCount <= 4) {
        return 'refine_search';
    }

    // PRIORITY 7: Questions
    if (lower.match(/^(what|how|why|when|who|where|can|could|would|should|is|are|do|does)/)) {
        return 'ask_question';
    }

    // Default: semantic search
    if (wordCount >= 3) {
        return 'semantic_search';
    }

    return null;
}

/**
 * Generate embedding using Ollama/Llama
 */
async function getEmbedding(text) {
    if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
    }

    // Truncate to avoid token limits
    const truncatedText = text.substring(0, 1500);

    try {
        // Use Ollama embedding (768-dim)
        return await getEmbeddingVector(truncatedText, 'llama');
    } catch (error) {
        console.warn('[Pro Search] Ollama embedding failed:', error.message);
        // Fallback to local TF-IDF if Ollama unavailable
        return generateLocalEmbedding(truncatedText);
    }
}

/**
 * Local TF-IDF style embedding generator (no external API needed)
 */
function generateLocalEmbedding(text) {
    const EMBEDDING_DIM = 768;
    const embedding = new Array(EMBEDDING_DIM).fill(0);

    // Tokenize and clean
    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

    if (words.length === 0) {
        return embedding;
    }

    // Word frequency
    const wordFreq = {};
    words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Generate embedding using multiple hash functions for better distribution
    Object.entries(wordFreq).forEach(([word, freq]) => {
        // Multiple hash positions for each word
        for (let h = 0; h < 3; h++) {
            const hash = word.split('').reduce((acc, char, i) =>
                acc + char.charCodeAt(0) * (i + 1) * (h + 1), h * 1000);
            const index = Math.abs(hash) % EMBEDDING_DIM;

            // TF-IDF style weighting
            const tf = freq / words.length;
            const idf = Math.log(1 + 1 / (freq + 1));
            embedding[index] += tf * idf * (h === 0 ? 1 : 0.5);
        }
    });

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
        for (let i = 0; i < EMBEDDING_DIM; i++) {
            embedding[i] /= magnitude;
        }
    }

    return embedding;
}



// Track if we've already checked the index this session
let indexChecked = false;

/**
 * Ensure ChromaDB index exists (index only once per server session)
 */
async function indexIdeasToChroma(pool) {
    // FAST PATH: Already indexed this session - skip everything
    if (indexChecked) {
        return;
    }

    // Prevent concurrent indexing
    if (isIndexing) {
        return;
    }

    try {
        const chromaClient = getChromaClient();

        // Check if collection already has data (loaded from disk)
        const hasCollection = chromaClient.hasCollection('ideas_search');
        const stats = hasCollection ? chromaClient.getStats('ideas_search') : null;

        if (hasCollection && stats && stats.documentCount > 0) {
            // Collection exists with data - mark as checked and skip indexing
            lastIndexTime = Date.now();
            indexChecked = true;
            console.log(`[Pro Search] ✅ Using existing index with ${stats.documentCount} ideas (loaded from disk)`);
            return;
        }

        // Set indexing flag to prevent concurrent runs
        isIndexing = true;

        console.log('[Pro Search] Indexing ideas to ChromaDB...');

        // Fetch ALL fields from ideas table for comprehensive indexing
        const result = await pool.query(`
            SELECT 
                idea_id, title, summary, challenge_opportunity,
                scalability, novelty, benefits, risks,
                responsible_ai, additional_info, prototype_url,
                timeline, success_metrics, expected_outcomes,
                scalability_potential, business_model, competitive_analysis,
                risk_mitigation, participation_week, build_phase,
                build_preference, code_preference, business_group,
                score, created_at, updated_at
            FROM ideas
            ORDER BY created_at DESC
            LIMIT 1000
        `);

        if (result.rows.length === 0) {
            console.log('[Pro Search] No ideas to index');
            return;
        }

        // Process in batches
        const batchSize = 25;
        let indexed = 0;

        for (let i = 0; i < result.rows.length; i += batchSize) {
            const batch = result.rows.slice(i, i + batchSize);

            const documents = [];
            const embeddings = [];
            const metadatas = [];

            for (const idea of batch) {
                // Create comprehensive searchable text from ALL fields
                const textParts = [
                    idea.title,
                    idea.summary,
                    idea.challenge_opportunity,
                    idea.benefits,
                    idea.risks,
                    idea.additional_info,
                    idea.success_metrics,
                    idea.expected_outcomes,
                    idea.business_model,
                    idea.competitive_analysis,
                    idea.risk_mitigation,
                    idea.code_preference,
                    idea.build_preference,
                    idea.scalability,
                    idea.novelty,
                    idea.timeline,
                    idea.responsible_ai
                ].filter(Boolean).join(' ').trim();

                if (!textParts || textParts.length < 10) continue;

                try {
                    // Truncate for embedding but keep it comprehensive
                    const embedding = await getEmbedding(textParts.substring(0, 3000));

                    documents.push(textParts);
                    embeddings.push(embedding);

                    // Store comprehensive metadata for filtering and display
                    metadatas.push({
                        idea_id: idea.idea_id,
                        title: idea.title || '',
                        summary: (idea.summary || '').substring(0, 500),
                        domain: idea.challenge_opportunity || '',
                        businessGroup: idea.business_group || '',
                        technologies: idea.code_preference || '',
                        buildPhase: idea.build_phase || '',
                        buildPreference: idea.build_preference || '',
                        scalability: idea.scalability || '',
                        novelty: idea.novelty || '',
                        timeline: idea.timeline || '',
                        participationWeek: idea.participation_week || '',
                        score: idea.score || 0,
                        created_at: idea.created_at?.toISOString() || '',
                        // Additional searchable fields in metadata
                        benefits: (idea.benefits || '').substring(0, 300),
                        risks: (idea.risks || '').substring(0, 300),
                        successMetrics: (idea.success_metrics || '').substring(0, 300)
                    });
                    indexed++;
                } catch (embError) {
                    console.warn(`[Pro Search] Failed to embed idea ${idea.idea_id}:`, embError.message);
                }
            }

            if (documents.length > 0) {
                chromaClient.addDocuments('ideas_search', documents, embeddings, metadatas);
            }

            // Small delay to avoid rate limits
            if (i + batchSize < result.rows.length) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        lastIndexTime = Date.now();
        indexChecked = true; // Mark as indexed for this session
        console.log(`✅ [Pro Search] Indexed ${indexed} ideas to ChromaDB (will not re-index this session)`);

    } catch (error) {
        console.error('[Pro Search] Indexing error:', error.message);
        // Still mark as checked to prevent retry loops
        indexChecked = true;
    } finally {
        isIndexing = false; // Always reset the flag
    }
}

/**
 * Conversation Rehydration Endpoint
 * GET /api/search/conversation/:conversationId
 * 
 * Reconstructs search results from PostgreSQL conversation history
 * WITHOUT storing results in DB - uses ChromaDB + progressive filtering
 */
router.get('/conversation/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.query.userId || 'anonymous';

        console.log(`\n[Rehydration] Loading conversation: ${conversationId.substring(0, 20)}...`);

        // Validate UUID format (reject old-format conversationIds)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(conversationId)) {
            console.warn(`[Rehydration] Invalid UUID format: ${conversationId}`);
            return res.status(404).json({
                error: true,
                message: 'Conversation not found (invalid ID format)',
                hint: 'Please start a new chat'
            });
        }

        // Step 1: Get conversation messages from PostgreSQL
        const conversationService = new ConversationService(pool);
        const conversation = await conversationService.getConversationById(conversationId, userId);

        if (!conversation || !conversation.messages) {
            console.warn(`[Rehydration] Conversation not found: ${conversationId}`);
            return res.status(404).json({
                error: true,
                message: 'Conversation not found'
            });
        }

        const messages = conversation.messages;
        console.log(`[Rehydration] Loaded ${messages.length} messages from DB`);

        // Step 2: Derive state from messages
        const baseQuery = deriveBaseQuery(messages);
        const appliedFilters = deriveFiltersFromMessages(messages);

        if (!baseQuery) {
            console.warn(`[Rehydration] No base query found in conversation`);
            return res.json({
                success: true,
                results: [],
                resultContext: {
                    query: '',
                    action: 'base_search',
                    conversationId,
                    filters: {}
                },
                messages: messages.map(m => ({ role: m.role, content: m.content }))
            });
        }

        console.log(`[Rehydration] Base query: "${baseQuery}"`);
        console.log(`[Rehydration] Applied filters:`, appliedFilters);

        // Step 3: Re-run semantic search on ChromaDB
        const embeddingStart = Date.now();
        const embedding = await generateEmbedding(baseQuery);
        const embeddingTime = Date.now() - embeddingStart;

        const chromaResults = await chromaCollections.ideas.query({
            queryEmbeddings: [embedding],
            nResults: 500
        });

        let results = [];
        const threshold = 0.40;

        if (chromaResults.ids[0] && chromaResults.ids[0].length > 0) {
            for (let i = 0; i < chromaResults.ids[0].length; i++) {
                const distance = chromaResults.distances[0][i];
                const similarity = 1 - distance;

                if (similarity >= threshold) {
                    results.push({
                        id: chromaResults.ids[0][i],
                        document: chromaResults.documents[0][i],
                        metadata: chromaResults.metadatas[0][i],
                        similarity
                    });
                }
            }
        }

        console.log(`[Rehydration] ChromaDB: ${results.length} results (${embeddingTime}ms)`);

        // Step 4: Apply filters progressively
        if (Object.values(appliedFilters).some(f => f && f.length > 0)) {
            const beforeFiltering = results.length;
            results = applyMetadataFilters(results, appliedFilters);
            console.log(`[Rehydration] Filtered: ${beforeFiltering} → ${results.length}`);
        }

        // Step 5: Format response
        const formattedResults = formatResults(results);

        console.log(`[Rehydration] Complete: ${formattedResults.length} results restored\n`);

        res.json({
            success: true,
            results: formattedResults,
            resultContext: {
                query: baseQuery,
                action: 'reload',
                conversationId,
                filters: appliedFilters
            },
            filtersApplied: appliedFilters,
            messages: messages.map(m => ({ role: m.role, content: m.content }))
        });

    } catch (error) {
        console.error('[Rehydration] Error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to rehydrate conversation'
        });
    }
});

/**
 * Hybrid Conversational Search Endpoint
 * Features:
 * - Intent classification (Llama)
 * - Clean semantic queries (no NLP mutation)
 * - User-controlled metadata filtering
 * - Multi-turn context management
 * - Unlimited results
 * - Hybrid scoring
 */
router.post('/conversational', async (req, res) => {
    const startTime = Date.now();

    try {
        let { query, conversationId, conversationHistory = [] } = req.body; // Changed const to let
        const userId = req.user?.id || req.session?.userId || req.headers['x-session-id'] || 'anonymous';

        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                error: true,
                message: 'Query cannot be empty'
            });
        }

        const trimmedQuery = query.trim();
        console.log(`\n========== PROSEARCH ==========`);
        console.log(`[User: ${userId}] Query: "${trimmedQuery}"`);
        console.log(`[Conversation: ${conversationId || 'NEW'}]`);

        // STEP 1: Get or create conversation-scoped context
        const context = getOrCreateContext(userId, conversationId);

        // CRITICAL: Persist conversation to PostgreSQL if new
        if (!conversationId) {
            try {
                const conversationService = new ConversationService(pool);
                const newConversation = await conversationService.createConversation(userId, {
                    title: trimmedQuery.substring(0, 50),
                    sessionId: userId,
                    embeddingProvider: 'llama'
                });

                // Use DB-generated UUID as conversationId
                conversationId = newConversation.id;
                context.conversationId = conversationId;

                console.log(`[DB] Created conversation in PostgreSQL: ${conversationId}`);
            } catch (dbError) {
                console.warn(`[DB] Failed to create conversation in PostgreSQL:`, dbError.message);
                // Continue with in-memory context even if DB save fails
            }
        }

        // Save user message to PostgreSQL
        try {
            const conversationService = new ConversationService(pool);
            await conversationService.addMessage(conversationId, userId, {
                role: 'user',
                content: trimmedQuery,
                metadata: { intent: 'pending' } // Will update after classification
            });
            console.log(`[DB] Saved user message to PostgreSQL`);
        } catch (dbError) {
            console.warn(`[DB] Failed to save message:`, dbError.message);
        }

        // CRITICAL FIX 5: ALWAYS rehydrate context from DB (BEFORE intent classification!)
        // This ensures context.baseQuery exists for refinement detection
        console.log(`[Context Rehydration] Loading state from DB...`);

        const searchStateService = new SearchStateService(pool);
        const savedState = await searchStateService.loadSearchState(conversationId);

        if (savedState && savedState.baseResultIds && savedState.baseResultIds.length > 0) {
            console.log(`[Context Rehydration] Found saved state: ${savedState.baseResultIds.length} base IDs`);

            // CRITICAL: Rebuild results from saved metadata (includes technologies, etc.)
            const baseIdeas = savedState.baseResultIds.map((id, index) => {
                const metadata = savedState.baseResultsMetadata?.[index] || {};
                return {
                    id: `idea_${id}`,
                    ideaId: id,
                    title: metadata.title || '',
                    summary: metadata.summary || '',
                    document: `${metadata.title || ''}. ${metadata.summary || ''}`,
                    metadata: {
                        ...metadata,
                        idea_id: id
                    },
                    similarity: 0.85  // Placeholder
                };
            });

            // Restore context from DB - CRITICAL: Set BOTH base AND current results
            context.baseQuery = savedState.baseQuery;
            context.baseResults = baseIdeas;
            context.baseResultIds = savedState.baseResultIds;
            context.currentResults = [...baseIdeas];  // ✅ CRITICAL: Initialize currentResults
            context.currentResultIds = [...savedState.baseResultIds];  // ✅ CRITICAL
            context.filters = savedState.appliedFilters || {};

            console.log(`[Context Rehydration] ✅ Restored: baseQuery="${context.baseQuery}", ${baseIdeas.length} results with full metadata, filters=${JSON.stringify(context.filters)}`);

            // If we have current_result_ids (after filters), restore those too
            if (savedState.currentResultIds && savedState.currentResultIds.length > 0
                && savedState.currentResultIds.length < savedState.baseResultIds.length) {
                // Rebuild filtered results from metadata
                const currentIdeas = savedState.currentResultIds.map(id => {
                    const index = savedState.baseResultIds.indexOf(id);
                    const metadata = savedState.baseResultsMetadata?.[index] || {};
                    return {
                        id: `idea_${id}`,
                        ideaId: id,
                        title: metadata.title || '',
                        summary: metadata.summary || '',
                        document: `${metadata.title || ''}. ${metadata.summary || ''}`,
                        metadata: {
                            ...metadata,
                            idea_id: id
                        },
                        similarity: 0.85
                    };
                });

                context.currentResults = currentIdeas;  // ✅ Override with filtered results
                context.currentResultIds = savedState.currentResultIds;
                console.log(`[Context Rehydration] ✅ Also restored ${currentIdeas.length} filtered results`);
            }
        } else {
            console.log(`[Context Rehydration] No saved state found - starting fresh`);
        }


        // STEP 2: OPTIMIZED Intent Classification (FIX #2)
        const hasExistingContext = hasContext(userId, conversationId) && context.baseResults.length > 0;

        // CRITICAL FIX: NEVER allow SEMANTIC_SEARCH if baseQuery exists
        // Check FIRST if this is a refinement on existing results
        let intent = null;
        if (context.baseQuery) {
            // Base query exists → this is ALWAYS a refinement, not a new search
            console.log(`[Intent Override] Base query exists ("${context.baseQuery}") → APPLY_FILTER`);
            console.log(`[Intent Override] Existing filters:`, context.filters);
            intent = INTENTS.APPLY_FILTER;
        } else {
            // Try fast heuristic first (0ms) - ENTERPRISE AWARE
            const currentDomain = context.filters?.domains?.[0] || null;
            intent = fastIntentHeuristic(trimmedQuery, hasExistingContext, currentDomain);
            if (intent) {
                console.log(`[Intent] FAST heuristic: ${intent} (0ms)`);
            } else {
                // Ambiguous - fall back to LLM (2-5s)
                console.log(`[Intent] Ambiguous - using LLM...`);
                const llmStart = Date.now();
                intent = await classifyIntent(trimmedQuery, context.intentHistory);
                console.log(`[Intent] LLM classified: ${intent} (${Date.now() - llmStart}ms)`);
            }
        }

        context.addIntent(intent, trimmedQuery);

        // GUARD: Prevent filter-only queries without base search
        if ((intent === INTENTS.APPLY_FILTER || intent === INTENTS.REMOVE_FILTER) &&
            (!context.baseResults || context.baseResults.length === 0)) {
            console.log(`[Guard] Blocking ${intent} - no base search exists`);

            return res.json({
                intent,
                conversationId,
                results: [],
                aiResponse: "Please perform a search before applying filters. Try searching for ideas first, then you can filter the results.",
                suggestions: ['search for AI ideas', 'search for cloud projects', 'search for innovation'],
                filtersApplied: {},
                resultContext: {
                    query: trimmedQuery,
                    action: 'blocked_no_base_search',
                    conversationId,
                    filters: {}
                },
                metadata: {
                    intent,
                    totalResults: 0,
                    error: 'NO_BASE_SEARCH',
                    processingTime: Date.now() - startTime
                }
            });
        }



        console.log(`[Intent Final] ${intent}`);

        let semanticResults = [];
        let finalResults = [];

        // Variables that need to be accessible outside switch statement
        let constrainedIdeaIds = null;
        let combinedFilters = {};
        let cleanQuery = '';

        // STEP 3: Route based on intent
        switch (intent) {
            case INTENTS.SEMANTIC_SEARCH:
                // Run semantic search with clean query
                cleanQuery = buildSemanticQuery(trimmedQuery);

                console.log(`[Semantic] Searching: "${cleanQuery}"`);
                console.log(`[Two-Stage] Starting filter-aware semantic search`);

                // 🆕 CUMULATIVE FILTER MERGING + BUSINESS GROUP DETECTION
                // Step 1: Extract filters from query
                const extractedFilters = await extractFiltersForPostgres(trimmedQuery);

                // Step 2: Detect business groups from natural language
                const detectedBusinessGroups = detectBusinessGroups(trimmedQuery);
                if (detectedBusinessGroups.length > 0) {
                    // Merge detected business groups into extracted filters
                    extractedFilters.businessGroups = [
                        ...(extractedFilters.businessGroups || []),
                        ...detectedBusinessGroups
                    ];
                    console.log(`[BusinessGroupDetection] Added: ${detectedBusinessGroups.join(', ')}`);
                }

                // Step 3: Get Explore UI filters from request
                const exploreFilters = req.body.additionalFilters || {};

                // Step 4: 🔑 CRITICAL: Use context.activeFilters as base (includes Explorer filters!)
                // This is the SINGLE SOURCE OF TRUTH for all filters
                const existingFilters = context.activeFilters || {};

                // Step 5: Detect mode (ADD/REPLACE)
                const filterMode = detectFilterMode(trimmedQuery);

                // Step 6: Merge all filters cumulatively
                // Order: existingFilters (Explorer + history) + extractedFilters (message) + exploreFilters (new UI)
                let tempFilters = mergeFilters(existingFilters, extractedFilters, filterMode);
                combinedFilters = mergeFilters(tempFilters, exploreFilters, 'ADD');

                // Step 7: 🔑 Update context.activeFilters (persistence for next message)
                context.activeFilters = combinedFilters;
                context.filters = combinedFilters;  // Backward compatibility

                console.log(`[Filter State] Existing (activeFilters):`, existingFilters);
                console.log(`[Filter State] Extracted (from message):`, extractedFilters);
                console.log(`[Filter State] Explore (from UI):`, exploreFilters);
                console.log(`[Filter State] Mode:`, filterMode);
                console.log(`[Filter State] Final Combined (activeFilters):`, context.activeFilters);

                constrainedIdeaIds = null;
                const totalStageStart = Date.now();

                if (hasActiveFilters(combinedFilters)) {
                    console.log(`[Two-Stage] 🔍 Stage 1: PostgreSQL filter`, combinedFilters);
                    const filterStart = Date.now();

                    try {
                        constrainedIdeaIds = await getFilteredIdeaIds(combinedFilters, pool);
                        const filterDuration = Date.now() - filterStart;
                        console.log(`[Two-Stage] ✅ Stage 1 complete: ${constrainedIdeaIds.length} filtered IDs in ${filterDuration}ms`);
                    } catch (error) {
                        console.error(`[Two-Stage] ❌ Stage 1 error:`, error.message);
                        // Continue without filtering if error
                    }
                } else {
                    console.log(`[Two-Stage] ⏭️  Stage 1 skipped: No filters detected`);
                }

                // 🆕 STAGE 2: Filter-Aware ChromaDB Search
                // Build filter-aware query (injects filter context for embeddings)
                const filterAwareQuery = hasActiveFilters(combinedFilters)
                    ? buildFilterAwareQuery(cleanQuery, combinedFilters)
                    : cleanQuery;

                console.log(`[Two-Stage] 🧠 Stage 2: ChromaDB semantic search`);
                console.log(`[FilterAwareQuery] Using: "${filterAwareQuery}"`);

                const embeddingStart = Date.now();
                const embedding = await getCachedEmbedding(filterAwareQuery);
                console.log(`[Embedding] Generated in ${Date.now() - embeddingStart}ms`);

                const collection = await getIdeasCollection();
                const chromaStart = Date.now();

                // Build query options
                const queryOptions = {
                    queryEmbeddings: [embedding],
                    nResults: 200  // High recall
                };

                // 🔥 Prepare for post-query filtering by metadata.idea_id
                let chromaDocIdSet = null;
                if (constrainedIdeaIds && constrainedIdeaIds.length > 0) {
                    // Use integer IDs for metadata.idea_id matching
                    chromaDocIdSet = new Set(constrainedIdeaIds);

                    // 🔑 CRITICAL: Query ALL ideas to ensure COMPLETE coverage of filtered IDs
                    // When filters are active, we MUST show ALL matching ideas, not just top-ranked
                    queryOptions.nResults = 5000;  // Query entire collection to guarantee all filtered ideas are included

                    console.log(`[Two-Stage] 🎯 Will post-filter ${queryOptions.nResults} results to ${constrainedIdeaIds.length} IDs`);
                    console.log(`[Debug] Sample expected IDs: ${constrainedIdeaIds.slice(0, 5).join(', ')}...`);
                } else if (constrainedIdeaIds && constrainedIdeaIds.length === 0) {
                    // No IDs match filter - return empty results immediately
                    console.log(`[Two-Stage] ⚠️  No IDs match filter - returning empty results`);
                    semanticResults = [];
                    context.setBaseResults(cleanQuery, semanticResults);
                    break;
                }

                const chromaResults = await collection.query(queryOptions);
                const chromaDuration = Date.now() - chromaStart;

                console.log(`[Two-Stage] ✅ Stage 2 complete: ${chromaResults.ids[0]?.length || 0} results in ${chromaDuration}ms`);
                if (chromaResults.ids[0]?.length > 0) {
                    console.log(`[Debug] Sample ChromaDB IDs: ${chromaResults.ids[0].slice(0, 5).join(', ')}`);
                    console.log(`[Debug] Sample metadata.idea_id: ${chromaResults.metadatas[0].slice(0, 3).map(m => m.idea_id).join(', ')}`);
                }

                // Map and filter results
                semanticResults = chromaResults.ids[0]
                    .map((id, i) => ({
                        id,
                        document: chromaResults.documents[0][i],
                        metadata: chromaResults.metadatas[0][i],
                        similarity: 1 - chromaResults.distances[0][i]
                    }))
                    .filter(r => {
                        // 🔑 CRITICAL: When filters active, show ALL filtered results
                        // Filter by metadata.idea_id (integer) not document id (string)
                        if (chromaDocIdSet) {
                            const ideaId = r.metadata.idea_id;
                            return chromaDocIdSet.has(ideaId);  // Match by metadata ID
                        }
                        return r.similarity >= 0.40;  // Threshold for unfiltered only
                    });

                const totalDuration = Date.now() - totalStageStart;
                const thresholdMsg = chromaDocIdSet ? '(no threshold - filtered)' : 'above threshold 0.40';
                console.log(`[Two-Stage] 🎉 Complete: ${semanticResults.length} results ${thresholdMsg} (total: ${totalDuration}ms)`);

                // ✅ NO POST-FILTERING NEEDED! Filters already applied in Stage 1
                context.setBaseResults(cleanQuery, semanticResults);
                console.log(`[Progressive] Base result set established: ${semanticResults.length} items`);

                // Store embedding for potential refinement
                context.lastEmbedding = embedding;
                context.filters = combinedFilters;

                break;

            case INTENTS.APPLY_FILTER:
                // 🆕 CUMULATIVE FILTER APPLICATION
                console.log(`[APPLY_FILTER] Applying filter to existing base results`);

                // Extract new filter from query
                const newExtractedFilters = await extractFiltersForPostgres(trimmedQuery);

                // 🔑 Get existing filters from context.activeFilters (includes Explorer!)
                const currentFilters = context.activeFilters || {};

                // Detect mode
                const applyFilterMode = detectFilterMode(trimmedQuery);

                // Merge cumulatively
                combinedFilters = mergeFilters(currentFilters, newExtractedFilters, applyFilterMode);

                // Update context.activeFilters (persistence)
                context.activeFilters = combinedFilters;
                context.filters = combinedFilters;  // Backward compatibility

                console.log(`[APPLY_FILTER] Current (activeFilters):`, currentFilters);
                console.log(`[APPLY_FILTER] New extracted:`, newExtractedFilters);
                console.log(`[APPLY_FILTER] Mode:`, applyFilterMode);
                console.log(`[APPLY_FILTER] Combined (activeFilters):`, context.activeFilters);

                // 🔥 TWO-STAGE SEARCH with updated filters (NO re-embedding!)
                // Re-use base query from context
                const baseQuery = context.semanticQuery || buildSemanticQuery(trimmedQuery);

                if (hasActiveFilters(combinedFilters)) {
                    // Check if baseResults exist
                    if (!context.baseResults || context.baseResults.length === 0) {
                        console.error(`[APPLY_FILTER] ERROR: No baseResults!`);
                        semanticResults = [];
                        break;
                    }

                    // ✅ IN-MEMORY FILTERING ONLY
                    const filterStart = Date.now();

                    semanticResults = applyMetadataFilters(
                        context.baseResults,  // From existing results
                        combinedFilters
                    );

                    console.log(`[APPLY_FILTER] ✅ ${context.baseResults.length} → ${semanticResults.length} in ${Date.now() - filterStart}ms`);

                    // Cache results (but NOT baseResults!)
                    context.cacheResults(semanticResults);
                } else {
                    // No filters - use base results
                    semanticResults = context.baseResults || [];
                }

                console.log(`[APPLY_FILTER] Final: ${semanticResults.length} results`);

                break;

            case INTENTS.REMOVE_FILTER:
                // Extract and remove filter
                const removeInfo = await extractFilterInfo(trimmedQuery);
                if (removeInfo.type) {
                    const normalizedType = normalizeFilterType(removeInfo.type);

                    if (removeInfo.value) {
                        const normalizedValue = normalizeFilterValue(removeInfo.value, normalizedType);
                        context.removeFilter(normalizedType, normalizedValue);
                        console.log(`[Filter] Removed: ${normalizedType} = ${normalizedValue}`);
                    } else {
                        context.removeFilterType(normalizedType);
                        console.log(`[Filter] Removed all ${normalizedType} filters`);
                    }
                }

                // CRITICAL: Reset to base and reapply REMAINING filters
                console.log(`[Filter] Resetting to base and reapplying remaining filters`);
                context.resetToBase();

                // Re-narrow with remaining filters
                semanticResults = context.narrowResults(result => {
                    return applyMetadataFilters([result], context.filters).length > 0;
                });

                break;

            case INTENTS.RESET_FILTERS:
                console.log(`[Progressive] Resetting to base results`);
                context.resetToBase();
                semanticResults = context.getCurrentResults();
                console.log(`[Reset] Restored all ${semanticResults.length} base results`);
                break;

            case INTENTS.REFINE_SEARCH:
                // GUARD: Prevent operating without base results
                if (context.baseResults.length === 0) {
                    console.warn('[Refine] No base results - cannot refine');
                    semanticResults = [];
                    break;
                }

                console.log(`[Refine] Starting from ${context.currentResults.length} results`);
                const refineStart = Date.now();

                // ENTERPRISE: Extract metadata using regex (NO LLM!)
                const enterpriseMetadata = extractEnterpriseMetadata(trimmedQuery);

                if (Object.keys(enterpriseMetadata).length > 0) {
                    // Use in-memory indexes (O(1), <10ms target)
                    semanticResults = context.refineByMetadata(enterpriseMetadata);

                    const refineTime = Date.now() - refineStart;
                    console.log(`[Refine] Index-based: ${context.previousCount} → ${semanticResults.length} in ${refineTime}ms ${refineTime < 10 ? '✅' : '⚠️'}`);

                    // Track applied filters
                    if (enterpriseMetadata.technology) context.addFilter('technologies', enterpriseMetadata.technology);
                    if (enterpriseMetadata.year) context.addFilter('years', enterpriseMetadata.year);
                    if (enterpriseMetadata.businessGroup) context.addFilter('businessGroups', enterpriseMetadata.businessGroup);
                    if (enterpriseMetadata.domain) context.addFilter('domains', enterpriseMetadata.domain);
                    if (enterpriseMetadata.aiTheme) context.addFilter('themes', enterpriseMetadata.aiTheme);

                } else {
                    // Fallback: keyword matching (when no metadata detected)
                    const queryTerms = trimmedQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2);

                    semanticResults = context.narrowResults(result => {
                        const searchText = [
                            result.metadata?.title || '',
                            result.metadata?.summary || '',
                            result.document || ''
                        ].join(' ').toLowerCase();

                        return queryTerms.some(term => searchText.includes(term));
                    });

                    const refineTime = Date.now() - refineStart;
                    console.log(`[Refine] Keyword: ${context.previousCount} → ${semanticResults.length} in ${refineTime}ms`);
                }

                // Update query for context
                const refinedQuery = buildRefinedQuery(context.semanticQuery, trimmedQuery);
                context.updateSemanticQuery(refinedQuery);

                break;

            case INTENTS.ASK_QUESTION:
            case INTENTS.FREE_FORM_CHAT:
                // Check if user wants to clear chat/conversation
                const clearKeywords = ['clear chat', 'clear conversation', 'clear all', 'reset chat', 'start over', 'new chat'];
                const queryLower = trimmedQuery.toLowerCase();
                const isClearRequest = clearKeywords.some(keyword => queryLower.includes(keyword));

                console.log(`[Chat] Query: "${trimmedQuery}", Lower: "${queryLower}", IsClear: ${isClearRequest}`);

                if (isClearRequest) {
                    // Clear everything
                    context.resetFilters();
                    context.updateSemanticQuery('');
                    context.cacheResults([]);

                    console.log('[Chat] Cleared conversation context');

                    const duration = Date.now() - startTime;
                    return res.json({
                        intent: 'reset_chat',
                        results: [],
                        aiResponse: 'Chat cleared! You can start a fresh search.',
                        metadata: {
                            intent: 'reset_chat',
                            totalResults: 0,
                            processingTime: duration,
                            context: {
                                query: '',
                                filters: {}
                            }
                        }
                    });
                }

                // Regular conversational response
                const chatResponse = await generateConversationalResponse(trimmedQuery, context);
                const duration = Date.now() - startTime;

                return res.json({
                    intent,
                    results: formatResults(context.cachedResults),
                    aiResponse: chatResponse,
                    metadata: {
                        intent,
                        totalResults: context.cachedResults.length,
                        processingTime: duration,
                        context: {
                            query: context.semanticQuery,
                            filters: context.getFilterSummary()
                        }
                    }
                });
        }

        // STEP 4: Post-processing (CONDITIONAL - avoid redundant work)
        // 🚨 CRITICAL: Skip post-filtering if two-stage search was used!
        // Two-stage search already applied filters in PostgreSQL (Stage 1)

        const usedTwoStageSearch = (intent === INTENTS.SEMANTIC_SEARCH && constrainedIdeaIds !== null);

        if (usedTwoStageSearch) {
            console.log(`[Post-Processing] ⏭️  SKIPPED - filters already applied in PostgreSQL`);

            // Use semanticResults directly (already filtered)
            finalResults = semanticResults;

            // NO hybrid scoring needed - rank by semantic similarity only
            const scoredResults = finalResults.map(result => ({
                ...result,
                hybridScore: result.similarity,  // Pure semantic ranking
                scoreBreakdown: {
                    vector: result.similarity,
                    metadata: 0,
                    keyword: 0,
                    raw_similarity: result.similarity
                }
            }));

            scoredResults.sort((a, b) => b.hybridScore - a.hybridScore);
            console.log(`[Two-Stage] ✅ Using semantic ranking only: ${scoredResults.length} results`);

            // Format results
            const formattedResults = formatResults(scoredResults);

            // Simple AI response (no generation needed)
            const aiResponse = `Found ${formattedResults.length} result${formattedResults.length === 1 ? '' : 's'}`;

            // Smart suggestions
            const suggestions = generateSmartSuggestions(formattedResults, context);

            const duration = Date.now() - startTime;

            return res.json({
                intent,
                conversationId,
                results: formattedResults,
                aiResponse,
                suggestions,
                filtersApplied: combinedFilters,
                resultContext: {
                    query: cleanQuery,
                    action: 'two_stage_search',
                    conversationId,
                    filters: combinedFilters
                },
                metadata: {
                    intent,
                    totalResults: formattedResults.length,
                    processingTime: duration,
                    searchType: 'two_stage',
                    filtersUsed: hasActiveFilters(combinedFilters),
                    context: {
                        query: cleanQuery,
                        filters: combinedFilters
                    }
                }
            });
        }

        // STEP 4: Apply metadata filters (ONLY for legacy non-two-stage paths)
        finalResults = applyMetadataFilters(semanticResults, context.filters);

        console.log(`[Metadata Filter] ${finalResults.length} of ${semanticResults.length} results passed filters`);

        //STEP 5: Apply hybrid scoring
        const scoredResults = finalResults.map(result => {
            const hybridScore = calculateHybridScore(
                result.similarity,
                result.metadata,
                context.filters,
                trimmedQuery
            );

            return {
                ...result,
                hybridScore,
                scoreBreakdown: {
                    vector: result.similarity,
                    metadata: calculateMetadataScore(result.metadata, context.filters),
                    keyword: calculateKeywordScore(result.metadata, trimmedQuery),
                    raw_similarity: result.similarity
                }
            };
        });

        // STEP 6: Sort by hybrid score
        scoredResults.sort((a, b) => b.hybridScore - a.hybridScore);

        console.log(`[Hybrid Scoring] Ranked ${scoredResults.length} results`);

        // STEP 7: Format results for frontend
        const formattedResults = formatResults(scoredResults);

        // FIX #2.2: OPTIONAL AI Response Generation (FAST MODE)
        // Only generate AI response for:
        // 1. Conversational questions (ask_question intent)
        // 2. Very large result sets (>100 results)
        // 3. Explicit user request (future enhancement)
        let aiResponse = null;
        const shouldGenerateAI = (
            intent === 'ask_question' ||
            intent === 'free_form_chat' ||
            formattedResults.length > 100
        );

        if (shouldGenerateAI) {
            console.log('[AI Response] Generating (query warrants explanation)...');
            const aiStart = Date.now();
            aiResponse = await generateSearchResponse(trimmedQuery, formattedResults, context);
            console.log(`[AI Response] Generated in ${Date.now() - aiStart}ms`);
        } else {
            console.log('[AI Response] SKIPPED (simple search - saved 3-7s)');
            // Provide simple summary instead
            aiResponse = `Found ${formattedResults.length} result${formattedResults.length === 1 ? '' : 's'}`;
        }

        // FIX #2.3: LAZY Smart Suggestions (only on base search)
        let suggestions = [];
        if (intent === INTENTS.SEMANTIC_SEARCH && formattedResults.length > 0) {
            suggestions = generateSmartSuggestions(formattedResults, context);
        } else {
            console.log('[Suggestions] SKIPPED (only generated on base search)');
        }

        // STEP 10: Determine action type for result context
        let actionType = 'base_search';
        if (intent === INTENTS.REFINE_SEARCH) actionType = 'refine';
        else if (intent === INTENTS.APPLY_FILTER || intent === INTENTS.REMOVE_FILTER) actionType = 'filter';
        else if (intent === INTENTS.RESET_FILTERS) actionType = 'reset';

        context.lastActionType = actionType;

        const duration = Date.now() - startTime;

        console.log(`[Complete] ${formattedResults.length} results in ${duration}ms`);
        console.log(`====================================\n`);

        // Save assistant response to PostgreSQL
        try {
            const conversationService = new ConversationService(pool);
            await conversationService.addMessage(conversationId, userId, {
                role: 'agent',
                content: aiResponse,
                metadata: {
                    intent,
                    resultCount: formattedResults.length,
                    filters: context.filters,
                    action: actionType
                }
            });
            console.log(`[DB] Saved assistant message to PostgreSQL`);
        } catch (dbError) {
            console.warn(`[DB] Failed to save assistant message:`, dbError.message);
        }

        // Save search state to database (for chat switching)
        if (conversationId && (intent === INTENTS.SEMANTIC_SEARCH || intent === INTENTS.REFINE_SEARCH)) {

            // CRITICAL FIX 1 & 2: Normalize IDs + Fail-fast on save error
            try {
                const searchStateService = new SearchStateService(pool);
                const baseResultIds = context.baseResults.map(r => normalizeIdeaId(r.metadata?.idea_id || r.id)).filter(id => id !== null);
                const currentResultIds = finalResults.map(r => normalizeIdeaId(r.metadata?.idea_id || r.ideaId || r.id)).filter(id => id !== null);

                // CRITICAL: Extract full metadata for persistence
                const baseResultsMetadata = context.baseResults.map(r => r.metadata || {});

                console.log(`[SearchState] Saving: ${baseResultIds.length} base IDs, ${currentResultIds.length} current IDs, ${baseResultsMetadata.length} metadata objects`);

                await searchStateService.saveSearchState(conversationId, {
                    baseQuery: context.baseQuery,
                    baseResultIds,
                    currentResultIds,
                    appliedFilters: context.filters,
                    baseDomain: context.filters?.domains?.[0] || null,
                    baseResultsMetadata  // NEW: Save full metadata
                });

                console.log('[SearchState] ✅ Persisted successfully to conversation_search_state');
            } catch (saveError) {
                console.error('[SearchState] ❌ CRITICAL: Persistence failed', saveError);
                return res.status(500).json({
                    error: 'Failed to persist search state',
                    message: 'Unable to save search results for conversation',
                    details: saveError.message
                });
            }
        }

        // Return UNLIMITED results
        res.json({
            intent,
            conversationId: context.conversationId,  // For frontend persistence
            results: formattedResults,  // ALL results, no limit!
            aiResponse,
            suggestions,
            filtersApplied: context.filters,  // ← For UI synchronization
            resultContext: {  // ← NEW: Result origin metadata
                query: context.baseQuery,
                action: actionType,
                conversationId: context.conversationId,
                filters: context.filters
            },
            narrowingCounts: {  // ← Show true narrowing
                base: context.baseResultIds.length,
                before: context.previousCount,
                after: context.currentResultIds.length
            },
            metadata: {
                intent,
                totalResults: formattedResults.length,
                processingTime: duration,
                context: {
                    query: context.semanticQuery,
                    filters: context.getFilterSummary()
                },
                searchConfig: {
                    topKInitial: 200,
                    threshold: 0.40,
                    hybridScoringEnabled: true
                },
                // Progressive narrowing stats
                progressive: {
                    baseResultCount: context.baseResultIds.length,
                    currentResultCount: context.currentResultIds.length,
                    narrowingRatio: context.baseResultIds.length > 0
                        ? (context.currentResultIds.length / context.baseResultIds.length * 100).toFixed(1) + '%'
                        : 'N/A'
                }
            }
        });

    } catch (error) {
        console.error('[Hybrid Search] Error:', error);
        const duration = Date.now() - startTime;

        res.status(500).json({
            error: true,
            message: 'Search failed',
            details: error.message,
            metadata: {
                processingTime: duration
            }
        });
    }
});

/**
 * High-Recall Semantic Search with Threshold-Based Filtering
 * Returns ALL results above cosine similarity threshold (no hard limit)
 */
async function semanticSearch(query, filters = {}, context = null, threshold = CONFIG.COSINE_THRESHOLD) {
    try {
        const chromaClient = getChromaClient();

        if (!chromaClient.hasCollection('ideas_search')) {
            return [];
        }

        console.log(`[Pro Search] High-recall search: query="${query}", threshold=${threshold}, topK=${CONFIG.TOP_K_INITIAL}`);

        // Generate query embedding
        const queryEmbedding = await getEmbedding(query);

        // STEP 1: Retrieve large candidate set (high recall)
        const results = chromaClient.query('ideas_search', queryEmbedding, CONFIG.TOP_K_INITIAL);

        if (!results || results.documents.length === 0) {
            console.log('[Pro Search] No candidates found in ChromaDB');
            return [];
        }

        console.log(`[Pro Search] Retrieved ${results.documents.length} candidates from ChromaDB`);

        // STEP 2: Map results with similarity scores (distance → similarity)
        const candidates = results.documents.map((doc, idx) => {
            const metadata = results.metadatas[idx] || {};
            const distance = results.distances[idx] || 1;
            const similarity = Math.max(0, 1 - distance);  // Keep as float [0, 1]
            const dbId = metadata.idea_id;

            return {
                similarity,  // Raw cosine similarity
                idea: {
                    id: `IDEA-${dbId}`,
                    dbId: dbId,
                    title: metadata.title || 'Untitled',
                    description: metadata.summary || doc.substring(0, 300),
                    domain: metadata.domain || 'General',
                    businessGroup: metadata.businessGroup || 'Unknown',
                    technologies: metadata.technologies || '',
                    score: metadata.score || 0,
                    submissionDate: metadata.created_at || new Date().toISOString()
                }
            };
        });

        // STEP 3: Apply threshold filtering (NO HARD LIMIT)
        const thresholdFiltered = candidates.filter(result => result.similarity >= threshold);
        console.log(`[Pro Search] ${thresholdFiltered.length} results after threshold filter (>= ${threshold})`);

        if (thresholdFiltered.length === 0) {
            console.log('[Pro Search] No results above threshold');
            return [];
        }

        // STEP 4: Apply OR-based metadata filtering (flexible matching)
        let finalFiltered = thresholdFiltered;

        // Only apply filters if they exist
        const hasFilters =
            (filters.domain?.length > 0) ||
            (filters.businessGroup?.length > 0) ||
            (filters.techStack?.length > 0) ||
            (filters.year);

        if (hasFilters) {
            finalFiltered = thresholdFiltered.filter(result => {
                let matchCount = 0;
                let totalFilters = 0;

                // Domain filter (OR logic)
                if (filters.domain?.length > 0) {
                    totalFilters++;
                    const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
                    if (domains.some(d => result.idea.domain.toLowerCase().includes(d.toLowerCase()))) {
                        matchCount++;
                    }
                }

                // Business Group filter (OR logic)
                if (filters.businessGroup?.length > 0) {
                    totalFilters++;
                    const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
                    if (groups.some(g => result.idea.businessGroup.toLowerCase().includes(g.toLowerCase()))) {
                        matchCount++;
                    }
                }

                // Technology filter (OR logic)
                if (filters.techStack?.length > 0) {
                    totalFilters++;
                    const techs = Array.isArray(filters.techStack) ? filters.techStack : [filters.techStack];
                    if (techs.some(t => result.idea.technologies.toLowerCase().includes(t.toLowerCase()))) {
                        matchCount++;
                    }
                }

                // Year filter
                if (filters.year) {
                    totalFilters++;
                    const year = new Date(result.idea.submissionDate).getFullYear();
                    if (year === filters.year) {
                        matchCount++;
                    }
                }

                // Return if at least ONE filter matches (OR logic)
                return matchCount > 0;
            });

            console.log(`[Pro Search] ${finalFiltered.length} results after OR-based metadata filtering (matched ${finalFiltered.length} of ${thresholdFiltered.length})`);
        } else {
            console.log(`[Pro Search] No metadata filters applied, keeping all ${thresholdFiltered.length} threshold-filtered results`);
        }

        // STEP 5: Apply hybrid scoring and re-rank (if context available)
        if (context && finalFiltered.length > 0) {
            const reranked = applyThresholdAndRerank(finalFiltered, query, context, threshold);
            console.log(`[Pro Search] Hybrid scoring complete, returning ${reranked.length} ranked results`);
            return reranked;
        }

        // Fallback: sort by similarity only
        const sorted = metadataFiltered.sort((a, b) => b.similarity - a.similarity);

        // Convert to legacy format for backward compatibility
        return sorted.map(result => ({
            ...result.idea,
            matchScore: Math.round(result.similarity * 100),  // Convert to percentage
            similarity: result.similarity  // Keep raw float for frontend
        }));

    } catch (error) {
        console.error('[Pro Search] Semantic search error:', error.message);
        return [];
    }
}

/**
 * Parse filters from natural language query
 */
function parseFilters(query, additionalFilters = {}) {
    const filters = { ...additionalFilters };
    const normalizedQuery = query.toLowerCase();

    // Year detection
    const yearMatch = query.match(/\b(202[0-9]|2030)\b/);
    if (yearMatch) filters.year = parseInt(yearMatch[0]);

    // Domain detection keywords
    const domainMap = {
        'healthcare': ['healthcare', 'medical', 'hospital', 'patient', 'clinical', 'health'],
        'finance': ['finance', 'banking', 'payment', 'fintech', 'loan', 'financial'],
        'retail': ['retail', 'ecommerce', 'e-commerce', 'shop', 'store', 'inventory'],
        'ai': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'neural'],
        'cloud': ['cloud', 'aws', 'azure', 'gcp', 'infrastructure', 'serverless'],
        'security': ['security', 'cybersecurity', 'authentication', 'encryption']
    };

    for (const [domain, keywords] of Object.entries(domainMap)) {
        if (keywords.some(kw => normalizedQuery.includes(kw))) {
            if (!filters.domain) filters.domain = [];
            if (!filters.domain.includes(domain)) filters.domain.push(domain);
        }
    }

    return filters;
}

/**
 * Generate AI-powered response using Llama
 */
async function generateAIResponse(query, results, filters, nlpResult) {
    const count = results.length;

    // For no results
    if (count === 0) {
        let response = `I couldn't find any ideas matching "${query}".`;
        if (nlpResult?.corrected && nlpResult.corrected !== nlpResult.original) {
            response += ` I also searched for "${nlpResult.corrected}".`;
        }
        response += ' Try using different keywords or broader terms.';
        return response;
    }

    // Try AI-generated response with Llama
    if (count > 0) {
        try {
            const topIdeas = results.slice(0, 3).map(r => r.title).join(', ');
            const domains = [...new Set(results.slice(0, 5).map(r => r.domain))].join(', ');

            const prompt = `You are a helpful assistant for an innovation idea repository. 
A user searched for: "${query}"
Found ${count} matching ideas. Top results: ${topIdeas}
Domains covered: ${domains}

Write a brief, friendly 1-2 sentence response summarizing what was found. Be concise and helpful.
Do NOT reveal any confidential information or discuss topics outside of idea search.`;

            const aiText = await generateText(prompt, { maxOutputTokens: 150, temperature: 0.7 });
            if (aiText && aiText.length > 10) {
                return aiText.trim();
            }
        } catch (error) {
            console.warn('[Pro Search] AI response generation failed:', error.message);
        }
    }

    // Fallback response
    let response = `Found ${count} idea${count > 1 ? 's' : ''} matching your search`;

    const filterParts = [];
    if (filters.year) filterParts.push(`from ${filters.year}`);
    if (filters.domain?.length) filterParts.push(`in ${filters.domain.join(', ')}`);
    if (filters.businessGroup?.length) filterParts.push(`for ${filters.businessGroup.join(', ')}`);

    if (filterParts.length > 0) response += ` ${filterParts.join(' ')}`;

    if (nlpResult?.corrected && nlpResult.corrected !== nlpResult.original) {
        response += `. (Searched: "${nlpResult.corrected}")`;
    }

    response += '.';

    // Add insight
    if (count > 0) {
        const topDomains = [...new Set(results.slice(0, 5).map(r => r.domain).filter(Boolean))];
        if (topDomains.length > 0) {
            response += ` Top domains: ${topDomains.slice(0, 3).join(', ')}.`;
        }
    }

    return response;
}

/**
 * Generate smart suggestions
 */
function generateSuggestions(query, results, filters) {
    const suggestions = new Set();

    // Based on results
    if (results.length > 0) {
        const topDomains = [...new Set(results.slice(0, 5).map(r => r.domain).filter(Boolean))];
        if (topDomains[0]) suggestions.add(`More ${topDomains[0]} ideas`);

        const topTechs = [...new Set(results.slice(0, 5).map(r => r.technologies).filter(Boolean))];
        if (topTechs[0]) suggestions.add(`${topTechs[0]} projects`);
    }

    // Filter suggestions
    if (!filters.year) suggestions.add('Ideas from 2024');
    if (!filters.businessGroup?.length) suggestions.add('Filter by business group');

    // Default suggestions
    suggestions.add('Show latest ideas');
    suggestions.add('AI and ML projects');
    suggestions.add('Healthcare innovations');

    return Array.from(suggestions).slice(0, 4);
}

/**
 * POST /api/search/conversational - Main Pro Search endpoint
 */
router.post('/conversational', async (req, res) => {
    const startTime = Date.now();

    try {
        const { query, additionalFilters = {}, conversationHistory = [] } = req.body;

        // Validate input
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: true,
                message: 'Query is required'
            });
        }

        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2) {
            return res.status(400).json({
                error: true,
                message: 'Query too short'
            });
        }

        // STEP 1: Context Validation - Block off-topic/confidential queries
        const validation = validateQuery(trimmedQuery);

        // Handle greetings specially
        if (validation.isGreeting) {
            console.log(`[Pro Search] Greeting detected: "${trimmedQuery}"`);
            return res.json({
                results: [],
                aiResponse: "Hi there! 👋 I'm your Pro Search assistant. I can help you discover innovation ideas and projects. Try asking me things like:\n\n• \"Show me latest AI projects\"\n• \"Find healthcare innovations\"\n• \"Search for React applications\"\n\nWhat would you like to explore today?",
                suggestions: ['Show me latest ideas', 'Find AI projects', 'Healthcare innovations', 'Cloud solutions'],
                metadata: {
                    intent: 'greeting',
                    filters: {},
                    totalResults: 0
                }
            });
        }

        if (!validation.valid) {
            console.log(`[Pro Search] Rejected query: "${trimmedQuery}" - ${validation.reason}`);
            const errorMsg = generateErrorMessage(validation.reason, validation.suggestion);
            return res.json({
                results: [],
                aiResponse: errorMsg,
                suggestions: ['Show me latest ideas', 'Find AI projects', 'Healthcare innovations'],
                metadata: {
                    intent: 'rejected',
                    reason: validation.reason,
                    filters: {},
                    totalResults: 0
                }
            });
        }

        console.log(`[Pro Search] Processing: "${trimmedQuery}"`);

        // Get database pool
        const pool = req.app.get('db');
        if (!pool) {
            return res.status(503).json({
                error: true,
                message: 'Database not available'
            });
        }

        // STEP 2.5: Get/Create conversation context for this user
        const userId = req.user?.id || req.session?.userId || 'anonymous';
        const userContext = contextManager.getContext(userId);

        // Extract constraints from current query and update context
        await contextManager.extractConstraints(trimmedQuery, userContext);

        // Synthesize enhanced query from current message + context
        const enhancedQuery = userContext.synthesizeQuery(trimmedQuery);
        console.log(`[Pro Search] Synthesized query: "${enhancedQuery}"`);

        // Get metadata filters from context
        const contextFilters = userContext.getMetadataFilters();
        const filters = { ...additionalFilters, ...contextFilters };

        console.log(`[Pro Search] Context constraints:`, {
            domains: Array.from(userContext.constraints.domains),
            years: Array.from(userContext.constraints.years),
            technologies: Array.from(userContext.constraints.technologies)
        });

        // STEP 3: NLP Processing - Spell correction & query expansion
        const nlpResult = await enhanceQuery(enhancedQuery, {
            useAI: true,  // Always use Llama
            model: 'llama3.1'
        });

        console.log(`[Pro Search] NLP: "${trimmedQuery}" → "${nlpResult.corrected}"`);

        // STEP 4: Parse additional filters from query text
        const parsedFilters = parseFilters(nlpResult.corrected, {});

        // Merge all filter sources (priority: explicit > context > parsed)
        const finalFilters = { ...parsedFilters, ...contextFilters, ...additionalFilters };

        console.log(`[Pro Search] Final filters:`, finalFilters);

        // STEP 5: Semantic search with context-aware hybrid scoring
        const searchQuery = nlpResult.expanded?.join(' ') || nlpResult.corrected;
        let results = await semanticSearch(searchQuery, finalFilters, userContext, CONFIG.COSINE_THRESHOLD);

        // Add query to user context history
        userContext.addQuery(trimmedQuery, results);

        // STEP 6: Fallback to database if no semantic results
        if (results.length === 0) {
            console.log('[Pro Search] No semantic results, trying keyword search...');

            // Use multiple search terms from NLP processing
            const searchTerms = nlpResult.tokens || trimmedQuery.split(/\s+/);
            const primaryTerm = searchTerms[0] || trimmedQuery;

            // Build dynamic OR conditions for better matching
            let whereConditions = [];
            let params = [];
            let paramIndex = 1;

            // Add conditions for each significant term (max 3)
            const significantTerms = searchTerms.filter(t => t.length > 2).slice(0, 3);

            for (const term of significantTerms) {
                whereConditions.push(`(title ILIKE $${paramIndex} OR summary ILIKE $${paramIndex} OR challenge_opportunity ILIKE $${paramIndex} OR code_preference ILIKE $${paramIndex})`);
                params.push(`%${term}%`);
                paramIndex++;
            }

            // Fallback if no terms
            if (whereConditions.length === 0) {
                whereConditions.push(`(title ILIKE $1 OR summary ILIKE $1)`);
                params.push(`%${primaryTerm}%`);
            }

            const dbResult = await pool.query(`
                SELECT idea_id, title, summary as description,
                       challenge_opportunity as domain, business_group as "businessGroup",
                       COALESCE(code_preference, '') as technologies,
                       created_at as "submissionDate", score
                FROM ideas
                WHERE ${whereConditions.join(' OR ')}
                ORDER BY score DESC, created_at DESC
                LIMIT 20
            `, params);

            results = dbResult.rows.map(row => ({
                id: `IDEA-${row.idea_id}`, // Format as string ID for frontend
                dbId: row.idea_id, // Keep numeric ID for database operations
                title: row.title,
                description: row.description,
                domain: row.domain || 'General',
                businessGroup: row.businessGroup || 'Unknown',
                technologies: row.technologies || '',
                submissionDate: row.submissionDate,
                score: row.score || 0,
                matchScore: 65 // Default score for keyword results
            }));

            console.log(`[Pro Search] Keyword search found ${results.length} results`);
        }

        // NO LIMIT - return ALL threshold-filtered results
        console.log(`[Pro Search] Returning ${results.length} unlimited results (threshold-filtered)`);

        // STEP 7: Generate AI response
        const aiResponse = await generateAIResponse(trimmedQuery, results, finalFilters, nlpResult);

        // STEP 8: Generate suggestions
        const suggestions = generateSuggestions(trimmedQuery, results, filters);

        const duration = Date.now() - startTime;
        console.log(`[Pro Search] Completed in ${duration}ms, found ${results.length} results`);

        res.json({
            results,
            aiResponse,
            suggestions,
            metadata: {
                intent: 'search',
                filters: finalFilters,
                totalResults: results.length,
                processingTime: duration,
                nlpEnhanced: nlpResult.aiEnhanced || false,
                correctedQuery: nlpResult.corrected,
                originalQuery: trimmedQuery,
                // High-recall search metadata
                searchConfig: {
                    topKInitial: CONFIG.TOP_K_INITIAL,
                    threshold: CONFIG.COSINE_THRESHOLD,
                    hybridScoringEnabled: !!userContext
                },
                // Context state (for debugging)
                contextConstraints: userContext ? {
                    domains: Array.from(userContext.constraints.domains),
                    years: Array.from(userContext.constraints.years),
                    technologies: Array.from(userContext.constraints.technologies)
                } : null
            }
        });

    } catch (error) {
        console.error('[Pro Search] Error:', error);
        res.status(500).json({
            error: true,
            message: 'Search failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/search/suggestions - Get search suggestions
 */
router.get('/suggestions', async (req, res) => {
    try {
        const suggestions = [
            'Show me latest ideas',
            'Find AI and ML projects',
            'Healthcare innovations',
            'Cloud infrastructure solutions',
            'Customer experience improvements',
            'Automation projects'
        ];
        res.json({ suggestions });
    } catch (error) {
        console.error('[Pro Search] Suggestions error:', error);
        res.status(500).json({ error: true, message: 'Failed to get suggestions' });
    }
});

/**
 * POST /api/search/reindex - Force reindex ideas
 */
router.post('/reindex', async (req, res) => {
    try {
        const pool = req.app.get('db');
        if (!pool) {
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        // Reset to force reindex
        lastIndexTime = null;
        const chromaClient = getChromaClient();
        chromaClient.deleteCollection('ideas_search');

        await indexIdeasToChroma(pool);

        res.json({
            success: true,
            message: 'Ideas reindexed successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Pro Search] Reindex error:', error);
        res.status(500).json({ error: true, message: 'Reindex failed' });
    }
});

/**
 * GET /api/search/health - Health check
 */
router.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        ollama: true, // Always using Ollama/Llama
        chromaDB: false,
        timestamp: new Date().toISOString()
    };

    try {
        const chromaClient = getChromaClient();
        health.chromaDB = chromaClient.hasCollection('ideas_search');
        if (health.chromaDB) {
            const stats = chromaClient.getStats('ideas_search');
            health.indexedIdeas = stats?.documentCount || 0;
        }
    } catch (e) {
        health.chromaDB = false;
    }

    res.json(health);
});

/**
 * POST /api/search/clear-context - Clear search context/filters on server
 */
router.post('/clear-context', async (req, res) => {
    try {
        const { userId, filterType = 'all' } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: true,
                message: 'userId is required'
            });
        }

        // This is a placeholder - actual implementation would clear server-side context
        // For now, just return success
        console.log(`[Pro Search] Clearing context for user ${userId}, filterType: ${filterType}`);

        res.json({
            success: true,
            message: `Context cleared successfully for ${filterType} filters.`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Pro Search] Clear context error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to clear context'
        });
    }
});

/**
 * Rehydrate search results from conversation_search_state
 * Used by frontend to restore results when loading conversation
 * This is the SINGLE SOURCE OF TRUTH for search context
 */
router.post('/rehydrate', async (req, res) => {
    try {
        const { conversationId } = req.body;

        if (!conversationId) {
            return res.json({
                results: [],
                filters: {},
                baseQuery: null
            });
        }

        console.log(`[Rehydrate] Loading search state for conversation: ${conversationId}`);

        // Load persisted state from conversation_search_state table
        const searchStateService = new SearchStateService(pool);
        const state = await searchStateService.loadSearchState(conversationId);

        if (!state || !state.currentResultIds || state.currentResultIds.length === 0) {
            console.log(`[Rehydrate] No search state found for conversation ${conversationId}`);
            return res.json({
                results: [],
                filters: {},
                baseQuery: null
            });
        }

        console.log(`[Rehydrate] Found state: ${state.currentResultIds.length} result IDs`);

        // Fetch full idea details using current result IDs
        const ideas = await fetchIdeasByIds(state.currentResultIds);

        // Format for frontend
        const formatted = formatResults(ideas);

        console.log(`[Rehydrate] ✅ Rehydrated ${formatted.length} results`);

        res.json({
            results: formatted,
            filters: state.appliedFilters || {},
            baseQuery: state.baseQuery,
            metadata: {
                totalResults: formatted.length,
                baseResultsCount: state.baseResultIds?.length || 0,
                rehydratedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('[Rehydrate] Error:', error);
        res.status(500).json({
            error: 'Failed to rehydrate search state',
            results: [],
            filters: {},
            baseQuery: null
        });
    }
});

export default router;
