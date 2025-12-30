/**
 * ProSearch Routes
 * API endpoint for conversational semantic search
 * 
 * Provides a single unified endpoint for:
 * - Initial semantic searches (conversationId = null)
 * - Follow-up filter refinements (conversationId = UUID)
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 * 
 * @module prosearchRoutes
 */

import express from 'express';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { processChat } from '../services/prosearchService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Generate unique request ID for logging and tracing
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate ProSearch chat request
 * 
 * @param {Object} req - Express request object
 * @throws {AppError} If validation fails
 */
function validateProSearchRequest(req) {
    const { conversationId, message } = req.body;

    // Validate message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new AppError('message must be a non-empty string', 400);
    }

    if (message.length > 1000) {
        throw new AppError('message too long (max 1000 characters)', 400);
    }

    // Validate conversationId (must be null or valid UUID)
    if (conversationId !== null && conversationId !== undefined) {
        if (typeof conversationId !== 'string') {
            throw new AppError('conversationId must be a string or null', 400);
        }

        if (!uuidValidate(conversationId)) {
            throw new AppError('conversationId must be a valid UUID', 400);
        }
    }
}

/**
 * POST /api/prosearch/chat
 * 
 * Main ProSearch endpoint for both initial searches and follow-up refinements
 * 
 * Request Body:
 * {
 *   conversationId: string | null,  // UUID or null for new conversation
 *   message: string                  // User's natural language query/message
 * }
 * 
 * Response:
 * {
 *   conversationId: string,          // UUID of conversation
 *   results: IdeaCard[],             // Array of matching ideas
 *   appliedFilters: {
 *     technologies: string[],
 *     businessGroups: string[],
 *     themes: string[],
 *     years: number[]
 *   },
 *   isNewBaseSearch: boolean         // true if this was initial search
 * }
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
router.post('/chat', asyncHandler(async (req, res) => {
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
        // Log incoming request
        logger.info('[ProSearch] Incoming request', {
            requestId,
            conversationId: req.body.conversationId,
            messageLength: req.body.message?.length,
            timestamp: new Date().toISOString()
        });

        // Validate request
        validateProSearchRequest(req);

        const { conversationId, message } = req.body;

        // Process chat through prosearchService
        logger.info('[ProSearch] Processing chat', {
            requestId,
            conversationId: conversationId || 'new',
            isNewConversation: !conversationId
        });

        const response = await processChat(conversationId, message.trim());

        // Calculate execution time
        const executionTime = Date.now() - startTime;

        // Log successful response
        logger.info('[ProSearch] Request completed', {
            requestId,
            conversationId: response.conversationId,
            resultCount: response.results.length,
            isNewBaseSearch: response.isNewBaseSearch,
            executionTime: `${executionTime}ms`
        });

        // Return formatted response
        res.json({
            conversationId: response.conversationId,
            results: response.results,
            appliedFilters: response.appliedFilters,
            isNewBaseSearch: response.isNewBaseSearch
        });

    } catch (error) {
        const executionTime = Date.now() - startTime;

        // Log error with context
        logger.error('[ProSearch] Request failed', {
            requestId,
            conversationId: req.body.conversationId,
            error: error.message,
            stack: error.stack,
            executionTime: `${executionTime}ms`
        });

        // Handle specific error types
        if (error.message.includes('Conversation not found')) {
            throw new AppError('Conversation not found', 404);
        }

        if (error.message.includes('ChromaDB')) {
            throw new AppError('Search service unavailable', 503);
        }

        if (error.message.includes('Database')) {
            throw new AppError('Database service unavailable', 503);
        }

        // Re-throw AppError instances
        if (error instanceof AppError) {
            throw error;
        }

        // Generic server error
        throw new AppError(`ProSearch failed: ${error.message}`, 500);
    }
}));

/**
 * GET /api/prosearch/health
 * 
 * Health check endpoint for ProSearch service
 */
router.get('/health', asyncHandler(async (req, res) => {
    res.json({
        status: 'ok',
        service: 'prosearch',
        timestamp: new Date().toISOString()
    });
}));

export default router;
