/**
 * Advanced Search Routes
 * Uses the hybrid search engine (BM25+ + Vector Similarity + RRF)
 */

import express from 'express';
import { hybridSearch, tokenizeQuery, DEFAULT_SEARCH_CONFIG } from '../search-engine.js';

const router = express.Router();

/**
 * Advanced Hybrid Search Endpoint
 * GET /api/search/hybrid?q=query&themes=[]&businessGroups=[]&technologies=[]
 */
router.get('/hybrid', async (req, res) => {
    console.log("[HybridSearch] Request received");

    const pool = req.app.get('db');
    const ai = req.app.get('ai');
    const aiAvailable = req.app.get('aiAvailable');

    if (!pool) return res.status(503).json({ error: 'No database connection' });

    try {
        const { q, themes, businessGroups, technologies } = req.query;
        const userId = req.user ? req.user.user.emp_id : '';

        console.log(`[HybridSearch] Query: "${q}", User: ${userId}`);

        // Parse filters
        const filterThemes = themes ? JSON.parse(themes) : [];
        const filterBGs = businessGroups ? JSON.parse(businessGroups) : [];
        const filterTech = technologies ? JSON.parse(technologies) : [];

        if (!q) {
            return res.status(400).json({ error: 'Query parameter required' });
        }

        // STEP 1: NLP Query Enhancement (if AI available)
        let refinedQuery = q.toString();
        if (aiAvailable && ai) {
            try {
                const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
                const prompt = `You are an intelligent search query optimizer for an innovation idea repository.

Task: Analyze and enhance the user's search query to improve search results.

User Query: "${q}"

Instructions:
1. Fix any spelling errors
2. Expand abbreviations and acronyms (e.g., "AI" → "artificial intelligence", "ML" → "machine learning")
3. Add relevant synonyms and related terms
4. Identify the core intent and key concepts
5. Normalize technical terms to standard industry terminology

Return ONLY the enhanced search terms as a single line, separated by spaces. Include both the original corrected terms and relevant expansions.

Example:
Input: "AI chatbot for custmer support"
Output: artificial intelligence AI chatbot conversational agent customer support service helpdesk

Enhanced Query:`;

                const result = await model.generateContent(prompt);
                if (result && result.response) {
                    refinedQuery = result.response.text().trim() || q.toString();
                    console.log(`[HybridSearch] NLP Enhanced: "${q}" → "${refinedQuery}"`);
                }
            } catch (e) {
                console.warn("[HybridSearch] NLP enhancement failed:", e.message);
            }
        }

        // STEP 2: Tokenize Query
        const queryTerms = tokenizeQuery(refinedQuery);
        console.log(`[HybridSearch] Query Terms: ${queryTerms.length} terms`);

        // STEP 3: Generate Query Embedding
        let queryEmbedding = [];
        if (aiAvailable && ai) {
            try {
                const model = ai.getGenerativeModel({ model: "text-embedding-004" });
                const result = await model.embedContent(q.toString());
                if (result && result.embedding && result.embedding.values) {
                    queryEmbedding = result.embedding.values;
                    console.log(`[HybridSearch] Embedding: ${queryEmbedding.length} dimensions`);
                }
            } catch (e) {
                console.warn("[HybridSearch] Embedding generation failed:", e.message);
            }
        }

        // STEP 4: Broad Retrieval using PostgreSQL Full-Text Search
        const terms = refinedQuery.replace(/[^\w\s]/gi, '').split(/\s+/).filter(t => t.trim().length > 0);
        const broadTsQuery = terms.length > 0 ? terms.join(' | ') : refinedQuery;

        // Construct Filter Clauses
        let filterClauses = '';
        const filterParams = [refinedQuery, broadTsQuery];
        let paramIdx = 3;

        if (filterThemes.length > 0) {
            filterClauses += ` AND i.challenge_opportunity = ANY($${paramIdx})`;
            filterParams.push(filterThemes);
            paramIdx++;
        }
        if (filterBGs.length > 0) {
            filterClauses += ` AND i.business_group = ANY($${paramIdx})`;
            filterParams.push(filterBGs);
            paramIdx++;
        }
        if (filterTech.length > 0) {
            const techConditions = filterTech.map(() => `i.code_preference ILIKE $${paramIdx++}`).join(' OR ');
            filterClauses += ` AND (${techConditions})`;
            filterTech.forEach(t => filterParams.push(`%${t}%`));
        }

        const candidateQuery = `
      SELECT 
        i.idea_id,
        i.title,
        i.summary,
        i.challenge_opportunity,
        i.code_preference,
        i.business_group
      FROM ideas i
      WHERE 
        (
            to_tsvector('english', 
                COALESCE(i.title, '') || ' ' || 
                COALESCE(i.summary, '') || ' ' || 
                COALESCE(i.challenge_opportunity, '') || ' ' || 
                COALESCE(i.code_preference, '') || ' ' || 
                COALESCE(i.business_group, '')
            ) @@ websearch_to_tsquery('english', $1)
            OR
            to_tsvector('english', 
                COALESCE(i.title, '') || ' ' || 
                COALESCE(i.summary, '') || ' ' || 
                COALESCE(i.challenge_opportunity, '') || ' ' || 
                COALESCE(i.code_preference, '')
            ) @@ to_tsquery('english', $2)
        )
        ${filterClauses}
      LIMIT 150
    `;

        const searchRes = await pool.query(candidateQuery, filterParams);
        const candidates = searchRes.rows;

        console.log(`[HybridSearch] Retrieved ${candidates.length} candidates`);

        if (candidates.length === 0) {
            return res.json({ results: [], facets: {}, metadata: { algorithm: 'BM25+ + Vector + RRF' } });
        }

        // STEP 5: Apply Hybrid Search Algorithm
        const getDocText = (doc) => {
            return `${doc.title || ''} ${doc.summary || ''} ${doc.challenge_opportunity || ''} ${doc.code_preference || ''}`;
        };

        const getEmbedding = async (doc) => {
            if (!aiAvailable || !ai) return [];

            try {
                const text = getDocText(doc);
                const model = ai.getGenerativeModel({ model: "text-embedding-004" });
                const result = await model.embedContent(text);
                return (result && result.embedding && result.embedding.values) ? result.embedding.values : [];
            } catch (e) {
                return [];
            }
        };

        const rankedResults = await hybridSearch({
            queryTerms,
            queryEmbedding,
            documents: candidates,
            getDocText,
            getEmbedding,
            weights: DEFAULT_SEARCH_CONFIG.weights
        });

        // STEP 6: Fetch Full Data for Top Results
        const topIds = rankedResults.slice(0, 100).map(r => r.idea_id);

        const dataQuery = `
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
      WHERE i.idea_id = ANY($2::int[])
    `;

        const dataRes = await pool.query(dataQuery, [userId, topIds]);
        const fullDataMap = new Map(dataRes.rows.map(row => [row.idea_id, row]));

        // STEP 7: Map to Frontend Format
        const mapDBToFrontend = (row, matchScore = 0) => {
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
        };

        const finalResults = rankedResults
            .filter(r => fullDataMap.has(r.idea_id))
            .map(r => {
                const fullData = fullDataMap.get(r.idea_id);
                return mapDBToFrontend({ ...fullData, ...r }, r.matchScore);
            });

        // Generate Facets
        const facets = { businessGroups: {}, technologies: {}, themes: {} };
        finalResults.forEach(item => {
            facets.businessGroups[item.businessGroup] = (facets.businessGroups[item.businessGroup] || 0) + 1;
            facets.themes[item.domain] = (facets.themes[item.domain] || 0) + 1;
            item.technologies.forEach(t => facets.technologies[t] = (facets.technologies[t] || 0) + 1);
        });

        console.log(`[HybridSearch] ✅ Returning ${finalResults.length} results`);

        res.json({
            results: finalResults,
            facets,
            metadata: {
                algorithm: 'BM25+ + Vector Similarity + RRF',
                totalCandidates: candidates.length,
                weights: DEFAULT_SEARCH_CONFIG.weights,
                queryTerms: queryTerms.length,
                embeddingDimensions: queryEmbedding.length
            }
        });

    } catch (err) {
        console.error("[HybridSearch] Error:", err);
        res.status(500).json({ error: 'Search failed', details: err.message });
    }
});

export default router;
