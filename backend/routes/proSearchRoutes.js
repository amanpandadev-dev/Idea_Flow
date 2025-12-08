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
import { contextsRouter } from './proSearchContextRoutes.js';

const router = express.Router();

console.log('✅ [Pro Search] Routes loaded with ChromaDB + Gemini + NLP');

// Mount context management routes
router.use('/', contextsRouter);

// Ensure Gemini is initialized
initializeGemini();

// Cache for ideas collection
let ideasCollection = null;
let lastIndexTime = null;
let isIndexing = false; // Prevent concurrent indexing
const INDEX_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Generate embedding using Gemini (with robust fallback)
 */
async function getEmbedding(text) {
    if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
    }

    // Truncate to avoid token limits
    const truncatedText = text.substring(0, 1500);

    // Try Gemini first, but with quick timeout
    if (isGeminiAvailable()) {
        try {
            const embedding = await Promise.race([
                generateGeminiEmbeddingWithRetry(truncatedText, 2), // Max 2 retries
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Embedding timeout')), 10000)
                )
            ]);
            return embedding;
        } catch (error) {
            console.warn('[Pro Search] Gemini embedding failed, using local fallback');
        }
    }

    // Fallback: TF-IDF style embedding (more meaningful than simple hash)
    return generateLocalEmbedding(truncatedText);
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
            const dbId = metadata.idea_id;

            return {
                id: `IDEA-${dbId}`, // Format as string ID for frontend
                dbId: dbId, // Keep numeric ID for database operations
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

        // STEP 2: Index ideas to ChromaDB (if needed)
        await indexIdeasToChroma(pool);

        // STEP 2.5: Enhance query with conversation context and extract cumulative filters
        let enhancedQuery = trimmedQuery;
        let cumulativeFilters = { ...additionalFilters }; // Start with explicit filters

        if (conversationHistory.length > 0 && isGeminiAvailable()) {
            try {
                // Build context from conversation (exclude welcome messages)
                const contextMessages = conversationHistory
                    .filter(msg => msg.content && !msg.content.includes('Hello! I can help'))
                    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
                    .join('\n');

                if (contextMessages.length > 0) {
                    // Extract cumulative filters from conversation
                    const filterExtractionPrompt = `Analyze this conversation and extract ALL search criteria mentioned:
${contextMessages}

New query: "${trimmedQuery}"

Extract ALL filters mentioned throughout the conversation in JSON format:
{
  "domains": [list of domains/themes like "AI", "healthcare", "finance"],
  "technologies": [list of technologies like "React", "Python"],
  "years": [list of years like 2024, 2023],
  "businessGroups": [list of business groups]
}

Only return the JSON object, nothing else.`;

                    const filterJson = await generateText(filterExtractionPrompt, {
                        maxOutputTokens: 150,
                        temperature: 0.2
                    });

                    // Parse extracted filters
                    try {
                        const cleanJson = filterJson.trim().replace(/```json\n?|```/g, '');
                        const extractedFilters = JSON.parse(cleanJson);

                        // Merge extracted filters with existing ones
                        if (extractedFilters.domains && extractedFilters.domains.length > 0) {
                            cumulativeFilters.domain = cumulativeFilters.domain || [];
                            if (!Array.isArray(cumulativeFilters.domain)) {
                                cumulativeFilters.domain = [cumulativeFilters.domain];
                            }
                            extractedFilters.domains.forEach(d => {
                                if (!cumulativeFilters.domain.includes(d)) {
                                    cumulativeFilters.domain.push(d);
                                }
                            });
                        }

                        if (extractedFilters.technologies && extractedFilters.technologies.length > 0) {
                            cumulativeFilters.techStack = cumulativeFilters.techStack || [];
                            if (!Array.isArray(cumulativeFilters.techStack)) {
                                cumulativeFilters.techStack = [cumulativeFilters.techStack];
                            }
                            extractedFilters.technologies.forEach(t => {
                                if (!cumulativeFilters.techStack.includes(t)) {
                                    cumulativeFilters.techStack.push(t);
                                }
                            });
                        }

                        if (extractedFilters.years && extractedFilters.years.length > 0) {
                            cumulativeFilters.year = extractedFilters.years[extractedFilters.years.length - 1]; // Most recent year
                        }

                        if (extractedFilters.businessGroups && extractedFilters.businessGroups.length > 0) {
                            cumulativeFilters.businessGroup = cumulativeFilters.businessGroup || [];
                            if (!Array.isArray(cumulativeFilters.businessGroup)) {
                                cumulativeFilters.businessGroup = [cumulativeFilters.businessGroup];
                            }
                            extractedFilters.businessGroups.forEach(bg => {
                                if (!cumulativeFilters.businessGroup.includes(bg)) {
                                    cumulativeFilters.businessGroup.push(bg);
                                }
                            });
                        }

                        console.log(`[Pro Search] Cumulative filters extracted:`, cumulativeFilters);
                    } catch (parseErr) {
                        console.warn('[Pro Search] Failed to parse extracted filters:', parseErr.message);
                    }

                    // Enhance query with full context
                    const contextPrompt = `Given this conversation history:
${contextMessages}

The user's new query is: "${trimmedQuery}"

Based on the conversation context, what is the user really looking for? 
Provide a refined, expanded search query that captures the user's intent.
Keep it concise (max 20 words). Only return the refined query, nothing else.`;

                    const refinedQuery = await generateText(contextPrompt, {
                        maxOutputTokens: 50,
                        temperature: 0.3
                    });

                    if (refinedQuery && refinedQuery.length > 5 && refinedQuery.length < 200) {
                        enhancedQuery = refinedQuery.trim();
                        console.log(`[Pro Search] Context-enhanced: "${trimmedQuery}" → "${enhancedQuery}"`);
                    }
                }
            } catch (err) {
                console.warn('[Pro Search] Context enhancement failed:', err.message);
                // Continue with original query
            }
        }

        // STEP 3: NLP Processing - Spell correction & query expansion
        const apiKey = process.env.API_KEY;
        const nlpResult = await enhanceQuery(enhancedQuery, {
            useAI: !!apiKey && isGeminiAvailable(),
            apiKey,
            model: 'gemini-2.5-flash-lite'
        });

        console.log(`[Pro Search] NLP: "${trimmedQuery}" → "${nlpResult.corrected}"`);

        // STEP 4: Parse filters from query and merge with cumulative filters
        const parsedFilters = parseFilters(nlpResult.corrected, {});
        const filters = { ...cumulativeFilters };

        // Merge parsed filters with cumulative filters
        if (parsedFilters.domain) {
            filters.domain = filters.domain || [];
            if (!Array.isArray(filters.domain)) filters.domain = [filters.domain];
            const newDomains = Array.isArray(parsedFilters.domain) ? parsedFilters.domain : [parsedFilters.domain];
            newDomains.forEach(d => {
                if (!filters.domain.includes(d)) filters.domain.push(d);
            });
        }
        if (parsedFilters.year) filters.year = parsedFilters.year;
        if (parsedFilters.techStack) {
            filters.techStack = filters.techStack || [];
            if (!Array.isArray(filters.techStack)) filters.techStack = [filters.techStack];
            const newTechs = Array.isArray(parsedFilters.techStack) ? parsedFilters.techStack : [parsedFilters.techStack];
            newTechs.forEach(t => {
                if (!filters.techStack.includes(t)) filters.techStack.push(t);
            });
        }

        console.log(`[Pro Search] Final filters:`, filters);

        // STEP 5: Semantic search using ChromaDB + Gemini embeddings
        const searchQuery = nlpResult.expanded?.join(' ') || nlpResult.corrected;
        let results = await semanticSearch(searchQuery, filters, 25);

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
 * POST /api/search/conversational-context
 * Context-aware semantic search with cumulative filtering
 */
router.post('/conversational-context', async (req, res) => {
    try {
        const { query, conversationHistory = [], currentFilters = {} } = req.body;

        console.log('[Pro Search Context] Query:', query);
        console.log('[Pro Search Context] Current Filters:', currentFilters);

        // Import filter extraction functions
        const { extractFiltersFromQuery, mergeFilters, generateContextSummary, shouldClearContext } = await import('../services/filterExtractor.js');

        // Check if user wants to clear context
        if (shouldClearContext(query)) {
            return res.json({
                results: [],
                extractedFilters: {},
                mergedFilters: {},
                contextSummary: 'Context cleared. Starting fresh search.',
                contextCleared: true
            });
        }

        // Extract filters from current query
        const extractedFilters = extractFiltersFromQuery(query);
        console.log('[Pro Search Context] Extracted Filters:', extractedFilters);

        // Merge with existing filters
        const mergedFilters = mergeFilters(currentFilters, extractedFilters);
        console.log('[Pro Search Context] Merged Filters:', mergedFilters);

        // Generate context summary
        const contextSummary = generateContextSummary(mergedFilters);

        // Get ChromaDB collection
        const chromaClient = getChromaClient();
        const collection = await chromaClient.getOrCreateCollection({ name: 'ideas_search' });

        // Check if collection has data
        const collectionCount = await collection.count();
        console.log(`[Pro Search Context] Collection has ${collectionCount} documents`);

        if (collectionCount === 0) {
            console.log('[Pro Search Context] Collection is empty, triggering index...');
            const pool = req.app.get('db');
            if (pool) {
                await indexIdeasToChroma(pool);
            }
        }

        // Enhance query with filter context for better semantic search
        let enhancedQuery = query;
        if (Object.keys(mergedFilters).length > 0) {
            const filterParts = [];
            if (mergedFilters.domain) filterParts.push(mergedFilters.domain);
            if (mergedFilters.businessGroup) filterParts.push(mergedFilters.businessGroup);
            if (mergedFilters.year) filterParts.push(`year ${mergedFilters.year}`);
            if (mergedFilters.buildType) filterParts.push(mergedFilters.buildType);
            if (mergedFilters.techStack && mergedFilters.techStack.length > 0) {
                filterParts.push(mergedFilters.techStack.join(' '));
            }
            enhancedQuery = `${query} ${filterParts.join(' ')}`;
            console.log(`[Pro Search Context] Enhanced query: "${enhancedQuery}"`);
        }

        // Generate query embedding with enhanced query
        const queryEmbedding = await getEmbedding(enhancedQuery);

        // Perform semantic search - let the vector similarity do the work
        const searchResults = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: 20
        });

        console.log(`[Pro Search Context] Semantic search returned ${searchResults.metadatas[0]?.length || 0} results`);

        // Check if we got any results
        if (!searchResults.metadatas[0] || searchResults.metadatas[0].length === 0) {
            console.log('[Pro Search Context] No results from semantic search');
            return res.json({
                results: [],
                extractedFilters,
                mergedFilters,
                contextSummary: contextSummary || 'No results found',
                contextCleared: false
            });
        }

        // Format results without strict filtering - trust the semantic search
        const results = searchResults.metadatas[0].map((metadata, index) => ({
            id: `IDEA-${metadata.idea_id}`, // Format as IDEA-{id} for navigation
            dbId: metadata.idea_id, // Keep numeric ID
            title: metadata.title,
            summary: metadata.summary,
            domain: metadata.domain,
            businessGroup: metadata.businessGroup,
            technologies: metadata.technologies ? metadata.technologies.split(',').map(t => t.trim()) : [],
            buildPhase: metadata.buildPhase,
            buildPreference: metadata.buildPreference,
            score: metadata.score,
            similarity: 1 - (searchResults.distances[0][index] || 0),
            created_at: metadata.created_at
        }));

        console.log(`[Pro Search Context] Returning ${results.length} results`);
        console.log(`[Pro Search Context] Sample results:`, results.slice(0, 2).map(r => ({
            title: r.title,
            businessGroup: r.businessGroup,
            similarity: r.similarity.toFixed(3)
        })));

        res.json({
            results,
            extractedFilters,
            mergedFilters,
            contextSummary,
            contextCleared: false
        });

    } catch (error) {
        console.error('[Pro Search Context] Error:', error);
        res.status(500).json({
            error: true,
            message: 'Context-aware search failed',
            details: error.message
        });
    }
});

export default router;
