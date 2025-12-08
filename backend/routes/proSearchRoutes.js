/**
 * Pro Search Routes - Advanced Semantic Search with NLP
 * 
 * Features:
 * - ChromaDB for fast vector similarity search
 * - OpenRouter API for AI responses
 * - NLP query processing with spell correction
 * - Context validation to block off-topic queries
 * - Smart suggestions and query expansion
 */

import express from 'express';
import { validateQuery, extractEntities, generateErrorMessage } from '../services/contextValidator.js';
import { getChromaClient } from '../config/chroma.js';
import { enhanceQuery, processQuery } from '../services/nlpQueryProcessor.js';
import { contextsRouter } from './proSearchContextRoutes.js';

const router = express.Router();

console.log('✅ [Pro Search] Routes loaded with ChromaDB + OpenRouter + NLP');

// Mount context management routes
router.use('/', contextsRouter);

// OpenRouter configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const getOpenRouterKey = () => process.env.OPENROUTER_API_KEY;
const getOpenRouterModel = () => process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';

// Cache for ideas collection
let ideasCollection = null;
let lastIndexTime = null;
let isIndexing = false; // Prevent concurrent indexing
const INDEX_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Generate embedding using local TF-IDF algorithm
 */
async function getEmbedding(text) {
    if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
    }

    // Truncate to avoid token limits
    const truncatedText = text.substring(0, 5000);

    // Use local TF-IDF style embedding (fast and reliable)
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
        const stats = hasCollection ? await chromaClient.getStats('ideas_search') : null;

        // Check DB Count to compare
        const countRes = await pool.query('SELECT COUNT(*) FROM ideas');
        const dbCount = parseInt(countRes.rows[0].count);

        if (hasCollection && stats && stats.documentCount >= dbCount) {
            // Collection exists with data - mark as checked and skip indexing
            lastIndexTime = Date.now();
            indexChecked = true;
            console.log(`[Pro Search] ✅ Using existing index with ${stats.documentCount} ideas (synced with DB)`);
            return;
        }

        console.log(`[Pro Search] Indexing ideas... DB: ${dbCount}, Index: ${stats ? stats.documentCount : 0}`);

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
        `);

        if (result.rows.length === 0) {
            console.log('[Pro Search] No ideas to index');
            return;
        }

        // Process in batches
        const batchSize = 50; // Increased for better throughput
        let indexed = 0;

        for (let i = 0; i < result.rows.length; i += batchSize) {
            const batch = result.rows.slice(i, i + batchSize);

            const documents = [];
            const ids = [];
            const embeddings = [];
            const metadatas = [];

            // Parallelize embedding generation for the batch
            const batchPromises = batch.map(async (idea) => {
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

                if (!textParts || textParts.length < 10) return null;

                try {
                    // Truncate for embedding but keep it comprehensive
                    const embedding = await getEmbedding(textParts.substring(0, 3000));

                    return {
                        id: `IDEA-${idea.idea_id}`,
                        document: textParts,
                        embedding: embedding,
                        metadata: {
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
                            year: idea.created_at ? new Date(idea.created_at).getFullYear() : 0,
                            benefits: (idea.benefits || '').substring(0, 300),
                            risks: (idea.risks || '').substring(0, 300),
                            successMetrics: (idea.success_metrics || '').substring(0, 300)
                        }
                    };
                } catch (embError) {
                    console.warn(`[Pro Search] Failed to embed idea ${idea.idea_id}:`, embError.message);
                    return null;
                }
            });

            const processedBatch = await Promise.all(batchPromises);

            processedBatch.filter(Boolean).forEach(item => {
                ids.push(item.id);
                documents.push(item.document);
                embeddings.push(item.embedding);
                metadatas.push(item.metadata);
            });

            if (documents.length > 0) {
                // Check if collection exists before adding - fail safe
                if (chromaClient.hasCollection('ideas_search')) {
                    await chromaClient.addDocuments('ideas_search', documents, embeddings, metadatas, ids);
                    indexed += documents.length;
                }
            }

            // Small delay to avoid rate limits
            if (i + batchSize < result.rows.length) {
                await new Promise(r => setTimeout(r, 100));
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
 * @param {object} pool - Database pool for fetching accurate created_at dates
 */
async function semanticSearch(query, filters = {}, page = 1, limit = 20, minSimilarity = 50, pool = null) {
    try {
        const chromaClient = getChromaClient();

        if (!chromaClient.hasCollection('ideas_search')) {
            return { results: [], pagination: { page: 1, limit, total: 0, totalPages: 0 }, facets: {} };
        }

        // Generate query embedding
        const queryEmbedding = await getEmbedding(query);

        // Build ChromaDB 'where' clause for enhanced filtering
        const whereClause = {};
        const conditions = [];

        if (filters.year) {
            conditions.push({ year: parseInt(filters.year) });
        }

        // NOTE: Domain filter is applied as post-filter (text search) instead of ChromaDB filter
        // because domain keywords may not exactly match the metadata values

        if (filters.businessGroup && filters.businessGroup.length > 0) {
            const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
            if (groups.length === 1) {
                conditions.push({ businessGroup: groups[0] });
            } else {
                conditions.push({ businessGroup: { "$in": groups } });
            }
        }

        // Combine conditions with $and if multiple exist
        if (conditions.length > 0) {
            if (conditions.length === 1) {
                Object.assign(whereClause, conditions[0]);
            } else {
                whereClause["$and"] = conditions;
            }
        }

        // Query ChromaDB with filter pushdown
        const topK = Math.min(200, limit * 10);
        const results = chromaClient.query('ideas_search', queryEmbedding, topK, Object.keys(whereClause).length > 0 ? whereClause : undefined);

        if (!results || results.documents.length === 0) {
            return { results: [], pagination: { page: 1, limit, total: 0, totalPages: 0 }, facets: {} };
        }

        // Map results with similarity scores
        let ideas = results.documents.map((doc, idx) => {
            const metadata = results.metadatas[idx] || {};
            const distance = results.distances[idx] || 1;
            // Semantic score from Chroma
            const similarity = Math.max(0, Math.round((1 - distance) * 100));
            const dbId = metadata.idea_id;

            // Keyword Verification (Hybrid Search)
            // Fix for "hallucinated" high scores on garbage queries like "green elephant"
            const queryTokens = query.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'this', 'that', 'what', 'how', 'who', 'why', 'are', 'is', 'was'].includes(w));

            const contentText = (metadata.title + ' ' + metadata.summary + ' ' + (metadata.technologies || '') + ' ' + (metadata.domain || '')).toLowerCase();
            const hasKeywordMatch = queryTokens.some(token => contentText.includes(token));

            // If no keyword match for words > 2 chars, punish score significantly
            // But allow "fuzzy" semantic matches if very high (e.g. > 90) - unlikely with this model
            let finalScore = similarity;
            if (queryTokens.length > 0 && !hasKeywordMatch) {
                // If it's a "filter only" query (e.g. "year 2025"), we might have empty queryTokens (if year is filtered out or handled elsewhere)
                // But parseFilters handles year. Here we check text.
                // If query is "green elephant", tokens are "green", "elephant".
                // No match -> penalty.
                // Improve precision: reduce score by factor or set to 0.
                finalScore = 0;
                // console.log(`[Pro Search] Penalty: "${query}" vs "${metadata.title}" (Score ${similarity} -> 0)`);
            }

            return {
                id: `IDEA-${dbId}`,
                dbId: dbId,
                title: metadata.title || 'Untitled',
                description: metadata.summary || doc.substring(0, 500),
                domain: metadata.domain || 'General',
                businessGroup: metadata.businessGroup || 'Unknown',
                technologies: metadata.technologies || '',
                score: metadata.score || 0,
                submissionDate: metadata.created_at || null,
                matchScore: finalScore,
                benefits: metadata.benefits || '',
                risks: metadata.risks || '',
                buildPhase: metadata.buildPhase || '',
                buildPreference: metadata.buildPreference || ''
            };
        });

        // Apply similarity threshold
        ideas = ideas.filter(idea => idea.matchScore >= minSimilarity);

        // Apply filters (backup logic)
        let filtered = ideas;

        // TechStack filter - post-filter since ChromaDB doesn't support partial string matching
        if (filters.techStack?.length > 0) {
            const techs = Array.isArray(filters.techStack) ? filters.techStack : [filters.techStack];
            console.log(`[Pro Search] Applying techStack filter: ${techs.join(', ')}`);
            filtered = filtered.filter(idea => {
                const ideaTech = (idea.technologies || '').toLowerCase();
                return techs.some(t => ideaTech.includes(t.toLowerCase()));
            });
            console.log(`[Pro Search] TechStack filter applied, ${filtered.length} results remaining`);
        }

        // Domain/Theme filter - STRICT: must match one of selected domains
        if (filters.domain?.length > 0) {
            const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
            console.log(`[Pro Search] Applying STRICT domain filter: ${domains.join(', ')}`);
            filtered = filtered.filter(idea => {
                const ideaDomain = (idea.domain || '').toLowerCase();
                return domains.some(d => ideaDomain.includes(d.toLowerCase()));
            });
            console.log(`[Pro Search] Domain filter applied, ${filtered.length} results remaining`);
        }

        // BusinessGroup filter - STRICT: must match one of selected business groups
        if (filters.businessGroup?.length > 0) {
            const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
            console.log(`[Pro Search] Applying STRICT businessGroup filter: ${groups.join(', ')}`);
            filtered = filtered.filter(idea => {
                const ideaBG = (idea.businessGroup || '').toLowerCase();
                return groups.some(g => ideaBG.includes(g.toLowerCase()));
            });
            console.log(`[Pro Search] BusinessGroup filter applied, ${filtered.length} results remaining`);
        }

        // Year filter - ALWAYS fetch accurate dates from database when year filter is set
        const yearFilter = filters.year ? parseInt(filters.year) : null;
        console.log(`[Pro Search] Year filter check: year=${yearFilter}, results=${filtered.length}, pool=${!!pool}`);

        if (yearFilter && filtered.length > 0) {
            if (pool) {
                try {
                    const ideaIds = filtered.map(i => i.dbId).filter(Boolean);
                    if (ideaIds.length > 0) {
                        const dateResult = await pool.query(
                            `SELECT idea_id, created_at FROM ideas WHERE idea_id = ANY($1::int[])`,
                            [ideaIds]
                        );
                        const dateMap = new Map(dateResult.rows.map(r => [r.idea_id, r.created_at]));

                        // Update submissionDate from database and filter by year
                        filtered = filtered
                            .map(idea => ({
                                ...idea,
                                submissionDate: dateMap.get(idea.dbId) || idea.submissionDate
                            }))
                            .filter(idea => {
                                if (!idea.submissionDate) return false;
                                const ideaYear = new Date(idea.submissionDate).getFullYear();
                                return ideaYear === yearFilter;
                            });
                    }
                } catch (e) {
                    console.warn('[Pro Search] Failed to fetch dates from DB:', e.message);
                    // Fallback: filter using metadata dates
                    filtered = filtered.filter(idea => {
                        if (!idea.submissionDate) return false;
                        const ideaYear = new Date(idea.submissionDate).getFullYear();
                        return ideaYear === yearFilter;
                    });
                }
            } else {
                // No pool - filter using metadata dates
                filtered = filtered.filter(idea => {
                    if (!idea.submissionDate) return false;
                    const ideaYear = new Date(idea.submissionDate).getFullYear();
                    return ideaYear === yearFilter;
                });
            }
            console.log(`[Pro Search] Year filter ${yearFilter} applied, ${filtered.length} results remaining`);
        }

        // Sort by match score
        filtered = filtered.sort((a, b) => b.matchScore - a.matchScore);

        // Calculate facets
        const facets = calculateFacets(filtered);

        // Apply pagination
        const total = filtered.length;
        const totalPages = Math.ceil(total / limit);
        const startIdx = (page - 1) * limit;
        const endIdx = startIdx + limit;
        const paginatedResults = filtered.slice(startIdx, endIdx);

        return {
            results: paginatedResults,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
            facets
        };

    } catch (error) {
        console.error('[Pro Search] Semantic search error:', error.message);
        return { results: [], pagination: { page: 1, limit, total: 0, totalPages: 0 }, facets: {} };
    }
}

/**
 * Calculate facet counts for available filters
 */
function calculateFacets(ideas) {
    const facets = {
        domains: {},
        businessGroups: {},
        technologies: {},
        buildPhases: {},
        years: {}
    };

    ideas.forEach(idea => {
        if (idea.domain) facets.domains[idea.domain] = (facets.domains[idea.domain] || 0) + 1;
        if (idea.businessGroup && idea.businessGroup !== 'Unknown') facets.businessGroups[idea.businessGroup] = (facets.businessGroups[idea.businessGroup] || 0) + 1;
        if (idea.technologies) {
            const techs = idea.technologies.split(',').map(t => t.trim()).filter(Boolean);
            techs.forEach(tech => facets.technologies[tech] = (facets.technologies[tech] || 0) + 1);
        }
        if (idea.buildPhase) facets.buildPhases[idea.buildPhase] = (facets.buildPhases[idea.buildPhase] || 0) + 1;
        if (idea.submissionDate) {
            const year = new Date(idea.submissionDate).getFullYear();
            facets.years[year] = (facets.years[year] || 0) + 1;
        }
    });

    Object.keys(facets).forEach(facetType => {
        const sorted = Object.entries(facets[facetType])
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);
        facets[facetType] = Object.fromEntries(sorted);
    });

    return facets;
}

/**
 * Parse filters from natural language query
 * Supports: year, createdFrom, createdTo, challengeOpportunity, domain, techStack, businessGroup
 * Merges with additionalFilters from frontend (cumulative filtering)
 */
function parseFilters(query, additionalFilters = {}) {
    const filters = {};
    const normalizedQuery = query.toLowerCase();

    // Start with existing filters from frontend (cumulative)
    if (additionalFilters.domain) {
        filters.domain = Array.isArray(additionalFilters.domain) ? [...additionalFilters.domain] : [additionalFilters.domain];
    }
    if (additionalFilters.techStack) {
        filters.techStack = Array.isArray(additionalFilters.techStack) ? [...additionalFilters.techStack] : [additionalFilters.techStack];
    }
    if (additionalFilters.businessGroup) {
        filters.businessGroup = Array.isArray(additionalFilters.businessGroup) ? [...additionalFilters.businessGroup] : [additionalFilters.businessGroup];
    }
    if (additionalFilters.year) filters.year = additionalFilters.year;
    if (additionalFilters.createdFrom) filters.createdFrom = additionalFilters.createdFrom;
    if (additionalFilters.createdTo) filters.createdTo = additionalFilters.createdTo;
    if (additionalFilters.challengeOpportunity) filters.challengeOpportunity = additionalFilters.challengeOpportunity;

    // Year detection from query text (only if not already set)
    const yearMatch = query.match(/\b(202[0-9]|2030)\b/);
    if (yearMatch && !filters.year) filters.year = parseInt(yearMatch[0]);

    // Domain detection keywords - ADD to existing domains
    const domainMap = {
        'healthcare': ['healthcare', 'medical', 'hospital', 'patient', 'clinical', 'health'],
        'finance': ['finance', 'banking', 'payment', 'fintech', 'loan', 'financial'],
        'retail': ['retail', 'ecommerce', 'e-commerce', 'shop', 'store', 'inventory'],
        'ai': ['artificial intelligence', 'machine learning', 'ml', 'deep learning', 'neural', 'genai', 'llm'],
        'blockchain': ['blockchain', 'web3', 'crypto', 'cryptocurrency', 'nft', 'smart contract', 'ethereum', 'bitcoin', 'defi', 'distributed ledger'],
        'cloud': ['cloud', 'aws', 'azure', 'gcp', 'infrastructure', 'serverless'],
        'security': ['security', 'cybersecurity', 'authentication', 'encryption'],
        'iot': ['iot', 'internet of things', 'sensors', 'embedded', 'edge computing'],
        'data': ['data analytics', 'big data', 'data science', 'visualization', 'dashboard']
    };

    for (const [domain, keywords] of Object.entries(domainMap)) {
        if (keywords.some(kw => normalizedQuery.includes(kw))) {
            if (!filters.domain) filters.domain = [];
            if (!filters.domain.includes(domain)) filters.domain.push(domain);
        }
    }

    // TechStack detection from query text - use word boundaries to avoid false positives
    const techMap = {
        'react': ['\\breact\\b', '\\breactjs\\b', '\\breact\\.js\\b'],
        'python': ['\\bpython\\b', '\\bdjango\\b', '\\bflask\\b', '\\bfastapi\\b'],
        'javascript': ['\\bjavascript\\b', '\\bnodejs\\b', '\\bnode\\.js\\b'],
        'typescript': ['\\btypescript\\b'],
        'java': ['\\bjava\\b', '\\bspring\\b', '\\bspringboot\\b'],
        'golang': ['\\bgolang\\b', '\\bgo lang\\b'],
        'rust': ['\\brust\\b', '\\brustlang\\b'],
        'aws': ['\\baws\\b', '\\bamazon web services\\b', '\\blambda\\b'],
        'azure': ['\\bazure\\b', '\\bmicrosoft azure\\b'],
        'gcp': ['\\bgcp\\b', '\\bgoogle cloud\\b'],
        'docker': ['\\bdocker\\b', '\\bkubernetes\\b', '\\bk8s\\b'],
        'tensorflow': ['\\btensorflow\\b', '\\bkeras\\b'],
        'pytorch': ['\\bpytorch\\b'],
        'sql': ['\\bsql\\b', '\\bpostgresql\\b', '\\bmysql\\b', '\\bpostgres\\b'],
        'mongodb': ['\\bmongodb\\b', '\\bmongo\\b', '\\bnosql\\b'],
        'graphql': ['\\bgraphql\\b', '\\bapollo\\b'],
        'flutter': ['\\bflutter\\b', '\\bdart\\b'],
        'swift': ['\\bswift\\b', '\\bswiftui\\b'],
        'kotlin': ['\\bkotlin\\b']
    };

    for (const [tech, patterns] of Object.entries(techMap)) {
        if (patterns.some(pattern => new RegExp(pattern, 'i').test(normalizedQuery))) {
            if (!filters.techStack) filters.techStack = [];
            if (!filters.techStack.includes(tech)) filters.techStack.push(tech);
        }
    }

    console.log(`[Pro Search] Parsed filters:`, JSON.stringify(filters));
    return filters;
}

/**
 * Generate AI-powered response using OpenRouter
 */
async function generateAIResponse(query, results, filters, nlpResult) {
    if (!results) return 'Search completed.';
    const count = results.length;

    if (count === 0) {
        let response = `I couldn't find exact matches for "${query}".`;
        const filterParts = [];
        if (filters.year) filterParts.push(`year ${filters.year}`);
        if (filters.domain?.length) filterParts.push(`domain: ${filters.domain.join(', ')}`);
        if (filters.techStack?.length) filterParts.push(`tech: ${filters.techStack.join(', ')}`);
        if (filterParts.length > 0) {
            response += ` Filters applied: ${filterParts.join(', ')}.`;
        }
        response += ' Try broader keywords or fewer filters.';
        return response;
    }

    const openRouterKey = getOpenRouterKey();
    if (openRouterKey && count > 0) {
        try {
            const topIdeas = results.slice(0, 3).map(r => r.title).join(', ');
            const domains = [...new Set(results.slice(0, 5).map(r => r.domain))].join(', ');

            const prompt = `You are a helpful assistant for an innovation idea repository. 
A user searched for: "${query}"
Found ${count} matching ideas. Top results: ${topIdeas}
Domains covered: ${domains}

Write a brief, friendly 1-2 sentence response summarizing what was found. Be concise.`;

            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openRouterKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'IdeaFlow Pro Search'
                },
                body: JSON.stringify({
                    model: getOpenRouterModel(),
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });

            if (response.ok) {
                const data = await response.json();
                const aiText = data.choices?.[0]?.message?.content?.trim();
                if (aiText && aiText.length > 10) return aiText;
            }
        } catch (error) {
            console.warn('[Pro Search] OpenRouter AI response failed:', error.message);
        }
    }

    let response = `Found ${count} idea${count > 1 ? 's' : ''} matching your search`;
    const filterParts = [];
    if (filters.year) filterParts.push(`from ${filters.year}`);
    if (filters.domain?.length) filterParts.push(`in ${filters.domain.join(', ')}`);
    if (filterParts.length > 0) response += ` ${filterParts.join(' ')}`;
    return response + '.';
}

/**
 * Generate smart suggestions
 */
function generateSuggestions(query, results, filters) {
    const suggestions = new Set();
    if (!results || !Array.isArray(results)) return [];

    if (results.length > 0) {
        const topDomains = [...new Set(results.slice(0, 5).map(r => r.domain).filter(Boolean))];
        if (topDomains[0]) suggestions.add(`More ${topDomains[0]} ideas`);
    }

    if (!filters.year) suggestions.add('Ideas from 2024');
    return Array.from(suggestions).slice(0, 4);
}

/**
 * POST /api/search/conversational - Main Pro Search endpoint
 */
router.post('/conversational', async (req, res) => {
    const startTime = Date.now();

    try {
        const {
            query,
            additionalFilters = {},
            page = 1,
            limit = 20,
            minSimilarity = 30,
            overrideValidation = false
        } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: true, message: 'Query is required' });
        }

        const trimmedQuery = query.trim();

        // Context Validation
        const validation = validateQuery(trimmedQuery);
        if (validation.isGreeting) {
            return res.json({
                results: [],
                aiResponse: "Hi there! I can help you find innovation ideas.",
                suggestions: ['Show me latest ideas', 'Find AI projects'],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
                facets: {},
                metadata: { intent: 'greeting', filters: {}, totalResults: 0 }
            });
        }

        if (!validation.valid) {
            return res.json({
                results: [],
                aiResponse: "I can't process that query.",
                suggestions: [],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
                facets: {},
                metadata: { intent: 'rejected', filters: {}, totalResults: 0 }
            });
        }

        console.log(`[Pro Search] Processing: "${trimmedQuery}"`);

        const pool = req.app.get('db');
        if (!pool) return res.status(503).json({ error: true, message: 'Database error' });

        // Detect filter-only queries (e.g., "filter by 2024", "show 2024 ideas", "year 2024", "Ideas from 2024")
        const isFilterOnlyQuery = /^(filter|show|get|find|list)?\s*(by|from|for|in)?\s*(year\s*)?(202[0-9]|2030)\s*(ideas?)?$/i.test(trimmedQuery) ||
            /^(202[0-9]|2030)\s*(ideas?)?$/i.test(trimmedQuery) ||
            /^(ideas?\s*)?(from|in|of)\s*(202[0-9]|2030)$/i.test(trimmedQuery) ||
            /^(filter|show)\s*(by)?\s*(year|date)/i.test(trimmedQuery);

        // Parse filters first to detect year
        const preFilters = parseFilters(trimmedQuery, additionalFilters);

        // Check if we have any STRICT filters from UI (additionalFilters)
        const hasYearFilter = additionalFilters.year || preFilters.year;
        const hasTechFilter = additionalFilters.techStack?.length > 0;
        const hasDomainFilter = additionalFilters.domain?.length > 0;
        const hasBusinessGroupFilter = additionalFilters.businessGroup?.length > 0;
        const hasStrictUIFilters = hasTechFilter || hasDomainFilter || hasBusinessGroupFilter;

        // ALWAYS use direct DB search when UI filters are provided (strict filtering)
        // BUT only ignore the text query if it's clearly just a filter request
        if (hasStrictUIFilters || (isFilterOnlyQuery && hasYearFilter)) {
            console.log(`[Pro Search] STRICT DB search - year: ${hasYearFilter}, tech: ${hasTechFilter}, domain: ${hasDomainFilter}, bg: ${hasBusinessGroupFilter}`);

            // Build dynamic query with filters
            const conditions = [];
            const params = [];
            let paramIndex = 1;

            // Year filter
            const yearValue = preFilters.year || additionalFilters.year;
            if (yearValue) {
                conditions.push(`EXTRACT(YEAR FROM created_at) = $${paramIndex}`);
                params.push(parseInt(yearValue));
                paramIndex++;
            }

            // TechStack filter
            const techValues = preFilters.techStack || additionalFilters.techStack || [];
            if (techValues.length > 0) {
                const techConditions = techValues.map((_, idx) => `code_preference ILIKE $${paramIndex + idx}`);
                conditions.push(`(${techConditions.join(' OR ')})`);
                techValues.forEach(t => params.push(`%${t}%`));
                paramIndex += techValues.length;
            }

            // Domain filter
            const domainValues = preFilters.domain || additionalFilters.domain || [];
            if (domainValues.length > 0) {
                const domainConditions = domainValues.map((_, idx) => `challenge_opportunity ILIKE $${paramIndex + idx}`);
                conditions.push(`(${domainConditions.join(' OR ')})`);
                domainValues.forEach(d => params.push(`%${d}%`));
                paramIndex += domainValues.length;
            }

            // Business Group filter
            const bgValues = preFilters.businessGroup || additionalFilters.businessGroup || [];
            if (bgValues.length > 0) {
                const bgConditions = bgValues.map((_, idx) => `business_group ILIKE $${paramIndex + idx}`);
                conditions.push(`(${bgConditions.join(' OR ')})`);
                bgValues.forEach(bg => params.push(`%${bg}%`));
                paramIndex += bgValues.length;
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            params.push(limit);

            let dbResult = await pool.query(`
                SELECT idea_id, title, summary as description,
                       challenge_opportunity as domain, business_group as "businessGroup",
                       COALESCE(code_preference, '') as technologies,
                       created_at as "submissionDate", score
                FROM ideas
                ${whereClause}
                ORDER BY score DESC, created_at DESC
                LIMIT $${paramIndex}
            `, params);

            // FALLBACK: If no results, try broader search or return top ideas
            if (dbResult.rows.length === 0) {
                console.log(`[Pro Search] No strict matches, trying fallback...`);

                // Try with just year filter if we had domain/tech filters
                if (yearValue && (domainValues.length > 0 || techValues.length > 0)) {
                    dbResult = await pool.query(`
                        SELECT idea_id, title, summary as description,
                               challenge_opportunity as domain, business_group as "businessGroup",
                               COALESCE(code_preference, '') as technologies,
                               created_at as "submissionDate", score
                        FROM ideas
                        WHERE EXTRACT(YEAR FROM created_at) = $1
                        ORDER BY score DESC, created_at DESC
                        LIMIT $2
                    `, [parseInt(yearValue), limit]);
                    console.log(`[Pro Search] Year-only fallback found ${dbResult.rows.length} results`);
                }

                // Last resort: return top ideas
                if (dbResult.rows.length === 0) {
                    dbResult = await pool.query(`
                        SELECT idea_id, title, summary as description,
                               challenge_opportunity as domain, business_group as "businessGroup",
                               COALESCE(code_preference, '') as technologies,
                               created_at as "submissionDate", score
                        FROM ideas
                        ORDER BY score DESC, created_at DESC
                        LIMIT $1
                    `, [limit]);
                    console.log(`[Pro Search] Top ideas fallback returned ${dbResult.rows.length} results`);
                }
            }

            const results = dbResult.rows.map(row => ({
                id: `IDEA-${row.idea_id}`,
                dbId: row.idea_id,
                title: row.title,
                description: row.description,
                domain: row.domain || 'General',
                businessGroup: row.businessGroup || 'Unknown',
                technologies: row.technologies || '',
                submissionDate: row.submissionDate,
                score: row.score || 0,
                matchScore: 85
            }));

            const duration = Date.now() - startTime;
            const filterDesc = [];
            if (yearValue) filterDesc.push(`year ${yearValue}`);
            if (techValues.length > 0) filterDesc.push(`tech: ${techValues.join(', ')}`);
            if (domainValues.length > 0) filterDesc.push(`domain: ${domainValues.join(', ')}`);

            console.log(`[Pro Search] Direct DB search completed in ${duration}ms, found ${results.length} results`);

            // Generate helpful AI response
            let aiMsg;
            if (results.length > 0) {
                aiMsg = `Found ${results.length} ideas${filterDesc.length > 0 ? ` filtered by ${filterDesc.join(', ')}` : ''}.`;
            } else {
                aiMsg = `No exact matches found for your filters. Try broader search terms or fewer filters.`;
            }

            return res.json({
                results,
                aiResponse: aiMsg,
                suggestions: results.length === 0 ? ['Show all ideas', 'Clear filters', 'Try different keywords'] : ['Show AI projects', 'Find blockchain ideas', 'Healthcare innovations'],
                pagination: { page: 1, limit, total: results.length, totalPages: 1, hasNext: false, hasPrev: false },
                facets: calculateFacets(results),
                metadata: { intent: 'filter', filters: { ...preFilters, ...additionalFilters }, totalResults: results.length }
            });
        }

        // Asynchronous Indexing Check (Don't await to block search)
        if (!lastIndexTime) {
            indexIdeasToChroma(pool).catch(e => console.error('[Pro Search] Background indexing error:', e));
        } else if (Date.now() - lastIndexTime > INDEX_REFRESH_INTERVAL && !isIndexing) {
            indexIdeasToChroma(pool).catch(e => console.error('[Pro Search] Background refresh error:', e));
        }

        const openRouterKey = process.env.OPENROUTER_API_KEY;

        const nlpResult = await enhanceQuery(trimmedQuery, {
            useAI: !!openRouterKey,
            openRouterKey: openRouterKey,
            openRouterModel: process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free'
        });

        // IMPORTANT: Only parse filters from ORIGINAL query and explicit UI filters
        // Do NOT parse filters from AI-enhanced query to avoid false positives
        const filters = parseFilters(trimmedQuery, additionalFilters);

        // Only set year if explicitly in original query or UI filters
        if (!filters.year && additionalFilters.year) {
            filters.year = parseInt(additionalFilters.year);
        }

        // Clean up empty arrays to avoid false filter application
        if (filters.domain?.length === 0) delete filters.domain;
        if (filters.techStack?.length === 0) delete filters.techStack;
        if (filters.businessGroup?.length === 0) delete filters.businessGroup;

        console.log(`[Pro Search] Final merged filters:`, JSON.stringify(filters));

        const searchQuery = nlpResult.expanded?.join(' ') || nlpResult.corrected;
        let searchResult = await semanticSearch(searchQuery, filters, page, limit, minSimilarity, pool);

        // Fallback to database if no semantic results (CORRECTED LOGIC)
        if (searchResult.results.length === 0 && page === 1) {
            console.log('[Pro Search] No semantic results, using keyword fallback...');

            const searchTerms = nlpResult.tokens || trimmedQuery.split(/\s+/);
            const primaryTerm = searchTerms[0] || trimmedQuery;

            // Group 1: Text Search Conditions (OR logic for robustness)
            const textConditions = [];
            const significantTerms = searchTerms.filter(t => t.length > 2).slice(0, 3);
            let params = [];
            let paramIndex = 1;

            if (significantTerms.length > 0) {
                // Combine terms with OR - matches ANY of the significant terms
                const termConditions = [];
                for (const term of significantTerms) {
                    termConditions.push(`(title ILIKE $${paramIndex} OR summary ILIKE $${paramIndex} OR challenge_opportunity ILIKE $${paramIndex})`);
                    params.push(`%${term}%`);
                    paramIndex++;
                }
                textConditions.push(`(${termConditions.join(' OR ')})`);
            } else {
                // Fallback for very short queries
                textConditions.push(`(title ILIKE $${paramIndex} OR summary ILIKE $${paramIndex})`);
                params.push(`%${primaryTerm}%`);
                paramIndex++;
            }

            // Group 2: Filter Conditions (AND logic - must match filter)
            const filterConditions = [];
            if (filters.year) {
                filterConditions.push(`EXTRACT(YEAR FROM created_at) = $${paramIndex}`);
                params.push(filters.year);
                paramIndex++;
            }
            if (filters.createdFrom) {
                filterConditions.push(`created_at >= $${paramIndex}`);
                params.push(filters.createdFrom);
                paramIndex++;
            }
            if (filters.createdTo) {
                filterConditions.push(`created_at <= $${paramIndex}`);
                params.push(filters.createdTo);
                paramIndex++;
            }
            if (filters.challengeOpportunity) {
                filterConditions.push(`challenge_opportunity ILIKE $${paramIndex}`);
                params.push(`%${filters.challengeOpportunity}%`);
                paramIndex++;
            }

            // TechStack filter
            if (filters.techStack?.length > 0) {
                const techConditions = filters.techStack.map((_, idx) => `code_preference ILIKE $${paramIndex + idx}`);
                filterConditions.push(`(${techConditions.join(' OR ')})`);
                filters.techStack.forEach(t => params.push(`%${t}%`));
                paramIndex += filters.techStack.length;
            }

            // Domain filter (array) - search across title, summary, and challenge_opportunity
            if (filters.domain?.length > 0) {
                const domainConditions = filters.domain.map((_, idx) => {
                    const p = paramIndex + idx;
                    return `(title ILIKE $${p} OR summary ILIKE $${p} OR challenge_opportunity ILIKE $${p})`;
                });
                filterConditions.push(`(${domainConditions.join(' OR ')})`);
                filters.domain.forEach(d => params.push(`%${d}%`));
                paramIndex += filters.domain.length;
            }

            // Business Group filter (array)
            if (filters.businessGroup?.length > 0) {
                const bgConditions = filters.businessGroup.map((_, idx) => `business_group ILIKE $${paramIndex + idx}`);
                filterConditions.push(`(${bgConditions.join(' OR ')})`);
                filters.businessGroup.forEach(bg => params.push(`%${bg}%`));
                paramIndex += filters.businessGroup.length;
            }

            // Combine: (Text OR Match) AND (Filter Match)
            let whereClause = textConditions.join(' OR '); // Text part
            if (filterConditions.length > 0) {
                whereClause = `(${whereClause}) AND ${filterConditions.join(' AND ')}`;
            }

            const dbResult = await pool.query(`
                SELECT idea_id, title, summary as description,
                       challenge_opportunity as domain, business_group as "businessGroup",
                       COALESCE(code_preference, '') as technologies,
                       created_at as "submissionDate", score
                FROM ideas
                WHERE ${whereClause}
                ORDER BY score DESC, created_at DESC
                LIMIT ${limit * 5}
            `, params);

            let dbResults = dbResult.rows.map(row => ({
                id: `IDEA-${row.idea_id}`,
                dbId: row.idea_id,
                title: row.title,
                description: row.description,
                domain: row.domain || 'General',
                businessGroup: row.businessGroup || 'Unknown',
                technologies: row.technologies || '',
                submissionDate: row.submissionDate,
                score: row.score || 0,
                matchScore: 65,
                benefits: '', risks: '', buildPhase: '', buildPreference: ''
            }));

            // If no results and we have domain filter, try without domain filter
            if (dbResults.length === 0 && filters.domain?.length > 0) {
                console.log('[Pro Search] No results with domain filter, trying broader search...');

                // Build query without domain filter
                const broaderParams = [];
                let broaderParamIndex = 1;
                const broaderConditions = [];

                // Keep year filter if present
                if (filters.year) {
                    broaderConditions.push(`EXTRACT(YEAR FROM created_at) = $${broaderParamIndex}`);
                    broaderParams.push(filters.year);
                    broaderParamIndex++;
                }

                // Keep techStack filter if present
                if (filters.techStack?.length > 0) {
                    const techConds = filters.techStack.map((_, idx) => `code_preference ILIKE $${broaderParamIndex + idx}`);
                    broaderConditions.push(`(${techConds.join(' OR ')})`);
                    filters.techStack.forEach(t => broaderParams.push(`%${t}%`));
                    broaderParamIndex += filters.techStack.length;
                }

                // Add text search for the domain keywords
                const domainKeywords = filters.domain.join(' ');
                broaderConditions.push(`(title ILIKE $${broaderParamIndex} OR summary ILIKE $${broaderParamIndex} OR challenge_opportunity ILIKE $${broaderParamIndex})`);
                broaderParams.push(`%${domainKeywords}%`);
                broaderParamIndex++;

                const broaderWhere = broaderConditions.length > 0 ? `WHERE ${broaderConditions.join(' AND ')}` : '';
                broaderParams.push(limit * 3);

                const broaderResult = await pool.query(`
                    SELECT idea_id, title, summary as description,
                           challenge_opportunity as domain, business_group as "businessGroup",
                           COALESCE(code_preference, '') as technologies,
                           created_at as "submissionDate", score
                    FROM ideas
                    ${broaderWhere}
                    ORDER BY score DESC, created_at DESC
                    LIMIT $${broaderParamIndex}
                `, broaderParams);

                dbResults = broaderResult.rows.map(row => ({
                    id: `IDEA-${row.idea_id}`,
                    dbId: row.idea_id,
                    title: row.title,
                    description: row.description,
                    domain: row.domain || 'General',
                    businessGroup: row.businessGroup || 'Unknown',
                    technologies: row.technologies || '',
                    submissionDate: row.submissionDate,
                    score: row.score || 0,
                    matchScore: 55,
                    benefits: '', risks: '', buildPhase: '', buildPreference: ''
                }));

                console.log(`[Pro Search] Broader search found ${dbResults.length} results`);
            }

            // Last resort: if still no results, return top ideas
            if (dbResults.length === 0) {
                console.log('[Pro Search] No matches, returning top ideas as suggestions...');
                const topResult = await pool.query(`
                    SELECT idea_id, title, summary as description,
                           challenge_opportunity as domain, business_group as "businessGroup",
                           COALESCE(code_preference, '') as technologies,
                           created_at as "submissionDate", score
                    FROM ideas
                    ORDER BY score DESC, created_at DESC
                    LIMIT ${limit}
                `);

                dbResults = topResult.rows.map(row => ({
                    id: `IDEA-${row.idea_id}`,
                    dbId: row.idea_id,
                    title: row.title,
                    description: row.description,
                    domain: row.domain || 'General',
                    businessGroup: row.businessGroup || 'Unknown',
                    technologies: row.technologies || '',
                    submissionDate: row.submissionDate,
                    score: row.score || 0,
                    matchScore: 40,
                    benefits: '', risks: '', buildPhase: '', buildPreference: ''
                }));
            }

            const total = dbResults.length;
            const totalPages = Math.ceil(total / limit);
            const startIdx = (page - 1) * limit;
            const endIdx = startIdx + limit;

            searchResult = {
                results: dbResults.slice(startIdx, endIdx),
                pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
                facets: calculateFacets(dbResults)
            };
        }

        const aiResponse = page === 1
            ? await generateAIResponse(trimmedQuery, searchResult.results, filters, nlpResult)
            : `Showing page ${page}`;

        const suggestions = page === 1 ? generateSuggestions(trimmedQuery, searchResult.results, filters) : [];
        const duration = Date.now() - startTime;

        res.json({
            results: searchResult.results,
            aiResponse,
            suggestions,
            pagination: searchResult.pagination,
            facets: searchResult.facets,
            metadata: {
                intent: 'search',
                filters,
                totalResults: searchResult.pagination.total,
                processingTime: duration,
                nlpEnhanced: nlpResult.aiEnhanced || false,
                correctedQuery: nlpResult.corrected
            }
        });

    } catch (error) {
        console.error('[Pro Search] Error:', error);
        res.status(500).json({ error: true, message: 'Search failed' });
    }
});

router.get('/suggestions', async (req, res) => {
    res.json({ suggestions: ['Show me latest ideas', 'Find AI projects'] });
});

router.post('/reindex', async (req, res) => {
    try {
        const pool = req.app.get('db');
        if (!pool) return res.status(503).json({ error: true });

        lastIndexTime = null;
        const chromaClient = getChromaClient();
        chromaClient.deleteCollection('ideas_search');
        await indexIdeasToChroma(pool);
        res.json({ success: true, message: 'Reindexed' });
    } catch (e) {
        res.status(500).json({ error: true });
    }
});

router.get('/health', async (req, res) => {
    res.json({ status: 'ok', openRouter: !!getOpenRouterKey() });
});

// Export initialization for server startup
export const initializeSearchIndex = async (pool) => {
    console.log('[Pro Search] Initializing search index on startup...');
    try {
        await indexIdeasToChroma(pool);
        console.log('[Pro Search] Integration ready.');
    } catch (e) {
        console.error('[Pro Search] Integration init failed:', e);
    }
};

export default router;
