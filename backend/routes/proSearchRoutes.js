/**
 * Pro Search Routes - Advanced Semantic Search with NLP
 * 
 * Features:
 * - ChromaDB for fast vector similarity search
 * - Google Gemini for embeddings and AI responses
 * - NLP query processing with spell correction
 * - Context validation to block off-topic queries
 * - Smart suggestions and query expansion
 */

import express from 'express';
import { validateQuery, extractEntities, generateErrorMessage } from '../services/contextValidator.js';
import { getChromaClient } from '../config/chroma.js';
import { enhanceQuery, processQuery } from '../services/nlpQueryProcessor.js';
import { 
    generateGeminiEmbeddingWithRetry, 
    generateText, 
    isGeminiAvailable,
    initializeGemini 
} from '../config/gemini.js';

const router = express.Router();

console.log('✅ [Pro Search] Routes loaded with ChromaDB + Gemini + NLP');

// Ensure Gemini is initialized
initializeGemini();

// Cache for ideas collection
let ideasCollection = null;
let lastIndexTime = null;
const INDEX_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

/**
 * Generate embedding using Gemini (with fallback)
 */
async function getEmbedding(text) {
    if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
    }

    // Truncate to avoid token limits
    const truncatedText = text.substring(0, 2000);

    if (isGeminiAvailable()) {
        try {
            return await generateGeminiEmbeddingWithRetry(truncatedText);
        } catch (error) {
            console.warn('[Pro Search] Gemini embedding failed, using fallback:', error.message);
        }
    }

    // Fallback: Simple hash-based embedding (for when Gemini is unavailable)
    return generateSimpleEmbedding(truncatedText);
}

/**
 * Fallback embedding generator (deterministic hash-based)
 */
function generateSimpleEmbedding(text) {
    const keywords = text.toLowerCase().split(/\s+/);
    const embedding = new Array(768).fill(0); // Match Gemini dimension

    keywords.forEach((word, idx) => {
        const hash = word.split('').reduce((acc, char, i) => 
            acc + char.charCodeAt(0) * (i + 1), 0);
        const index = hash % embedding.length;
        embedding[index] += 1 / (idx + 1);
    });

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
}

/**
 * Index ideas from database to ChromaDB
 */
async function indexIdeasToChroma(pool) {
    if (lastIndexTime && (Date.now() - lastIndexTime) < INDEX_REFRESH_INTERVAL) {
        return; // Skip if recently indexed
    }

    try {
        const chromaClient = getChromaClient();
        
        // Check if already indexed
        if (chromaClient.hasCollection('ideas_search')) {
            const stats = chromaClient.getStats('ideas_search');
            if (stats && stats.documentCount > 0) {
                lastIndexTime = Date.now();
                console.log(`[Pro Search] Using existing index with ${stats.documentCount} ideas`);
                return;
            }
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

        // Process in batches
        const batchSize = 20;
        let indexed = 0;

        for (let i = 0; i < result.rows.length; i += batchSize) {
            const batch = result.rows.slice(i, i + batchSize);
            
            const documents = [];
            const embeddings = [];
            const metadatas = [];

            for (const idea of batch) {
                const text = [
                    idea.title,
                    idea.summary || '',
                    idea.challenge_opportunity || '',
                    idea.code_preference || ''
                ].join(' ').trim();

                if (!text) continue;

                try {
                    const embedding = await getEmbedding(text);
                    
                    documents.push(text);
                    embeddings.push(embedding);
                    metadatas.push({
                        idea_id: idea.idea_id,
                        title: idea.title || '',
                        summary: (idea.summary || '').substring(0, 500),
                        domain: idea.challenge_opportunity || '',
                        businessGroup: idea.business_group || '',
                        technologies: idea.code_preference || '',
                        score: idea.score || 0,
                        created_at: idea.created_at?.toISOString() || ''
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
                await new Promise(r => setTimeout(r, 100));
            }
        }

        lastIndexTime = Date.now();
        console.log(`✅ [Pro Search] Indexed ${indexed} ideas to ChromaDB`);

    } catch (error) {
        console.error('[Pro Search] Indexing error:', error.message);
    }
}

/**
 * Semantic search using ChromaDB
 */
async function semanticSearch(query, filters = {}, topK = 25) {
    try {
        const chromaClient = getChromaClient();
        
        if (!chromaClient.hasCollection('ideas_search')) {
            return [];
        }

        // Generate query embedding
        const queryEmbedding = await getEmbedding(query);
        
        // Query ChromaDB
        const results = chromaClient.query('ideas_search', queryEmbedding, topK);
        
        if (!results || results.documents.length === 0) {
            return [];
        }

        // Map results with similarity scores
        const ideas = results.documents.map((doc, idx) => {
            const metadata = results.metadatas[idx] || {};
            const distance = results.distances[idx] || 1;
            const similarity = Math.max(0, Math.round((1 - distance) * 100));

            return {
                id: metadata.idea_id,
                title: metadata.title || 'Untitled',
                description: metadata.summary || doc.substring(0, 300),
                domain: metadata.domain || 'General',
                businessGroup: metadata.businessGroup || 'Unknown',
                technologies: metadata.technologies || '',
                score: metadata.score || 0,
                submissionDate: metadata.created_at || new Date().toISOString(),
                matchScore: similarity
            };
        });

        // Apply filters
        let filtered = ideas;
        
        if (filters.domain?.length > 0) {
            const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
            filtered = filtered.filter(idea => 
                domains.some(d => idea.domain.toLowerCase().includes(d.toLowerCase()))
            );
        }

        if (filters.businessGroup?.length > 0) {
            const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
            filtered = filtered.filter(idea => 
                groups.some(g => idea.businessGroup.toLowerCase().includes(g.toLowerCase()))
            );
        }

        if (filters.techStack?.length > 0) {
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

        // Sort by match score
        return filtered.sort((a, b) => b.matchScore - a.matchScore);

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
 * Generate AI-powered response using Gemini
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

    // Try AI-generated response
    if (isGeminiAvailable() && count > 0) {
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
        const { query, additionalFilters = {} } = req.body;

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

        // STEP 2: Index ideas to ChromaDB (if needed)
        await indexIdeasToChroma(pool);

        // STEP 3: NLP Processing - Spell correction & query expansion
        const apiKey = process.env.API_KEY;
        const nlpResult = await enhanceQuery(trimmedQuery, { 
            useAI: !!apiKey && isGeminiAvailable(), 
            apiKey,
            model: 'gemini-2.0-flash-exp'
        });

        console.log(`[Pro Search] NLP: "${trimmedQuery}" → "${nlpResult.corrected}"`);

        // STEP 4: Parse filters from query
        const filters = parseFilters(nlpResult.corrected, additionalFilters);

        // STEP 5: Semantic search using ChromaDB + Gemini embeddings
        const searchQuery = nlpResult.expanded?.join(' ') || nlpResult.corrected;
        let results = await semanticSearch(searchQuery, filters, 25);

        // STEP 6: Fallback to database if no semantic results
        if (results.length === 0) {
            console.log('[Pro Search] No semantic results, trying database...');
            
            const searchTerms = nlpResult.tokens || [trimmedQuery];
            const likePattern = `%${searchTerms[0]}%`;
            
            const dbResult = await pool.query(`
                SELECT idea_id as id, title, summary as description,
                       challenge_opportunity as domain, business_group as "businessGroup",
                       COALESCE(code_preference, '') as technologies,
                       created_at as "submissionDate", score
                FROM ideas
                WHERE title ILIKE $1 OR summary ILIKE $1 OR challenge_opportunity ILIKE $1
                ORDER BY score DESC, created_at DESC
                LIMIT 20
            `, [likePattern]);

            results = dbResult.rows.map(row => ({
                ...row,
                matchScore: 60 // Default score for DB results
            }));
        }

        // Limit results
        results = results.slice(0, 10);

        // STEP 7: Generate AI response
        const aiResponse = await generateAIResponse(trimmedQuery, results, filters, nlpResult);

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
                filters,
                totalResults: results.length,
                processingTime: duration,
                nlpEnhanced: nlpResult.aiEnhanced || false,
                correctedQuery: nlpResult.corrected,
                originalQuery: trimmedQuery
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
        gemini: isGeminiAvailable(),
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

export default router;
