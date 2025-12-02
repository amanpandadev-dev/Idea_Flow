import express from 'express';
import { searchSimilarIdeas } from '../services/semanticSearch.js';

const router = express.Router();

/**
 * POST /api/search/history
 * Save a search result to history
 */
router.post('/', async (req, res) => {
    try {
        const { user_emp_id, query, embedding_provider, session_id, result_ids } = req.body;
        const db = req.app.get('db');

        if (!db) return res.status(503).json({ error: true, message: 'Database not available' });

        await db.query(
            `INSERT INTO search_history (user_emp_id, query, embedding_provider, session_id, result_ids)
             VALUES ($1, $2, $3, $4, $5)`,
            [user_emp_id, query, embedding_provider, session_id, JSON.stringify(result_ids)]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('[SearchHistory] Error saving history:', error);
        res.status(500).json({ error: true, message: 'Failed to save history' });
    }
});

/**
 * GET /api/search/history
 * Get recent search history for a user
 */
router.get('/', async (req, res) => {
    try {
        const { user, limit = 20 } = req.query;
        const db = req.app.get('db');

        if (!db) return res.status(503).json({ error: true, message: 'Database not available' });

        const result = await db.query(
            `SELECT * FROM search_history 
             WHERE user_emp_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [user, limit]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('[SearchHistory] Error fetching history:', error);
        res.status(500).json({ error: true, message: 'Failed to fetch history' });
    }
});

/**
 * POST /api/search/history/:id/rerun
 * Rerun a saved search
 */
router.post('/:id/rerun', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.get('db');
        const chromaClient = req.app.get('chromaClient');

        if (!db || !chromaClient) return res.status(503).json({ error: true, message: 'Database/Chroma not available' });

        // Fetch the history item
        const historyResult = await db.query('SELECT * FROM search_history WHERE id = $1', [id]);

        if (historyResult.rows.length === 0) {
            return res.status(404).json({ error: true, message: 'History item not found' });
        }

        const historyItem = historyResult.rows[0];
        const { query, embedding_provider } = historyItem;

        console.log(`[SearchHistory] Rerunning search: "${query}" (${embedding_provider})`);

        // Rerun the search
        const results = await searchSimilarIdeas(
            chromaClient,
            db,
            query,
            embedding_provider,
            10 // Default limit
        );

        res.json({
            success: true,
            query,
            results
        });

    } catch (error) {
        console.error('[SearchHistory] Error rerunning search:', error);
        res.status(500).json({ error: true, message: 'Failed to rerun search' });
    }
});

export default router;
