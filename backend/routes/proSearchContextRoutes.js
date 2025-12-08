/**
 * Context Management for Pro Search
 * Save, load, and clear user search context with filters
 */

import { Router } from 'express';
const contextsRouter = Router();

// In-memory storage for user contexts (should be replaced with DB in production)
const userContexts = new Map();

/**
 * GET /api/search/context/:userId
 * Get saved context for user
 */
contextsRouter.get('/context/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const context = userContexts.get(userId) || null;

        res.json({
            success: true,
            context: context || {
                filters: {},
                savedAt: null
            }
        });
    } catch (error) {
        console.error('[Pro Search Context] Get error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to get context'
        });
    }
});

/**
 * POST /api/search/context/save
 * Save current search context
 */
contextsRouter.post('/context/save', async (req, res) => {
    try {
        const { userId, filters, query, minSimilarity, pagination } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: true,
                message: 'userId is required'
            });
        }

        const context = {
            filters: filters || {},
            query: query || '',
            minSimilarity: minSimilarity || 30,
            pagination: pagination || { page: 1, limit: 20 },
            savedAt: new Date().toISOString()
        };

        userContexts.set(userId, context);

        console.log(`[Pro Search Context] Saved for user ${userId}:`, {
            filtersCount: Object.keys(context.filters).length,
            query: context.query,
            minSimilarity: context.minSimilarity
        });

        res.json({
            success: true,
            context,
            message: 'Context saved successfully'
        });
    } catch (error) {
        console.error('[Pro Search Context] Save error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to save context'
        });
    }
});

/**
 * DELETE /api/search/context/:userId
 * Clear saved context for user
 */
contextsRouter.delete('/context/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const hadContext = userContexts.has(userId);
        userContexts.delete(userId);

        console.log(`[Pro Search Context] Cleared for user ${userId}`);

        res.json({
            success: true,
            message: hadContext ? 'Context cleared successfully' : 'No context to clear'
        });
    } catch (error) {
        console.error('[Pro Search Context] Clear error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to clear context'
        });
    }
});

export { contextsRouter };
