/**
 * ProSearch Routes - Clean Conversational Search
 * 
 * Architecture:
 * - Vector search ONCE per conversation
 * - All follow-ups use deterministic filtering
 * - Stable results across refresh/navigation
 */

import express from 'express';
import pg from 'pg';
import { semanticSearch, validateNewConversation } from '../services/vectorSearchService.js';
import { extractFilters, mergeFilters } from '../services/filterExtractor.js';
import { applyFilters } from '../services/filterEngine.js';

const router = express.Router();
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

/**
 * POST /api/prosearch/chat
 * Main conversational search endpoint
 */
router.post('/chat', async (req, res) => {
    const startTime = Date.now();

    try {
        const { conversationId, message } = req.body;

        // Validate input
        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                error: true,
                message: 'Message cannot be empty'
            });
        }

        const trimmedMessage = message.trim();
        console.log(`\n========== PROSEARCH REQUEST ==========`);
        console.log(`[Request] Conversation: ${conversationId || 'NEW'}`);
        console.log(`[Request] Message: "${trimmedMessage}"`);

        // Determine if this is a new or existing conversation
        const isNewConversation = !conversationId;
        const userId = req.headers['x-user-id'] || 'anonymous';

        let conversation;
        let isNewBaseSearch = false;
        let sessionId = null;

        // Helper to save message to chat_messages table
        const saveChatMessage = async (sId, role, content, meta = {}) => {
            try {
                await pool.query(
                    `INSERT INTO chat_messages (session_id, role, content, metadata)
                     VALUES ($1, $2, $3, $4)`,
                    [sId, role, content, JSON.stringify(meta)]
                );
            } catch (e) {
                console.error('Failed to save chat message:', e);
            }
        };

        if (isNewConversation) {
            // ========================================
            // FLOW A: NEW CONVERSATION
            // ========================================
            console.log('[Flow] NEW CONVERSATION - Running semantic search');

            // 1. Create Chat Session
            const sessionResult = await pool.query(
                `INSERT INTO chat_sessions (user_id, title)
                 VALUES ($1, $2)
                 RETURNING id`,
                [userId, trimmedMessage.substring(0, 50)]
            );
            sessionId = sessionResult.rows[0].id;
            console.log(`[Flow] Created chat session: ${sessionId}`);

            // 2. Save User Message
            await saveChatMessage(sessionId, 'user', trimmedMessage);

            // 3. Perform ONE-TIME vector search
            const { ideaIds, scores } = await semanticSearch(trimmedMessage);

            if (ideaIds.length === 0) {
                console.log('[Flow] No semantic results found');
                const noResultsMsg = "I couldn't find any relevant ideas for your query. Try different keywords.";
                await saveChatMessage(sessionId, 'assistant', noResultsMsg);

                return res.json({
                    conversationId: null, // No search state created
                    results: [],
                    appliedFilters: { technologies: [], businessGroups: [], themes: [], years: [] },
                    isNewBaseSearch: true,
                    aiResponse: noResultsMsg
                });
            }

            // 4. Create new conversation in DB (Linked to Session)
            const insertQuery = `
                INSERT INTO prosearch_conversations (
                    session_id,
                    base_query,
                    base_result_ids,
                    current_result_ids,
                    applied_filters
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING conversation_id
            `;

            const emptyFilters = {
                technologies: [],
                businessGroups: [],
                themes: [],
                years: []
            };

            const insertResult = await pool.query(insertQuery, [
                sessionId,
                trimmedMessage,
                ideaIds,
                ideaIds, // Initially, current = base
                JSON.stringify(emptyFilters)
            ]);

            conversation = {
                conversation_id: insertResult.rows[0].conversation_id,
                session_id: sessionId,
                base_query: trimmedMessage,
                base_result_ids: ideaIds,
                current_result_ids: ideaIds,
                applied_filters: emptyFilters
            };

            isNewBaseSearch = true;
            console.log(`[Flow] Created conversation: ${conversation.conversation_id}`);
            console.log(`[Flow] Base results: ${ideaIds.length} ideas`);

        } else {
            // ========================================
            // FLOW B: EXISTING CONVERSATION
            // ========================================
            console.log('[Flow] EXISTING CONVERSATION - Filtering only');

            // 1. Load conversation from DB
            const selectQuery = `
                SELECT *
                FROM prosearch_conversations
                WHERE conversation_id = $1
            `;

            const selectResult = await pool.query(selectQuery, [conversationId]);

            if (selectResult.rows.length === 0) {
                console.log('[Flow] ERROR: Conversation not found');
                return res.status(404).json({
                    error: true,
                    message: 'Conversation not found'
                });
            }

            conversation = selectResult.rows[0];
            sessionId = conversation.session_id;

            // 2. Save User Message (if session exists)
            if (sessionId) {
                await saveChatMessage(sessionId, 'user', trimmedMessage);
            }

            // 3. Extract filters from message (NO LLM)
            const extractedFilters = extractFilters(trimmedMessage);
            console.log('[Flow] Extracted filters:', extractedFilters);

            // 4. Merge with existing filters
            const newFilters = mergeFilters(conversation.applied_filters, extractedFilters);
            console.log('[Flow] Merged filters:', newFilters);

            // 5. Apply filters on base_result_ids ONLY
            const filteredIds = await applyFilters(pool, conversation.base_result_ids, newFilters);
            console.log(`[Flow] Filtered: ${conversation.base_result_ids.length} → ${filteredIds.length}`);

            // 6. Update conversation state
            const updateQuery = `
                UPDATE prosearch_conversations
                SET current_result_ids = $1,
                    applied_filters = $2,
                    updated_at = NOW()
                WHERE conversation_id = $3
            `;

            await pool.query(updateQuery, [
                filteredIds,
                JSON.stringify(newFilters),
                conversationId
            ]);

            conversation.current_result_ids = filteredIds;
            conversation.applied_filters = newFilters;
            isNewBaseSearch = false;
        }

        // ========================================
        // HYDRATE RESULTS FROM POSTGRES
        // ========================================
        const resultIds = conversation.current_result_ids;
        let results = [];

        if (resultIds.length === 0) {
            console.log('[Hydration] No results to hydrate');
            const duration = Date.now() - startTime;
            console.log(`[Response] Duration: ${duration}ms\n`);

            return res.json({
                conversationId: conversation.conversation_id,
                results: [],
                appliedFilters: conversation.applied_filters,
                isNewBaseSearch
            });
        }

        // Fetch ideas by IDs (preserve order)
        const hydrationQuery = `
            SELECT 
                idea_id,
                title,
                summary,
                theme,
                business_group,
                code_preference,
                EXTRACT(YEAR FROM created_at) as year,
                created_at
            FROM ideas
            WHERE idea_id = ANY($1)
        `;

        const hydrationResult = await pool.query(hydrationQuery, [resultIds]);

        // Create ID to row mapping for ordering
        const idToRow = {};
        hydrationResult.rows.forEach(row => {
            idToRow[row.idea_id] = row;
        });

        // Format results in original order
        results = resultIds.map((id, index) => {
            const row = idToRow[id];
            if (!row) return null;

            // Calculate score: 0-100 integer (no decimals)
            const rawScore = isNewBaseSearch
                ? Math.max(0, 1 - (index / resultIds.length))
                : 0.85; // Filtered results get high relevance
            const scorePercent = Math.round(rawScore * 100); // Convert to 0-100 integer

            return {
                id: `IDEA-${row.idea_id}`,
                dbId: row.idea_id,
                title: row.title,
                summary: row.summary || 'No summary available',
                description: row.summary || 'No description available', // Add description field
                theme: row.theme || 'Other',
                businessGroup: row.business_group || 'Unknown',
                technologies: row.code_preference
                    ? row.code_preference.split(',').map(t => t.trim())
                    : [],
                year: row.year || new Date(row.created_at).getFullYear(),
                matchScore: scorePercent // 0-100 integer
            };
        }).filter(Boolean);

        console.log(`[Hydration] Hydrated ${results.length} ideas`);

        // Generate appropriate message based on action
        let responseMessage = '';
        const hasFilters = Object.values(conversation.applied_filters).some(
            arr => Array.isArray(arr) && arr.length > 0
        );

        if (isNewBaseSearch) {
            responseMessage = `Found ${results.length} results for "${conversation.base_query}".`;
        } else if (results.length === 0) {
            responseMessage = `No results match the applied filters. Try removing some filters.`;
        } else if (hasFilters) {
            const parts = [];
            const f = conversation.applied_filters;
            if (f.technologies?.length) parts.push(`Tech: ${f.technologies.join(', ')}`);
            if (f.businessGroups?.length) parts.push(`Business: ${f.businessGroups.join(', ')}`);
            if (f.themes?.length) parts.push(`Theme: ${f.themes.join(', ')}`);
            if (f.years?.length) parts.push(`Year: ${f.years.join(', ')}`);

            responseMessage = `Applied filters: ${parts.join(' | ')}. Showing ${results.length} results.`;
        } else {
            responseMessage = `Showing ${results.length} results.`;
        }

        // Save Assistant Message
        if (sessionId) {
            await saveChatMessage(sessionId, 'assistant', responseMessage, {
                conversationId: conversation.conversation_id,
                resultsCount: results.length,
                filters: conversation.applied_filters
            });
        }

        // ========================================
        // RETURN RESPONSE
        // ========================================
        const duration = Date.now() - startTime;
        console.log(`[Response] Duration: ${duration}ms`);
        console.log(`[Response] Results: ${results.length}`);
        console.log(`[Response] Filters:`, conversation.applied_filters);
        console.log('======================================\n');

        res.json({
            conversationId: conversation.conversation_id,
            results,
            appliedFilters: conversation.applied_filters,
            isNewBaseSearch,
            aiResponse: responseMessage
        });

    } catch (error) {
        console.error('[ProSearch] Error:', error);
        res.status(500).json({
            error: true,
            message: error.message || 'ProSearch request failed'
        });
    }
});

/**
 * GET /api/prosearch/conversation/:conversationId
 * Rehydrate conversation (for page refresh)
 */
router.get('/conversation/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        console.log(`[Rehydration] Loading conversation: ${conversationId}`);

        // Load conversation
        const query = `
            SELECT *
            FROM prosearch_conversations
            WHERE conversation_id = $1
        `;

        const result = await pool.query(query, [conversationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: true,
                message: 'Conversation not found'
            });
        }

        const conversation = result.rows[0];
        const resultIds = conversation.current_result_ids;

        // Hydrate results
        const hydrationQuery = `
            SELECT 
                idea_id, title, summary, theme, 
                business_group, code_preference,
                EXTRACT(YEAR FROM created_at) as year,
                created_at
            FROM ideas
            WHERE idea_id = ANY($1)
        `;

        const hydrationResult = await pool.query(hydrationQuery, [resultIds]);

        const idToRow = {};
        hydrationResult.rows.forEach(row => {
            idToRow[row.idea_id] = row;
        });

        const results = resultIds.map(id => {
            const row = idToRow[id];
            if (!row) return null;

            return {
                id: `IDEA-${row.idea_id}`,
                dbId: row.idea_id,
                title: row.title,
                summary: row.summary || '',
                theme: row.theme || 'Other',
                businessGroup: row.business_group || 'Unknown',
                technologies: row.code_preference
                    ? row.code_preference.split(',').map(t => t.trim())
                    : [],
                year: row.year || new Date(row.created_at).getFullYear(),
                matchScore: 0.85
            };
        }).filter(Boolean);

        console.log(`[Rehydration] Restored ${results.length} results`);

        res.json({
            conversationId: conversation.conversation_id,
            results,
            appliedFilters: conversation.applied_filters,
            isNewBaseSearch: false
        });

    } catch (error) {
        console.error('[Rehydration] Error:', error);
        res.status(500).json({
            error: true,
            message: 'Conversation rehydration failed'
        });
    }
});

/**
 * POST /conversational
 * Frontend compatibility endpoint (matches frontend expectation)
 * This is the SAME logic as /chat but at the path the frontend expects
 */
router.post('/conversational', async (req, res) => {
    const startTime = Date.now();

    try {
        // Frontend sends 'query', backend expects 'message' - accept both
        const { conversationId, message, query } = req.body;
        const searchMessage = message || query;

        // Validate input
        if (!searchMessage || searchMessage.trim().length === 0) {
            return res.status(400).json({
                error: true,
                message: 'Message or query cannot be empty'
            });
        }

        const trimmedMessage = searchMessage.trim();
        console.log(`\n========== PROSEARCH REQUEST (conversational) ==========`);
        console.log(`[Request] Conversation: ${conversationId || 'NEW'}`);
        console.log(`[Request] Message: "${trimmedMessage}"`);

        // Determine if this is a new or existing conversation
        const isNewConversation = !conversationId;

        let conversation;
        let isNewBaseSearch = false;

        if (isNewConversation) {
            // NEW CONVERSATION - Run semantic search
            console.log('[Flow] NEW CONVERSATION - Running semantic search');

            const { ideaIds, scores } = await semanticSearch(trimmedMessage);

            if (ideaIds.length === 0) {
                console.log('[Flow] No semantic results found');
                return res.json({
                    conversationId: null,
                    results: [],
                    appliedFilters: {
                        technologies: [],
                        businessGroups: [],
                        themes: [],
                        years: []
                    },
                    isNewBaseSearch: true
                });
            }

            // Create new conversation in DB
            const insertQuery = `
                INSERT INTO prosearch_conversations (
                    base_query,
                    base_result_ids,
                    current_result_ids,
                    applied_filters
                )
                VALUES ($1, $2, $3, $4)
                RETURNING conversation_id
            `;

            const emptyFilters = {
                technologies: [],
                businessGroups: [],
                themes: [],
                years: []
            };

            const insertResult = await pool.query(insertQuery, [
                trimmedMessage,
                ideaIds,
                ideaIds,
                JSON.stringify(emptyFilters)
            ]);

            conversation = {
                conversation_id: insertResult.rows[0].conversation_id,
                base_query: trimmedMessage,
                base_result_ids: ideaIds,
                current_result_ids: ideaIds,
                applied_filters: emptyFilters
            };

            isNewBaseSearch = true;
            console.log(`[Flow] Created conversation: ${conversation.conversation_id}`);
            console.log(`[Flow] Base results: ${ideaIds.length} ideas`);

        } else {
            // EXISTING CONVERSATION - Filter only
            console.log('[Flow] EXISTING CONVERSATION - Filtering only');

            const selectQuery = `
                SELECT *
                FROM prosearch_conversations
                WHERE conversation_id = $1
            `;

            const selectResult = await pool.query(selectQuery, [conversationId]);

            if (selectResult.rows.length === 0) {
                console.log('[Flow] ERROR: Conversation not found');
                return res.status(404).json({
                    error: true,
                    message: 'Conversation not found'
                });
            }

            conversation = selectResult.rows[0];
            console.log(`[Flow] Loaded conversation with ${conversation.base_result_ids.length} base results`);

            const extractedFilters = extractFilters(trimmedMessage);
            console.log('[Flow] Extracted filters:', extractedFilters);

            const newFilters = mergeFilters(conversation.applied_filters, extractedFilters);
            console.log('[Flow] Merged filters:', newFilters);

            const filteredIds = await applyFilters(pool, conversation.base_result_ids, newFilters);
            console.log(`[Flow] Filtered: ${conversation.base_result_ids.length} → ${filteredIds.length}`);

            const updateQuery = `
                UPDATE prosearch_conversations
                SET current_result_ids = $1,
                    applied_filters = $2,
                    updated_at = NOW()
                WHERE conversation_id = $3
            `;

            await pool.query(updateQuery, [
                filteredIds,
                JSON.stringify(newFilters),
                conversationId
            ]);

            conversation.current_result_ids = filteredIds;
            conversation.applied_filters = newFilters;
            isNewBaseSearch = false;
        }

        // HYDRATE RESULTS
        const resultIds = conversation.current_result_ids;

        if (resultIds.length === 0) {
            console.log('[Hydration] No results to hydrate');
            const duration = Date.now() - startTime;
            console.log(`[Response] Duration: ${duration}ms\n`);

            return res.json({
                conversationId: conversation.conversation_id,
                results: [],
                appliedFilters: conversation.applied_filters,
                isNewBaseSearch
            });
        }

        const hydrationQuery = `
            SELECT 
                idea_id, title, summary, theme, 
                business_group, code_preference,
                EXTRACT(YEAR FROM created_at) as year,
                created_at
            FROM ideas
            WHERE idea_id = ANY($1)
        `;

        const hydrationResult = await pool.query(hydrationQuery, [resultIds]);

        const idToRow = {};
        hydrationResult.rows.forEach(row => {
            idToRow[row.idea_id] = row;
        });

        const results = resultIds.map((id, index) => {
            const row = idToRow[id];
            if (!row) return null;

            return {
                id: `IDEA-${row.idea_id}`,
                dbId: row.idea_id,
                title: row.title,
                summary: row.summary || '',
                theme: row.theme || 'Other',
                businessGroup: row.business_group || 'Unknown',
                technologies: row.code_preference
                    ? row.code_preference.split(',').map(t => t.trim())
                    : [],
                year: row.year || new Date(row.created_at).getFullYear(),
                matchScore: isNewBaseSearch
                    ? Math.max(0, 1 - (index / resultIds.length))
                    : 0.85
            };
        }).filter(Boolean);

        console.log(`[Hydration] Hydrated ${results.length} ideas`);

        const duration = Date.now() - startTime;
        console.log(`[Response] Duration: ${duration}ms`);
        console.log(`[Response] Results: ${results.length}`);
        console.log('======================================\n');

        res.json({
            conversationId: conversation.conversation_id,
            results,
            appliedFilters: conversation.applied_filters,
            isNewBaseSearch
        });

    } catch (error) {
        console.error('[ProSearch /conversational] Error:', error);
        res.status(500).json({
            error: true,
            message: error.message || 'ProSearch request failed'
        });
    }
});

export default router;
