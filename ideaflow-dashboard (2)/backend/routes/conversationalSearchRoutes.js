/**
 * Conversational Search Routes
 * Chat-based search interface with context preservation
 */

import express from 'express';
import { optimizedHybridSearch } from '../services/advancedSearchService.js';
import {
    parseConversationalQuery,
    generateAIResponse
} from '../services/nlpQueryProcessor.js';
import {
    initConversation,
    addMessage,
    getConversationHistory,
    updateContext,
    getContext,
    generateSuggestions
} from '../services/conversationalSearchService.js';

const router = express.Router();

/**
 * Helper: Map database row to frontend format
 */
function mapDBToFrontend(row, matchScore = 0) {
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
        matchScore: matchScore || 0,
        futureScope: "Integration with wider enterprise ecosystems.",
        impactScore: 8,
        confidenceScore: 8,
        feasibilityScore: 8,
        // Additional fields for dynamic display
        scalability: row.scalability || 'Unknown',
        novelty: row.novelty || 'Unknown',
        benefits: row.benefits || '',
        risks: row.risks || '',
        responsibleAI: row.responsible_ai || '',
        participationWeek: row.participation_week || null,
        timeline: row.timeline || '',
        _scoring: row._scoring
    };
}

/**
 * Helper: Apply dynamic filters and sorting to documents
 * Uses scoring system to allow partial matches (OR logic)
 */
function applyDynamicFiltersAndSort(documents, filters, sortBy, sortOrder) {
    // If no filters, return all (or top N)
    if (!filters || Object.keys(filters).length === 0) return documents;

    const scoredDocs = documents.map(doc => {
        let score = 0;
        let matches = 0;

        // Domain Filter
        if (filters.domain) {
            const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
            if (domains.includes(doc.challenge_opportunity)) {
                score += 10;
                matches++;
            }
        }

        // Business Group Filter
        if (filters.businessGroup) {
            const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
            if (groups.includes(doc.business_group) || groups.includes(doc.idea_bg)) {
                score += 10;
                matches++;
            }
        }

        // Tech Stack Filter
        if (filters.techStack && filters.techStack.length > 0 && doc.code_preference) {
            const docTech = doc.code_preference.toLowerCase();
            const hasMatch = filters.techStack.some(tech => docTech.includes(tech.toLowerCase()));
            if (hasMatch) {
                score += 10;
                matches++;
            }
        }

        // Year Filter
        if (filters.year) {
            const year = new Date(doc.created_at).getFullYear();
            if (year === filters.year) {
                score += 10;
                matches++;
            }
        }

        // Build Phase
        if (filters.buildPhase && doc.build_phase === filters.buildPhase) {
            score += 10;
            matches++;
        }

        // Build Preference
        if (filters.buildPreference && doc.build_preference && doc.build_preference.includes(filters.buildPreference)) {
            score += 10;
            matches++;
        }

        // Scalability
        if (filters.scalability && doc.scalability) {
            const scalabilityText = doc.scalability.toLowerCase();
            if (filters.scalability === 'high' && (scalabilityText.includes('high') || scalabilityText.includes('excellent') || scalabilityText.includes('very'))) {
                score += 10;
                matches++;
            } else if (filters.scalability === 'any') {
                score += 5;
                matches++;
            }
        }

        // Novelty
        if (filters.novelty && doc.novelty) {
            const noveltyText = doc.novelty.toLowerCase();
            if (filters.novelty === 'high' && (noveltyText.includes('high') || noveltyText.includes('innovative') || noveltyText.includes('unique') || noveltyText.includes('novel'))) {
                score += 10;
                matches++;
            }
        }

        // Participation Week
        if (filters.participationWeek && doc.participation_week && parseInt(doc.participation_week) === filters.participationWeek) {
            score += 10;
            matches++;
        }

        // Timeline
        if (filters.timeline && doc.timeline) {
            const timelineText = doc.timeline.toLowerCase();
            let match = false;
            if (filters.timeline === 'short' && (timelineText.includes('short') || timelineText.includes('quick') || timelineText.includes('1 month') || timelineText.includes('2 month'))) match = true;
            else if (filters.timeline === 'medium' && (timelineText.includes('medium') || timelineText.includes('3 month') || timelineText.includes('4 month') || timelineText.includes('5 month') || timelineText.includes('6 month'))) match = true;
            else if (filters.timeline === 'long' && (timelineText.includes('long') || timelineText.includes('year') || timelineText.includes('12 month'))) match = true;

            if (match) {
                score += 10;
                matches++;
            }
        }

        return { ...doc, dynamicScore: score, filterMatches: matches };
    });

    // Return docs with score > 0
    const filtered = scoredDocs.filter(doc => doc.dynamicScore > 0);

    // Sort by score
    filtered.sort((a, b) => b.dynamicScore - a.dynamicScore);

    // If explicit sort is requested, re-sort
    if (sortBy) {
        filtered.sort((a, b) => {
            let aVal, bVal;
            if (sortBy === 'created_at') {
                aVal = new Date(a.created_at).getTime();
                bVal = new Date(b.created_at).getTime();
            } else if (sortBy === 'score') {
                aVal = a.score || a.idea_score || 0;
                bVal = b.score || b.idea_score || 0;
            } else if (sortBy === 'impactScore') {
                aVal = a.score || 0;
                bVal = b.score || 0;
            } else if (sortBy === 'likesCount') {
                aVal = a.likes_count || 0;
                bVal = b.likes_count || 0;
            } else {
                return 0;
            }
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });
    }

    return filtered;
}
router.post('/conversational', async (req, res) => {
    try {
        const { query, sessionId, additionalFilters } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                error: true,
                message: 'Search query is required'
            });
        }

        const effectiveSessionId = sessionId || req.session?.id;
        if (!effectiveSessionId) {
            return res.status(400).json({
                error: true,
                message: 'Session not available'
            });
        }

        console.log(`\n[ConversationalSearch] 💬 Query: "${query}" (Session: ${effectiveSessionId})`);

        // Initialize conversation if needed
        const userId = req.user ? req.user.user.emp_id : 'anonymous';
        initConversation(effectiveSessionId, userId);

        // Add user message (encrypted)
        addMessage(effectiveSessionId, 'user', query);

        // Get previous context
        const previousContext = getContext(effectiveSessionId) || {};

        // Parse query with NLP
        const parsedQuery = parseConversationalQuery(query, previousContext);

        // Merge additional filters from ExploreModal
        if (additionalFilters) {
            if (additionalFilters.techStack) {
                parsedQuery.filters.techStack = [
                    ...(parsedQuery.filters.techStack || []),
                    ...additionalFilters.techStack
                ];
            }
            if (additionalFilters.businessGroup) {
                parsedQuery.filters.businessGroup = additionalFilters.businessGroup;
            }
            if (additionalFilters.domain) {
                parsedQuery.filters.domain = additionalFilters.domain;
            }
        }

        console.log(`[ConversationalSearch] 🧠 Intent: ${parsedQuery.intent}`);
        console.log(`[ConversationalSearch] 🏷️  Filters:`, parsedQuery.filters);

        // Get database instance
        const pool = req.app.get('db');
        if (!pool) {
            return res.status(503).json({
                error: true,
                message: 'Database not available'
            });
        }

        // Get user ID for likes
        const likeUserId = req.user ? req.user.user.emp_id : '';

        // Fetch all ideas from database
        const dbQuery = `
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
            ORDER BY i.idea_id, i.created_at DESC
        `;

        const result = await pool.query(dbQuery, [likeUserId]);
        let documents = result.rows;

        console.log(`[ConversationalSearch] 📊 Loaded ${documents.length} documents`);

        // Apply dynamic filters and sorting
        documents = applyDynamicFiltersAndSort(
            documents,
            parsedQuery.filters,
            parsedQuery.sortBy,
            parsedQuery.sortOrder
        );

        console.log(`[ConversationalSearch] 🔽 After filters: ${documents.length} documents`);

        // Perform semantic search if keywords present
        let searchResults = [];
        if (parsedQuery.keywords.length > 0) {
            const getDocText = (doc) => {
                return `${doc.title || ''} ${doc.summary || ''} ${doc.challenge_opportunity || ''} ${doc.code_preference || ''} ${doc.scalability || ''} ${doc.novelty || ''} ${doc.benefits || ''} ${doc.risks || ''} ${doc.responsible_ai || ''}`.toLowerCase();
            };

            const getEmbedding = async () => [];
            const getQueryEmbedding = async () => [];

            const hybridResults = await optimizedHybridSearch({
                rawQuery: parsedQuery.query,
                documents,
                getDocText,
                getEmbedding,
                getQueryEmbedding,
                weights: { bm25: 0.30, vector: 0.50, rrf: 0.20 },
                apiKey: process.env.API_KEY,
                useAI: true,
                topK: 100,
                minScore: 10
            });

            searchResults = hybridResults.results;
        } else {
            // No keywords, just return filtered/sorted results
            searchResults = documents.slice(0, 100);
        }

        // Map results to frontend format
        const mappedResults = searchResults.map(doc =>
            mapDBToFrontend(doc, doc.matchScore || 0)
        );

        // Generate AI response
        const aiResponse = generateAIResponse(parsedQuery, mappedResults.length);

        // Add AI message (encrypted)
        addMessage(effectiveSessionId, 'assistant', aiResponse, {
            resultCount: mappedResults.length,
            filters: parsedQuery.filters
        });

        // Update context
        updateContext(effectiveSessionId, {
            keywords: parsedQuery.keywords,
            filters: parsedQuery.filters,
            sortBy: parsedQuery.sortBy,
            sortOrder: parsedQuery.sortOrder,
            lastResults: mappedResults.slice(0, 10).map(r => r.id),
            searchHistory: [...(previousContext.searchHistory || []), {
                query,
                timestamp: new Date().toISOString(),
                resultCount: mappedResults.length
            }].slice(-20)
        });

        // Generate suggestions
        const suggestions = generateSuggestions(getContext(effectiveSessionId), mappedResults);

        console.log(`[ConversationalSearch] ✅ Returning ${mappedResults.length} results`);

        res.json({
            success: true,
            results: mappedResults,
            aiResponse,
            suggestions,
            metadata: {
                query: parsedQuery.query,
                intent: parsedQuery.intent,
                filters: parsedQuery.filters,
                sortBy: parsedQuery.sortBy,
                sortOrder: parsedQuery.sortOrder,
                totalResults: mappedResults.length
            },
            facets: {
                domains: [...new Set(mappedResults.map(r => r.domain))],
                businessGroups: [...new Set(mappedResults.map(r => r.businessGroup))],
                technologies: [...new Set(mappedResults.flatMap(r => r.technologies))]
            }
        });

    } catch (error) {
        console.error('[ConversationalSearch] Error:', error);
        res.status(500).json({
            error: true,
            message: 'Conversational search failed',
            details: error.message
        });
    }
});

/**
 * GET /api/search/conversation-history
 * Get conversation history for current session
 */
router.get('/conversation-history', async (req, res) => {
    try {
        const sessionId = req.session?.id;
        if (!sessionId) {
            return res.json({ messages: [] });
        }

        const messages = getConversationHistory(sessionId);

        res.json({
            success: true,
            messages,
            sessionId
        });

    } catch (error) {
        console.error('[ConversationalSearch] History error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to get conversation history'
        });
    }
});

export default router;
