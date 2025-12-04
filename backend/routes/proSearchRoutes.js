import express from 'express';
import { validateQuery, extractEntities, generateErrorMessage } from '../services/contextValidator.js';
import { getChromaClient } from '../config/chroma.js';
import { enhanceQuery, processQuery } from '../services/nlpQueryProcessor.js';
import { getEmbeddingVector } from '../services/embeddingProvider.js';

const router = express.Router();

console.log('✅ [Router] proSearchRoutes.js loaded with ChromaDB + NLP');

// Cache for ideas collection
let ideasCollection = null;
let lastIndexTime = null;
const INDEX_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize or get ideas collection from ChromaDB
 */
async function getIdeasCollection() {
    const chromaClient = getChromaClient();
    
    if (!ideasCollection) {
        try {
            ideasCollection = await chromaClient.getOrCreateCollection({ name: 'ideas_search' });
            console.log('✅ [Pro Search] Ideas collection initialized');
        } catch (error) {
            console.error('[Pro Search] Failed to get collection:', error.message);
            throw error;
        }
    }
    
    return ideasCollection;
}

/**
 * Index ideas from database to ChromaDB for fast semantic search
 */
async function indexIdeasToChroma(pool) {
    // Check if we need to refresh
    if (lastIndexTime && (Date.now() - lastIndexTime) < INDEX_REFRESH_INTERVAL) {
        return;
    }

    try {
        const collection = await getIdeasCollection();
        const count = await collection.count();
        
        // Only index if collection is empty or needs refresh
        if (count > 0 && lastIndexTime) {
            return;
        }

        console.log('[Pro Search] Indexing ideas to ChromaDB...');
        
        const result = await pool.query(`
            SELECT idea_id, title, summary, challenge_opportunity, 
                   business_group, code_preference, score, created_at
            FROM ideas
            ORDER BY created_at DESC
            LIMIT 500
        `);

        if (result.rows.length === 0) {
            console.log('[Pro Search] No ideas to index');
            return;
        }

        const chromaClient = getChromaClient();
        
        // Process in batches
        const batchSize = 50;
        for (let i = 0; i < result.rows.length; i += batchSize) {
            const batch = result.rows.slice(i, i + batchSize);
            
            const documents = [];
            const embeddings = [];
            const metadatas = [];
            const ids = [];

            for (const idea of batch) {
                const text = `${idea.title} ${idea.summary || ''} ${idea.challenge_opportunity || ''} ${idea.code_preference || ''}`;
                
                try {
                    const embedding = await getEmbeddingVector(text.substring(0, 1000));
                    
                    documents.push(text);
                    embeddings.push(embedding);
                    metadatas.push({
                        idea_id: idea.idea_id,
                        title: idea.title,
                        domain: idea.challenge_opportunity || '',
                        businessGroup: idea.business_group || '',
                        technologies: idea.code_preference || '',
                        score: idea.score || 0,
                        created_at: idea.created_at?.toISOString() || ''
                    });
                    ids.push(`idea_${idea.idea_id}`);
                } catch (embError) {
                    console.warn(`[Pro Search] Failed to embed idea ${idea.idea_id}:`, embError.message);
                }
            }

            if (documents.length > 0) {
                chromaClient.addDocuments('ideas_search', documents, embeddings, metadatas);
            }
        }

        lastIndexTime = Date.now();
        console.log(`✅ [Pro Search] Indexed ${result.rows.length} ideas to ChromaDB`);

    } catch (error) {
        console.error('[Pro Search] Indexing error:', error.message);
    }
}

/**
 * Semantic search using ChromaDB
 */
async function semanticSearch(query, filters = {}, topK = 20) {
    try {
        const chromaClient = getChromaClient();
        
        // Generate query embedding
        const queryEmbedding = await getEmbeddingVector(query);
        
        // Query ChromaDB
        const results = chromaClient.query('ideas_search', queryEmbedding, topK);
        
        if (!results || results.documents.length === 0) {
            return [];
        }

        // Map results with similarity scores
        const ideas = results.documents.map((doc, idx) => {
            const metadata = results.metadatas[idx] || {};
            const distance = results.distances[idx] || 1;
            const similarity = Math.round((1 - distance) * 100);

            return {
                id: metadata.idea_id,
                title: metadata.title || '',
                description: doc.substring(0, 300),
                domain: metadata.domain || '',
                businessGroup: metadata.businessGroup || '',
                technologies: metadata.technologies || '',
                score: metadata.score || 0,
                submissionDate: metadata.created_at || '',
                matchScore: similarity
            };
        });

        // Apply filters
        let filtered = ideas;
        
        if (filters.domain && filters.domain.length > 0) {
            const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
            filtered = filtered.filter(idea => 
                domains.some(d => idea.domain.toLowerCase().includes(d.toLowerCase()))
            );
        }

        if (filters.businessGroup && filters.businessGroup.length > 0) {
            const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
            filtered = filtered.filter(idea => 
                groups.some(g => idea.businessGroup.toLowerCase().includes(g.toLowerCase()))
            );
        }

        if (filters.techStack && filters.techStack.length > 0) {
            const techs = Array.isArray(filters.techStack) ? filters.techStack : [filters.techStack];
            filtered = filtered.filter(idea => 
                techs.some(t => idea.technologies.toLowerCase().includes(t.toLowerCase()))
            );
        }

        if (filters.year) {
            filtered = filtered.filter(idea => {
                const year = new Date(idea.submissionDate).getFullYear();
                return year === filters.year;
            });
        }

        return filtered;

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

    // Domain detection
    const domainKeywords = {
        'healthcare': ['healthcare', 'medical', 'hospital', 'patient', 'clinical'],
        'finance': ['finance', 'banking', 'payment', 'fintech', 'loan'],
        'retail': ['retail', 'ecommerce', 'shop', 'store', 'inventory'],
        'ai': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning']
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
        if (keywords.some(kw => normalizedQuery.includes(kw))) {
            if (!filters.domain) filters.domain = [];
            if (!filters.domain.includes(domain)) filters.domain.push(domain);
        }
    }

    return filters;
}

/**
 * Generate AI response based on results
 */
function generateAIResponse(query, results, filters, nlpResult) {
    const count = results.length;

    if (count === 0) {
        let response = `I couldn't find any ideas matching "${query}".`;
        
        if (nlpResult && nlpResult.corrected !== query) {
            response += ` I also tried searching for "${nlpResult.corrected}".`;
        }
        
        response += ' Try broadening your search or using different keywords.';
        return response;
    }

    let response = `Found ${count} idea${count > 1 ? 's' : ''} matching your query`;

    // Add filter context
    const filterParts = [];
    if (filters.year) filterParts.push(`from ${filters.year}`);
    if (filters.domain?.length) filterParts.push(`in ${filters.domain.join(', ')}`);
    if (filters.businessGroup?.length) filterParts.push(`for ${filters.businessGroup.join(', ')}`);
    if (filters.techStack?.length) filterParts.push(`using ${filters.techStack.join(', ')}`);

    if (filterParts.length > 0) response += ` ${filterParts.join(' ')}`;

    // Add spell correction note
    if (nlpResult && nlpResult.corrected !== nlpResult.original) {
        response += `. (Searched for: "${nlpResult.corrected}")`;
    }

    response += '.';

    // Add top domains insight
    if (count > 0) {
        const topDomains = [...new Set(results.slice(0, 5).map(r => r.domain).filter(Boolean))];
        if (topDomains.length > 0) {
            response += ` Top domains: ${topDomains.slice(0, 3).join(', ')}.`;
        }
    }

    // Add match quality insight
    const avgMatch = results.reduce((sum, r) => sum + (r.matchScore || 0), 0) / count;
    if (avgMatch > 70) {
        response += ' High relevance matches found!';
    }

    return response;
}

/**
 * Generate smart suggestions based on query and results
 */
function generateSuggestions(query, results, filters) {
    const suggestions = [];

    // Domain-based suggestions
    if (results.length > 0) {
        const topDomains = [...new Set(results.slice(0, 5).map(r => r.domain).filter(Boolean))];
        if (topDomains[0]) suggestions.push(`More ${topDomains[0]} projects`);
    }

    // Filter suggestions
    if (!filters.year) suggestions.push('Filter by 2024');
    if (!filters.businessGroup?.length) suggestions.push('Filter by business group');
    
    // Related searches
    const relatedSearches = {
        'ai': ['machine learning projects', 'chatbot ideas'],
        'healthcare': ['patient management', 'medical AI'],
        'finance': ['payment solutions', 'banking automation'],
        'cloud': ['infrastructure projects', 'serverless ideas']
    };

    const queryLower = query.toLowerCase();
    for (const [key, related] of Object.entries(relatedSearches)) {
        if (queryLower.includes(key)) {
            suggestions.push(...related.slice(0, 1));
            break;
        }
    }

    suggestions.push('Show latest ideas');

    return [...new Set(suggestions)].slice(0, 4);
}

/**
 * POST /api/search/conversational - Main search endpoint
 */
router.post('/conversational', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { query, additionalFilters = {} } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: true, message: 'Query is required' });
        }

        // Validate query
        const validation = validateQuery(query);
        if (!validation.valid) {
            const errorMsg = generateErrorMessage(validation.reason, validation.suggestion);
            return res.json({
                results: [],
                aiResponse: errorMsg,
                suggestions: ['Show me latest ideas', 'Find AI projects', 'Filter by healthcare'],
                metadata: { intent: 'rejected', filters: {}, totalResults: 0 }
            });
        }

        console.log(`[Pro Search] Query: "${query}"`);

        // Get database pool
        const pool = req.app.get('db');
        if (!pool) {
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        // Index ideas to ChromaDB (if needed)
        await indexIdeasToChroma(pool);

        // NLP Processing - spell correction and query expansion
        const apiKey = process.env.API_KEY;
        const nlpResult = await enhanceQuery(query, { 
            useAI: !!apiKey, 
            apiKey,
            model: 'gemini-2.0-flash-exp'
        });

        console.log(`[Pro Search] NLP processed: "${nlpResult.corrected}"`);

        // Parse filters from query
        const filters = parseFilters(nlpResult.corrected, additionalFilters);

        // Semantic search using ChromaDB
        const searchQuery = nlpResult.expanded.join(' ');
        let results = await semanticSearch(searchQuery, filters, 20);

        // If no results from semantic search, try database fallback
        if (results.length === 0) {
            console.log('[Pro Search] No semantic results, trying database fallback...');
            
            const dbResult = await pool.query(`
                SELECT idea_id as id, title, summary as description,
                       challenge_opportunity as domain, business_group as "businessGroup",
                       COALESCE(code_preference, '') as technologies,
                       created_at as "submissionDate", score
                FROM ideas
                WHERE title ILIKE $1 OR summary ILIKE $1 OR challenge_opportunity ILIKE $1
                ORDER BY score DESC, created_at DESC
                LIMIT 20
            `, [`%${query}%`]);

            results = dbResult.rows.map(row => ({
                ...row,
                matchScore: 50 // Default match score for DB results
            }));
        }

        // Limit to top 10
        results = results.slice(0, 10);

        // Generate AI response
        const aiResponse = generateAIResponse(query, results, filters, nlpResult);

        // Generate suggestions
        const suggestions = generateSuggestions(query, results, filters);

        const duration = Date.now() - startTime;
        console.log(`[Pro Search] Completed in ${duration}ms, found ${results.length} results`);

        res.json({
            results,
            aiResponse,
            suggestions,
            metadata: {
                intent: 'search',
                filters,
                totalResults: results.length,
                processingTime: duration,
                nlpEnhanced: nlpResult.aiEnhanced || false,
                correctedQuery: nlpResult.corrected
            }
        });

    } catch (error) {
        console.error('[Pro Search] Error:', error);
        res.status(500).json({ 
            error: true, 
            message: 'Search failed', 
            details: error.message 
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
            'Healthcare domain ideas',
            'React projects from 2024',
            'Cloud infrastructure solutions',
            'Customer support automation'
        ];
        res.json({ suggestions });
    } catch (error) {
        console.error('[Pro Search] Suggestions error:', error);
        res.status(500).json({ error: true, message: 'Failed to get suggestions' });
    }
});

/**
 * POST /api/search/reindex - Force reindex ideas to ChromaDB
 */
router.post('/reindex', async (req, res) => {
    try {
        const pool = req.app.get('db');
        if (!pool) {
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        // Reset index time to force reindex
        lastIndexTime = null;
        ideasCollection = null;

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

export default router;
