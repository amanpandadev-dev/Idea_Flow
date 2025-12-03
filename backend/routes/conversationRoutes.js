/**
 * Conversation Routes
 * API endpoints for agent conversation history management
 */

import express from 'express';
import ConversationService from '../services/conversationService.js';

const router = express.Router();

/**
 * Initialize conversation service with database
 * Middleware to attach service to request
 */
router.use((req, res, next) => {
    const pool = req.app.locals.pool;
    
    if (!pool) {
        return res.status(503).json({
            success: false,
            error: 'Database not available'
        });
    }
    
    req.conversationService = new ConversationService(pool);
    next();
});

/**
 * GET /api/conversations
 * List all conversations for the authenticated user
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const { limit, offset, tags, sortBy, order } = req.query;

        const options = {
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
            tags: tags ? tags.split(',') : null,
            sortBy: sortBy || 'created_at',
            order: order || 'DESC'
        };

        const result = await req.conversationService.getConversations(userId, options);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('[ConversationRoutes] Error listing conversations:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve conversations',
            message: error.message
        });
    }
});

/**
 * GET /api/conversations/:id
 * Get a specific conversation with all messages
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;
        const conversationId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const conversation = await req.conversationService.getConversationById(
            conversationId,
            userId
        );

        res.json({
            success: true,
            conversation
        });

    } catch (error) {
        console.error('[ConversationRoutes] Error getting conversation:', error.message);
        
        if (error.message.includes('not found') || error.message.includes('access denied')) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found or access denied'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve conversation',
            message: error.message
        });
    }
});

/**
 * POST /api/conversations
 * Create a new conversation
 */
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const { title, tags, sessionId, documentContext, embeddingProvider } = req.body;

        // Validate input
        if (title && title.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Title must be 500 characters or less'
            });
        }

        if (tags && (!Array.isArray(tags) || tags.length > 10)) {
            return res.status(400).json({
                success: false,
                error: 'Tags must be an array with maximum 10 items'
            });
        }

        const conversation = await req.conversationService.createConversation(userId, {
            title: title || 'New Conversation',
            tags: tags || [],
            sessionId,
            documentContext,
            embeddingProvider: embeddingProvider || 'llama'
        });

        res.status(201).json({
            success: true,
            conversationId: conversation.id,
            conversation,
            message: 'Conversation created successfully'
        });

    } catch (error) {
        console.error('[ConversationRoutes] Error creating conversation:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to create conversation',
            message: error.message
        });
    }
});

/**
 * POST /api/conversations/:id/messages
 * Add a message to an existing conversation
 */
router.post('/:id/messages', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;
        const conversationId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const { role, content, metadata } = req.body;

        // Validate input
        if (!role || !content) {
            return res.status(400).json({
                success: false,
                error: 'Role and content are required'
            });
        }

        if (!['user', 'agent'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Role must be either "user" or "agent"'
            });
        }

        if (content.length > 10000) {
            return res.status(400).json({
                success: false,
                error: 'Content must be 10,000 characters or less'
            });
        }

        const message = await req.conversationService.addMessage(
            conversationId,
            userId,
            { role, content, metadata }
        );

        res.status(201).json({
            success: true,
            messageId: message.id,
            conversationId,
            message
        });

    } catch (error) {
        console.error('[ConversationRoutes] Error adding message:', error.message);
        
        if (error.message.includes('not found') || error.message.includes('access denied')) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found or access denied'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to add message',
            message: error.message
        });
    }
});

/**
 * PUT /api/conversations/:id
 * Update conversation metadata (title, tags)
 */
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;
        const conversationId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const { title, tags } = req.body;

        // Validate input
        if (title && title.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Title must be 500 characters or less'
            });
        }

        if (tags && (!Array.isArray(tags) || tags.length > 10)) {
            return res.status(400).json({
                success: false,
                error: 'Tags must be an array with maximum 10 items'
            });
        }

        if (!title && !tags) {
            return res.status(400).json({
                success: false,
                error: 'At least one field (title or tags) must be provided'
            });
        }

        const conversation = await req.conversationService.updateConversation(
            conversationId,
            userId,
            { title, tags }
        );

        res.json({
            success: true,
            conversation,
            message: 'Conversation updated successfully'
        });

    } catch (error) {
        console.error('[ConversationRoutes] Error updating conversation:', error.message);
        
        if (error.message.includes('not found') || error.message.includes('access denied')) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found or access denied'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to update conversation',
            message: error.message
        });
    }
});

/**
 * DELETE /api/conversations/:id
 * Delete a conversation and all its messages
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;
        const conversationId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        await req.conversationService.deleteConversation(conversationId, userId);

        res.json({
            success: true,
            message: 'Conversation deleted successfully'
        });

    } catch (error) {
        console.error('[ConversationRoutes] Error deleting conversation:', error.message);
        
        if (error.message.includes('not found') || error.message.includes('access denied')) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found or access denied'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to delete conversation',
            message: error.message
        });
    }
});

/**
 * GET /api/conversations/search
 * Search conversations by content
 */
router.get('/search/query', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const { q, limit } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Search query (q) is required'
            });
        }

        const options = {
            limit: limit ? parseInt(limit) : 20
        };

        const result = await req.conversationService.searchConversations(
            userId,
            q,
            options
        );

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('[ConversationRoutes] Error searching conversations:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to search conversations',
            message: error.message
        });
    }
});

/**
 * GET /api/conversations/stats/summary
 * Get conversation statistics for the user
 */
router.get('/stats/summary', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const stats = await req.conversationService.getStatistics(userId);

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('[ConversationRoutes] Error getting statistics:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve statistics',
            message: error.message
        });
    }
});

/**
 * GET /api/conversations/:id/export
 * Export a conversation in specified format
 */
router.get('/:id/export', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;
        const conversationId = req.params.id;
        const format = req.query.format || 'json';

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        if (!['json', 'markdown'].includes(format)) {
            return res.status(400).json({
                success: false,
                error: 'Format must be either "json" or "markdown"'
            });
        }

        const exportData = await req.conversationService.exportConversation(
            conversationId,
            userId,
            format
        );

        // Set appropriate headers for download
        const filename = `conversation-${conversationId}.${format === 'json' ? 'json' : 'md'}`;
        const contentType = format === 'json' ? 'application/json' : 'text/markdown';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(exportData);

    } catch (error) {
        console.error('[ConversationRoutes] Error exporting conversation:', error.message);
        
        if (error.message.includes('not found') || error.message.includes('access denied')) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found or access denied'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to export conversation',
            message: error.message
        });
    }
});

export default router;
