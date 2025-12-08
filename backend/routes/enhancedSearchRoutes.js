/**
 * Enhanced Search Routes
 * Comprehensive search API with context persistence, dynamic filtering, and research mode
 */

import express from 'express';
import { validateQuery, generateErrorMessage } from '../services/contextValidator.js';
import { getChromaClient } from '../config/chroma.js';
import { enhanceQuery } from '../services/nlpQueryProcessor.js';
import { isGeminiAvailable, generateText, initializeGemini } from '../config/gemini.js';
import { indexIdeasOptimized, optimizedSearch } from '../services/optimizedIndexer.js';
import { executeDynamicSearch, hybridSearch, saveSearchHistory, getRecentSearches } from '../services/dynamicSearchService.js';
import { getUserContext, saveUserContext, validateFilters, mergeFilters, getAvailableFilters } from '../services/contextManager.js';
import { tagIdea, untagIdea, getUserTags, getIdeasByTag, findSimilarIdeas, refineSearchContext, parseResearchCommand } from '../services/researchService.js';

const router = express.Router();

// Initialize Gemini
initializeGemini();

// Indexing state
let isIndexed = false;
let indexingPromise = null;
let lastIndexTime = null;

/**
 * Ensure index exists (lazy initialization)
 */
async function ensureIndex(pool) {
    // Check if already indexed
    if (isIndexed) {
        console.log('[EnhancedSearch] Index already exists, skipping');
        return { cached: true };
    }
    
    // Check if indexing is in progress
    if (indexingPromise) {
        console.log('[EnhancedSearch] Waiting for existing indexing to complete...');
        await indexingPromise;
        return { cached: true };
    }

    console.log('[EnhancedSearch] Starting indexing...');
    
    try {
        indexingPromise = indexIdeasOptimized(pool, { batchSize: 100 });
        const result = await indexingPromise;
        isIndexed = true;
        lastIndexTime = new Date();
        console.log(`[EnhancedSearch] Indexing complete: ${result.indexed} ideas indexed`);
        return result;
    } catch (error) {
        console.error('[EnhancedSearch] Indexing failed:', error.message);
        throw error;
    } finally {
        indexingPromise = null;
    }
}

/**
 * Extract context from query
 */
function extractQueryContext(query) {
    const context = {
        technologies: [],
        domains: [],
        businessGroups: [],
        years: [],
        keywords: []
    };

    const lowerQuery = query.toLowerCase();

    // Technology patterns
    const techMap = {
        'AI/ML': /\b(ai|ml|machine learning|artificial intelligence|deep learning|neural|llm|gpt)\b/i,
        'Blockchain': /\b(blockchain|web3|crypto|nft|smart contract)\b/i,
        'Cloud': /\b(cloud|aws|azure|gcp|serverless|kubernetes)\b/i,
        'React': /\breact(\.?js)?\b/i,
        'Python': /\bpython\b/i,
        'Node.js': /\bnode(\.?js)?\b/i,
        'Mobile': /\b(mobile|ios|android|flutter)\b/i,
        'Data': /\b(data|analytics|visualization|dashboard)\b/i
    };

    for (const [tech, pattern] of Object.entries(techMap)) {
        if (pattern.test(query)) context.technologies.push(tech);
    }

    // Domain patterns
    const domainMap = {
        'Healthcare': /\b(healthcare|medical|hospital|patient|health|pharma)\b/i,
        'Finance': /\b(finance|banking|fintech|payment|insurance)\b/i,
        'Retail': /\b(retail|ecommerce|shopping|store)\b/i,
        'Security': /\b(security|cybersecurity|encryption|privacy)\b/i
    };

    for (const [domain, pattern] of Object.entries(domainMap)) {
        if (pattern.test(query)) context.domains.push(domain);
    }

    // Year extraction
    const yearMatch = query.match(/\b(202[0-9]|2030)\b/);
    if (yearMatch) context.years.push(parseInt(yearMatch[0]));

    return context;
}

/**
 * Generate AI response
 */
async function generateResponse(query, results, context) {
    const count = results.length;

    if (count === 0) {
        return `No ideas found matching "${query}". Try different keywords or remove some filters.`;
    }

    if (isGeminiAvailable()) {
        try {
            const topTitles = results.slice(0, 3).map(r => r.title).join(', ');
            const prompt = `Briefly summarize: Found ${count} ideas for "${query}". Top: ${topTitles}. Be concise (1-2 sentences).`;
            const response = await generateText(prompt, { maxOutputTokens: 100 });
            if (response) return response.trim();
        } catch (e) {
            // Fallback below
        }
    }

    return `Found ${count} idea${count > 1 ? 's' : ''} matching your search.`;
}

/**
 * POST /api/v2/search - Main enhanced search endpoint
 */
router.post('/search', async (req, res) => {
    const startTime = Date.now();

    try {
        const {
            query,
            filters = {},
            persistentContext = {},
            userId = 'anonymous',
            sessionId = null,
            clearFilters = [],
            researchMode = false,
            limit = 100
        } = req.body;

        // Validate query
        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            return res.status(400).json({ error: true, message: 'Valid query required' });
        }

        const trimmedQuery = query.trim();
        const pool = req.app.get('db');

        if (!pool) {
            console.error('[EnhancedSearch] Database pool not available');
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        // Check for research commands
        const command = parseResearchCommand(trimmedQuery);

        if (command.command === 'similar' && command.ideaId) {
            try {
                const similar = await findSimilarIdeas(pool, command.ideaId, limit);
                return res.json({
                    results: similar,
                    aiResponse: `Found ${similar.length} ideas similar to IDEA-${command.ideaId}`,
                    metadata: { intent: 'similar', sourceIdea: command.ideaId }
                });
            } catch (e) {
                console.error('[EnhancedSearch] Similar search error:', e);
            }
        }

        // Context validation
        const validation = validateQuery(trimmedQuery);
        if (validation.isGreeting) {
            return res.json({
                results: [],
                aiResponse: "Hi! I'm your Pro Search assistant. Try searching for AI projects, healthcare innovations, or any technology!",
                suggestions: ['Show AI projects', 'Healthcare innovations', 'Cloud solutions'],
                metadata: { intent: 'greeting' }
            });
        }

        if (!validation.valid) {
            return res.json({
                results: [],
                aiResponse: generateErrorMessage(validation.reason),
                metadata: { intent: 'rejected', reason: validation.reason }
            });
        }

        console.log(`[EnhancedSearch] Processing: "${trimmedQuery}"`);

        // NLP processing - pass API key for AI enhancement
        let nlpResult;
        try {
            nlpResult = await enhanceQuery(trimmedQuery, {
                useAI: isGeminiAvailable(),
                apiKey: process.env.API_KEY,
                model: 'gemini-2.5-flash'
            });
            console.log(`[EnhancedSearch] NLP: "${trimmedQuery}" -> "${nlpResult.corrected}"`);
        } catch (e) {
            console.warn('[EnhancedSearch] NLP failed, using original query:', e.message);
            nlpResult = { corrected: trimmedQuery, expanded: [trimmedQuery] };
        }

        // Extract and merge context
        const extractedContext = extractQueryContext(nlpResult.corrected);
        
        // Handle filter clearing
        let mergedContext = mergeFilters(persistentContext, extractedContext);
        if (clearFilters.length > 0) {
            for (const filterType of clearFilters) {
                if (filterType === 'all') {
                    mergedContext = { technologies: [], domains: [], businessGroups: [], years: [], keywords: [] };
                } else if (mergedContext[filterType]) {
                    mergedContext[filterType] = [];
                }
            }
        }

        // Build search filters
        const searchFilters = {
            ...filters,
            domain: mergedContext.domains.length > 0 ? mergedContext.domains : filters.domain,
            techStack: mergedContext.technologies.length > 0 ? mergedContext.technologies : filters.techStack,
            businessGroup: mergedContext.businessGroups.length > 0 ? mergedContext.businessGroups : filters.businessGroup,
            year: mergedContext.years[0] || filters.year
        };

        // Try semantic search first
        let results = [];
        let source = 'none';

        try {
            console.log('[EnhancedSearch] Step 1: Ensuring index exists...');
            const indexResult = await ensureIndex(pool);
            console.log('[EnhancedSearch] Index status:', indexResult);
            
            console.log('[EnhancedSearch] Step 2: Running semantic search...');
            const searchQuery = nlpResult.expanded?.join(' ') || nlpResult.corrected;
            console.log(`[EnhancedSearch] Search query: "${searchQuery}"`);
            
            const chromaResult = await optimizedSearch(searchQuery, searchFilters, limit, pool);
            results = chromaResult.results || [];
            source = chromaResult.source || 'semantic';
            console.log(`[EnhancedSearch] Semantic search found ${results.length} results (source: ${source})`);
        } catch (e) {
            console.error('[EnhancedSearch] Semantic search failed:', e.message);
            console.error('[EnhancedSearch] Stack:', e.stack);
        }

        // Check if query looks like garbage/nonsense (no real words)
        const queryWords = trimmedQuery.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const hasCommonVowelPattern = queryWords.some(w => /[aeiou]/i.test(w));
        const isLikelyGarbageQuery = queryWords.length === 0 || 
            (queryWords.length === 1 && queryWords[0].length > 10 && !hasCommonVowelPattern);
        
        console.log(`[EnhancedSearch] Query analysis: words=${queryWords.length}, hasVowels=${hasCommonVowelPattern}, isGarbage=${isLikelyGarbageQuery}`);
        
        // If garbage query, don't do fallback searches - return empty
        if (isLikelyGarbageQuery && results.length === 0) {
            console.log('[EnhancedSearch] Garbage query detected, returning 0 results');
            source = 'none';
        } else {
            // Fallback to database search if no results (only for valid queries)
            if (results.length === 0) {
                console.log('[EnhancedSearch] Step 3: Falling back to database search...');
                try {
                    const dbResult = await executeDynamicSearch(pool, nlpResult.corrected, searchFilters, { limit });
                    results = dbResult.results || [];
                    source = 'database';
                    console.log(`[EnhancedSearch] Database search found ${results.length} results`);
                } catch (e) {
                    console.error('[EnhancedSearch] Database search failed:', e.message);
                }
            }
            
            // Last resort: simple keyword search across ALL fields (only for valid queries)
            if (results.length === 0 && !isLikelyGarbageQuery) {
                console.log('[EnhancedSearch] Step 4: Simple keyword fallback...');
                try {
                    const keywords = trimmedQuery.split(/\s+/).filter(w => w.length > 2);
                    const searchTerm = keywords.length > 0 ? keywords[0] : trimmedQuery;
                    console.log(`[EnhancedSearch] Keyword search term: "${searchTerm}"`);
                    
                    const simpleResult = await pool.query(`
                        SELECT idea_id, title, summary, challenge_opportunity, business_group, 
                               code_preference, build_phase, scalability, novelty, score, created_at
                        FROM ideas
                        WHERE title ILIKE $1 
                           OR summary ILIKE $1 
                           OR challenge_opportunity ILIKE $1 
                           OR code_preference ILIKE $1
                           OR business_group ILIKE $1
                           OR COALESCE(benefits, '') ILIKE $1
                           OR COALESCE(additional_info, '') ILIKE $1
                           OR COALESCE(build_phase, '') ILIKE $1
                           OR COALESCE(scalability, '') ILIKE $1
                           OR COALESCE(novelty, '') ILIKE $1
                        ORDER BY score DESC, created_at DESC
                        LIMIT $2
                    `, [`%${searchTerm}%`, limit]);

                    results = simpleResult.rows.map(row => ({
                        id: `IDEA-${row.idea_id}`,
                        dbId: row.idea_id,
                        title: row.title,
                        description: row.summary || '',
                        domain: row.challenge_opportunity || 'General',
                        businessGroup: row.business_group || 'Unknown',
                        technologies: row.code_preference || '',
                        buildPhase: row.build_phase || '',
                        scalability: row.scalability || '',
                        novelty: row.novelty || '',
                        score: row.score || 0,
                        submissionDate: row.created_at,
                        matchScore: 60
                    }));
                    source = 'keyword';
                    console.log(`[EnhancedSearch] Keyword search found ${results.length} results`);
                } catch (e2) {
                    console.error('[EnhancedSearch] Keyword search failed:', e2.message);
                }
            }
            
            // NOTE: Removed "latest ideas" fallback - if no results match, return 0 results
            // This ensures garbage queries and queries with no matches return empty results
        }

        // Generate response
        const aiResponse = await generateResponse(trimmedQuery, results, mergedContext);

        const duration = Date.now() - startTime;
        console.log(`[EnhancedSearch] Completed in ${duration}ms, found ${results.length} results`);

        res.json({
            results,
            aiResponse,
            suggestions: generateSuggestions(results, mergedContext),
            metadata: {
                intent: 'search',
                filters: searchFilters,
                totalResults: results.length,
                processingTime: duration,
                searchSource: source,
                correctedQuery: nlpResult.corrected
            },
            context: mergedContext,
            extractedKeywords: extractedContext
        });

    } catch (error) {
        console.error('[EnhancedSearch] Error:', error);
        res.status(500).json({ error: true, message: 'Search failed', details: error.message });
    }
});

/**
 * Generate suggestions based on results
 */
function generateSuggestions(results, context) {
    const suggestions = new Set();

    if (results.length > 0) {
        const domains = [...new Set(results.slice(0, 5).map(r => r.domain).filter(Boolean))];
        if (domains[0]) suggestions.add(`More ${domains[0]} ideas`);
    }

    if (!context.years?.length) suggestions.add('Filter by 2024');
    suggestions.add('Show AI projects');
    suggestions.add('Healthcare innovations');

    return Array.from(suggestions).slice(0, 4);
}

// Tag endpoints
router.post('/tag', async (req, res) => {
    try {
        const { userId, ideaId, tag, notes, context } = req.body;
        const pool = req.app.get('db');
        const result = await tagIdea(pool, userId, ideaId, tag, notes, context);
        res.json({ success: true, tag: result });
    } catch (error) {
        res.status(500).json({ error: true, message: 'Failed to tag idea' });
    }
});

router.delete('/tag', async (req, res) => {
    try {
        const { userId, ideaId, tag } = req.body;
        const pool = req.app.get('db');
        await untagIdea(pool, userId, ideaId, tag);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: true, message: 'Failed to remove tag' });
    }
});

router.get('/tags/:userId', async (req, res) => {
    try {
        const pool = req.app.get('db');
        const tags = await getUserTags(pool, req.params.userId);
        res.json({ tags });
    } catch (error) {
        res.status(500).json({ error: true, message: 'Failed to get tags' });
    }
});

// Context endpoints
router.get('/context/:userId', async (req, res) => {
    try {
        const context = await getUserContext(req.params.userId, req.query.sessionId);
        res.json({ context });
    } catch (error) {
        res.status(500).json({ error: true, message: 'Failed to get context' });
    }
});

router.post('/context', async (req, res) => {
    try {
        const { userId, sessionId, context } = req.body;
        const validated = validateFilters(context);
        await saveUserContext(userId, sessionId, validated);
        res.json({ success: true, context: validated });
    } catch (error) {
        res.status(500).json({ error: true, message: 'Failed to save context' });
    }
});

// Filter options
router.get('/filters', async (req, res) => {
    try {
        const filters = await getAvailableFilters();
        res.json(filters);
    } catch (error) {
        res.status(500).json({ error: true, message: 'Failed to get filters' });
    }
});

// Search history
router.get('/history/:userId', async (req, res) => {
    try {
        const pool = req.app.get('db');
        const history = await getRecentSearches(pool, req.params.userId, 20);
        res.json({ history });
    } catch (error) {
        res.status(500).json({ error: true, message: 'Failed to get history' });
    }
});

// Similar ideas
router.get('/similar/:ideaId', async (req, res) => {
    try {
        const pool = req.app.get('db');
        const similar = await findSimilarIdeas(pool, parseInt(req.params.ideaId), 10);
        res.json({ results: similar });
    } catch (error) {
        res.status(500).json({ error: true, message: 'Failed to find similar ideas' });
    }
});

// Force reindex with all fields
router.post('/reindex', async (req, res) => {
    try {
        const pool = req.app.get('db');
        const chromaClient = getChromaClient();
        chromaClient.deleteCollection('ideas_search');
        isIndexed = false;
        
        console.log('[EnhancedSearch] Force reindexing with all fields...');
        const result = await indexIdeasOptimized(pool, { forceReindex: true });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[EnhancedSearch] Reindex failed:', error);
        res.status(500).json({ error: true, message: 'Reindex failed', details: error.message });
    }
});

// Get sample data to see what's searchable
router.get('/sample-data', async (req, res) => {
    try {
        const pool = req.app.get('db');
        const result = await pool.query(`
            SELECT DISTINCT 
                challenge_opportunity as domain,
                code_preference as technology,
                business_group,
                build_phase,
                scalability,
                novelty
            FROM ideas
            LIMIT 50
        `);
        
        const domains = [...new Set(result.rows.map(r => r.domain).filter(Boolean))];
        const technologies = [...new Set(result.rows.map(r => r.technology).filter(Boolean))];
        const businessGroups = [...new Set(result.rows.map(r => r.business_group).filter(Boolean))];
        
        res.json({
            message: 'Sample searchable terms from your data',
            domains: domains.slice(0, 20),
            technologies: technologies.slice(0, 20),
            businessGroups: businessGroups.slice(0, 20),
            sampleSearches: [
                'Find AI projects',
                'Show GenAI ideas',
                'Agentic AI solutions',
                'Healthcare projects',
                'Finance ideas'
            ]
        });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Health check
router.get('/health', (req, res) => {
    const chromaClient = getChromaClient();
    res.json({
        status: 'ok',
        indexed: isIndexed,
        chromaDB: chromaClient.hasCollection('ideas_search'),
        gemini: isGeminiAvailable()
    });
});

// Debug endpoint to check indexing status and test search
router.get('/debug', async (req, res) => {
    try {
        const chromaClient = getChromaClient();
        const hasCollection = chromaClient.hasCollection('ideas_search');
        const pool = req.app.get('db');
        
        let collectionInfo = null;
        let dbInfo = null;
        
        // Get ChromaDB collection info
        if (hasCollection) {
            const stats = chromaClient.getStats('ideas_search');
            const collection = chromaClient.collections.get('ideas_search');
            
            // Get sample documents
            const sampleDocs = [];
            if (collection && collection.documents) {
                for (let i = 0; i < Math.min(3, collection.documents.length); i++) {
                    sampleDocs.push({
                        id: collection.ids?.[i],
                        title: collection.metadatas?.[i]?.title,
                        domain: collection.metadatas?.[i]?.domain,
                        preview: collection.documents[i]?.substring(0, 100) + '...'
                    });
                }
            }
            
            collectionInfo = {
                exists: true,
                documentCount: stats?.documentCount || 0,
                sampleDocuments: sampleDocs
            };
        }
        
        // Get database info
        if (pool) {
            try {
                const countResult = await pool.query('SELECT COUNT(*) as count FROM ideas');
                const sampleResult = await pool.query(`
                    SELECT idea_id, title, challenge_opportunity, code_preference 
                    FROM ideas 
                    ORDER BY created_at DESC 
                    LIMIT 3
                `);
                
                dbInfo = {
                    totalIdeas: parseInt(countResult.rows[0].count),
                    sampleIdeas: sampleResult.rows.map(r => ({
                        id: r.idea_id,
                        title: r.title,
                        domain: r.challenge_opportunity,
                        tech: r.code_preference
                    }))
                };
            } catch (e) {
                dbInfo = { error: e.message };
            }
        }
        
        res.json({
            indexingStatus: {
                isIndexed,
                hasCollection,
                collection: collectionInfo
            },
            database: dbInfo,
            chromaDB: {
                available: !!chromaClient,
                collections: chromaClient.collections ? Array.from(chromaClient.collections.keys()) : []
            },
            gemini: {
                available: isGeminiAvailable(),
                apiKeySet: !!process.env.API_KEY
            }
        });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message, stack: error.stack });
    }
});

// Test search endpoint for debugging
router.get('/test-search', async (req, res) => {
    const query = req.query.q || 'AI';
    const pool = req.app.get('db');
    
    try {
        // Test 1: Direct database search
        const dbResult = await pool.query(`
            SELECT idea_id, title, summary, challenge_opportunity
            FROM ideas
            WHERE title ILIKE $1 OR summary ILIKE $1 OR challenge_opportunity ILIKE $1
            LIMIT 5
        `, [`%${query}%`]);
        
        // Test 2: ChromaDB search
        let chromaResult = null;
        try {
            await ensureIndex(pool);
            chromaResult = await optimizedSearch(query, {}, 5, pool);
        } catch (e) {
            chromaResult = { error: e.message };
        }
        
        res.json({
            query,
            databaseResults: {
                count: dbResult.rows.length,
                results: dbResult.rows
            },
            chromaResults: chromaResult
        });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

export default router;
