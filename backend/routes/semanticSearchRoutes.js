import express from 'express';
import { searchSimilarIdeas } from '../services/semanticSearch.js';

const router = express.Router();

/**
 * POST /api/ideas/semantic-search
 * Perform semantic search on idea submissions with pagination
 */
router.post('/semantic-search', async (req, res) => {
    try {
        const {
            query,
            embeddingProvider = 'llama',
            limit = 20,  // Results per page
            page = 1,    // Current page (1-indexed)
            minSimilarity = 0.3  // Minimum similarity threshold (0-1)
        } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                error: true,
                message: 'Query parameter is required'
            });
        }

        console.log(`[SemanticSearchRoute] Searching for: "${query}" using ${embeddingProvider} (page ${page}, limit ${limit})`);

        // Get ChromaDB and database instances from app
        const chromaClient = req.app.get('chromaClient');
        const db = req.app.get('db');

        if (!chromaClient || !db) {
            return res.status(500).json({
                error: true,
                message: 'Database not initialized'
            });
        }

        // Validate parameters
        const pageNum = Math.max(1, parseInt(page) || 1);
        const pageSize = Math.min(Math.max(1, parseInt(limit) || 20), 100);
        const similarityThreshold = Math.max(0, Math.min(1, parseFloat(minSimilarity) || 0.3));

        // Get ALL similar ideas (no limit initially)
        // We'll fetch a large number and filter by similarity
        const allResults = await searchSimilarIdeas(
            chromaClient,
            db,
            query.trim(),
            embeddingProvider,
            50  // Get top 50 relevant ideas
        );

        // Filter by minimum similarity threshold
        const filteredResults = allResults.filter(idea => idea.similarity >= similarityThreshold);

        // Calculate pagination
        const totalResults = filteredResults.length;
        const totalPages = Math.ceil(totalResults / pageSize);
        const startIndex = (pageNum - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResults = filteredResults.slice(startIndex, endIndex);

        res.json({
            success: true,
            query: query.trim(),
            provider: embeddingProvider,
            pagination: {
                currentPage: pageNum,
                pageSize: pageSize,
                totalResults: totalResults,
                totalPages: totalPages,
                hasNextPage: pageNum < totalPages,
                hasPreviousPage: pageNum > 1,
                startIndex: startIndex + 1,
                endIndex: Math.min(endIndex, totalResults)
            },
            minSimilarity: similarityThreshold,
            results: paginatedResults
        });

    } catch (error) {
        console.error('[SemanticSearchRoute] Error:', error.message);

        // User-friendly error messages
        let userMessage = 'Failed to perform semantic search';

        if (error.message.includes('API key') || error.message.includes('not configured')) {
            userMessage = 'Search service is not configured. Please contact support.';
        } else if (error.message.includes('rate limit')) {
            userMessage = 'Search service is temporarily unavailable. Please try again in a moment.';
        } else if (error.message.includes('Database')) {
            userMessage = 'Database connection error. Please try again.';
        }

        res.status(500).json({
            error: true,
            message: userMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
