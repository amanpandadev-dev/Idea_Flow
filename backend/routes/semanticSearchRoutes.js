import express from 'express';
import { searchSimilarIdeas } from '../services/semanticSearch.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all semantic search routes
router.use(auth);

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
            minSimilarity = 0.3,  // Minimum similarity threshold (0-1)
            mode = 'search',  // NEW: 'context', 'search', or 'question'
            suggestedQuestion  // NEW: Optional for 'question' mode
        } = req.body;

        // Get user ID from JWT token
        const userId = req.user?.user?.emp_id;
        if (!userId) {
            return res.status(401).json({
                error: true,
                message: 'User not authenticated'
            });
        }

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

        let allResults = [];
        let searchModeUsed = mode;

        // MODE 1: Context-driven search (uses uploaded document chunks)
        if (mode === 'context') {
            console.log(`[SemanticSearchRoute] Context-driven search for user ${userId}`);

            const { searchSimilarIdeasWithContext } = await import('../services/semanticSearch.js');

            // Check if user has document context
            const collectionId = `user_${userId}`;
            const { getCollectionStats } = await import('../services/vectorStoreService.js');
            const stats = await getCollectionStats(collectionId);

            if (!stats || stats.documentCount === 0) {
                return res.json({
                    success: true,
                    query: 'document context',
                    provider: embeddingProvider,
                    mode: 'context',
                    message: 'No document uploaded yet. Please upload a document to see context-relevant ideas.',
                    pagination: {
                        currentPage: 1,
                        pageSize: pageSize,
                        totalResults: 0,
                        totalPages: 0,
                        hasNextPage: false,
                        hasPreviousPage: false,
                        startIndex: 0,
                        endIndex: 0
                    },
                    minSimilarity: similarityThreshold,
                    results: []
                });
            }

            allResults = await searchSimilarIdeasWithContext(
                chromaClient,
                db,
                userId,
                embeddingProvider,
                similarityThreshold
            );
        }
        // MODE 2: Search-driven (traditional text query)
        else if (mode === 'search' || mode === 'question') {
            const searchQuery = mode === 'question' && suggestedQuestion ? suggestedQuestion : query;

            if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
                return res.status(400).json({
                    error: true,
                    message: 'Query parameter is required for search mode'
                });
            }

            console.log(`[SemanticSearchRoute] ${mode === 'question' ? 'Suggested question' : 'Text'} search: "${searchQuery}"`);

            const { searchSimilarIdeas } = await import('../services/semanticSearch.js');

            // Get ALL similar ideas (no limit initially)
            // We'll fetch a large number and filter by similarity
            allResults = await searchSimilarIdeas(
                chromaClient,
                db,
                searchQuery.trim(),
                embeddingProvider,
                300,  // Fetch up to 300 candidates
                similarityThreshold
            );
        } else {
            return res.status(400).json({
                error: true,
                message: `Invalid mode: ${mode}. Must be 'context', 'search', or 'question'`
            });
        }

        // Calculate pagination
        const totalResults = allResults.length;
        const totalPages = Math.ceil(totalResults / pageSize);
        const startIndex = (pageNum - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResults = allResults.slice(startIndex, endIndex);

        res.json({
            success: true,
            query: mode === 'context' ? 'document context' : (suggestedQuestion || query),
            provider: embeddingProvider,
            mode: searchModeUsed,
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

        // Debug logging
        console.log(`[SemanticSearchRoute] Sending response: ${paginatedResults.length} results on page ${pageNum}`);


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
