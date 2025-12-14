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

// Hybrid search services
import { classifyIntent, INTENTS } from '../services/intentClassifier.js';
import { buildSemanticQuery, buildRefinedQuery } from '../services/queryBuilder.js';
import { applyMetadataFilters, countActiveFilters } from '../services/metadataFilter.js';
import { extractFilterInfo, normalizeFilterType, normalizeFilterValue } from '../services/filterExtractor.js';
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

const router = express.Router();
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Cache for ideas collection
let ideasCollection = null;
let lastIndexTime = null;
let isIndexing = false; // Prevent concurrent indexing
const INDEX_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Optimized search configuration for Llama embeddings
const CONFIG = {
    TOP_K_INITIAL: 250,        // Reduced for performance (was 500)
    COSINE_THRESHOLD: 0.50,    // Lowered for Llama embeddings (was 0.70)
    MIN_RESULTS_WARNING: 5     // Warn if < 5 results after filtering
};

// Embedding cache for performance
const embeddingCache = new Map();  // sessionId:query → embedding
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;  // 30 minutes

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
        const { query, conversationId, conversationHistory = [] } = req.body;
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

        // STEP 2: Classify intent (Stage 1)
        let intent = await classifyIntent(trimmedQuery, context.intentHistory);
        context.addIntent(intent, trimmedQuery);

        console.log(`[Intent Stage 1] ${intent}`);

        // STAGE 2: Context-Aware Intent Override (WITH CONVERSATION GUARD)
        const hasExistingContext = hasContext(userId, conversationId) && context.baseResults.length > 0;

        if (hasExistingContext && intent === INTENTS.SEMANTIC_SEARCH) {
            const filterKeywords = ['using', 'from', 'year', 'domain', 'tech', 'language', 'only', 'also', 'created', 'at', 'in', 'with'];
            const isShort = trimmedQuery.split(' ').length <= 4;
            const hasFilterKeyword = filterKeywords.some(kw => trimmedQuery.toLowerCase().includes(kw));

            if (isShort || hasFilterKeyword) {
                console.log(`[Intent Override] semantic_search → refine_search (conversational context)`);
                intent = INTENTS.REFINE_SEARCH;
            }
        }

        console.log(`[Intent Final] ${intent}`);

        let semanticResults = [];
        let finalResults = [];

        // STEP 3: Route based on intent
        switch (intent) {
            case INTENTS.SEMANTIC_SEARCH:
                // Run semantic search with clean query (no mutation!)
                const cleanQuery = buildSemanticQuery(trimmedQuery);

                console.log(`[Semantic] Searching with clean query: "${cleanQuery}"`);
                console.log(`[Progressive] Phase 1: Initial semantic search`);

                // Generate embedding
                const embedding = await getEmbeddingVector(cleanQuery, 'llama');

                // Query ChromaDB
                const chromaClient = getChromaClient();
                const collection = await chromaClient.getOrCreateCollection({ name: 'ideas_search' });

                const chromaResults = await collection.query({
                    queryEmbeddings: [embedding],
                    nResults: 200  // High recall
                });

                // Map and filter by threshold
                semanticResults = chromaResults.ids[0].map((id, i) => ({
                    id,
                    document: chromaResults.documents[0][i],
                    metadata: chromaResults.metadatas[0][i],
                    similarity: 1 - chromaResults.distances[0][i]
                })).filter(r => r.similarity >= 0.40);

                console.log(`[Semantic] ${semanticResults.length} results above threshold 0.40`);

                // PROGRESSIVE NARROWING: Set as immutable base results
                context.setBaseResults(cleanQuery, semanticResults);
                console.log(`[Progressive] Base result set established: ${semanticResults.length} items`);

                break;

            case INTENTS.APPLY_FILTER:
                // Extract filter info with action (REPLACE/ADD/REMOVE)
                const filterInfo = await extractFilterInfo(trimmedQuery);
                if (filterInfo.type && filterInfo.value) {
                    const normalizedType = normalizeFilterType(filterInfo.type);
                    const normalizedValue = normalizeFilterValue(filterInfo.value, normalizedType);

                    if (normalizedType && normalizedValue) {
                        // Handle action: REPLACE, ADD, or REMOVE
                        switch (filterInfo.action) {
                            case 'REPLACE':
                                context.replaceFilters(normalizedType, normalizedValue);
                                break;

                            case 'REMOVE':
                                if (Array.isArray(normalizedValue)) {
                                    normalizedValue.forEach(v => context.removeFilter(normalizedType, v));
                                } else {
                                    context.removeFilter(normalizedType, normalizedValue);
                                }
                                break;

                            case 'ADD':
                            default:
                                context.addFilter(normalizedType, normalizedValue);
                                break;
                        }
                    }
                }

                // IN-MEMORY FILTER on currentResults
                const filterStart = Date.now();
                semanticResults = context.narrowResults(result => {
                    return applyMetadataFilters([result], context.filters).length > 0;
                });

                const filterTime = Date.now() - filterStart;

                // Clean summary with active filters
                const activeFilters = Object.entries(context.filters)
                    .filter(([_, values]) => values.length > 0)
                    .map(([key, values]) => `${key}:${values.join(',')}`)
                    .join(' ');

                console.log(`[Filter] {${activeFilters}} → ${context.previousCount} → ${semanticResults.length} (${filterTime}ms)`);

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

                const refinedQuery = buildRefinedQuery(context.semanticQuery, trimmedQuery);
                context.updateSemanticQuery(refinedQuery);

                const refinementStart = Date.now();

                // CRITICAL: Extract implicit filters from refinement query
                // "using java" → technologies: ["Java"]
                // "from 2024" → years: [2024]
                const implicitFilterInfo = extractFilterInfo(trimmedQuery);

                if (implicitFilterInfo && implicitFilterInfo.value) {
                    const { type, value, action } = implicitFilterInfo;
                    const normalizedType = normalizeFilterType(type);
                    const normalizedValue = normalizeFilterValue(type, value);

                    console.log(`[Refine Filter] Extracted: ${normalizedType} = ${normalizedValue} (${action})`);

                    if (action === 'REPLACE') {
                        context.replaceFilters(normalizedType, normalizedValue);
                    } else if (action === 'ADD') {
                        context.addFilter(normalizedType, normalizedValue);
                    } else if (action === 'REMOVE') {
                        context.removeFilter(normalizedType, normalizedValue);
                    }
                }

                // IN-MEMORY KEYWORD FILTER on currentResults
                const queryTerms = trimmedQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2);

                semanticResults = context.narrowResults(result => {
                    const metadata = result.metadata || {};
                    const searchText = [
                        metadata.title || '',
                        metadata.summary || '',
                        metadata.domain || '',
                        metadata.technologies || '',
                        result.document || ''
                    ].join(' ').toLowerCase();

                    // Match if ANY query term is found
                    return queryTerms.some(term => searchText.includes(term));
                });

                const refinementTime = Date.now() - refinementStart;

                // Clean summary log
                console.log(`[Refine] "${trimmedQuery}" → ${context.previousCount} → ${semanticResults.length} (${refinementTime}ms)`);

                if (refinementTime > 300) {
                    console.warn(`[Performance] Refinement ${refinementTime}ms > 300ms target`);
                }

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

        // STEP 4: Apply metadata filters (AFTER semantic search)
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

        // STEP 8: Generate AI response
        const aiResponse = await generateSearchResponse(trimmedQuery, formattedResults, context);

        // STEP 9: Generate suggestions
        const suggestions = generateSmartSuggestions(formattedResults, context);

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

export default router;
