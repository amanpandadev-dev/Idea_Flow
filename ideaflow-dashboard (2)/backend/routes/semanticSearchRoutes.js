import express from 'express';
import { searchSimilarIdeas } from '../services/semanticSearch.js';

const router = express.Router();

/**
 * POST /api/ideas/semantic-search
 * Perform semantic search on idea submissions
 */
router.post('/semantic-search', async (req, res) => {
    try {
        const { query, embeddingProvider = 'grok', limit = 10 } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                error: true,
                message: 'Query parameter is required'
            });
        }

        console.log(`[SemanticSearchRoute] Searching for: "${query}" using ${embeddingProvider}`);

        // Get ChromaDB and database instances from app
        const chromaClient = req.app.get('chromaClient');
        const db = req.app.get('db');

        if (!chromaClient || !db) {
            return res.status(500).json({
                error: true,
                message: 'Database not initialized'
            });
        }

        const results = await searchSimilarIdeas(
            chromaClient,
            db,
            query.trim(),
            embeddingProvider,
            parseInt(limit) || 10
        );

        res.json({
            success: true,
            query: query.trim(),
            count: results.length,
            results
        });

    } catch (error) {
        console.error('[SemanticSearchRoute] Error:', error.message);
        res.status(500).json({
            error: true,
            message: 'Failed to perform semantic search',
            details: error.message
        });
    }
});

export default router;
