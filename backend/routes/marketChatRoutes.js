// Market Validator Chat Routes with Session Management
const express = require('express');
const router = express.Router({ mergeParams: true });
const marketValidatorChatService = require('../services/marketValidatorChatService');
const sessionManager = require('../services/marketChatSessionManager');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * POST /api/ideas/:ideaId/market-chat/initialize
 * Initialize a market validation chat session
 * Creates server-side session storage
 */
router.post('/:ideaId/market-chat/initialize', authenticateToken, async (req, res) => {
    try {
        const { ideaId } = req.params;
        const userId = req.user?.id || 'default';

        // Get idea details from database
        const ideaQuery = `
      SELECT id, title, description, domain, technologies, theme, summary
      FROM ideas
      WHERE id = $1
    `;
        const ideaResult = await req.db.query(ideaQuery, [ideaId]);

        if (ideaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        const idea = ideaResult.rows[0];

        // Initialize server-side session
        const sessionKey = sessionManager.initializeSession(ideaId, userId);
        console.log(`[MarketChatRoutes] Initialized session: ${sessionKey}`);

        // Generate initial welcome message
        const initialMessage = await marketValidatorChatService.generateInitialMessage(idea);

        // Store initial assistant message
        sessionManager.addMessage(sessionKey, 'assistant', initialMessage);

        res.json({
            success: true,
            ideaId,
            sessionKey,
            initialMessage
        });
    } catch (error) {
        console.error('[MarketChatRoutes] Error initializing chat:', error);
        res.status(500).json({ error: 'Failed to initialize market chat' });
    }
});

/**
 * POST /api/ideas/:ideaId/market-chat
 * Send a message to the market validation chat
 * Uses server-side session for context retention
 */
router.post('/:ideaId/market-chat', authenticateToken, async (req, res) => {
    try {
        const { ideaId } = req.params;
        const { message } = req.body;
        const userId = req.user?.id || 'default';

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get idea details from database
        const ideaQuery = `
      SELECT id, title, description, domain, technologies, theme, summary
      FROM ideas
      WHERE id = $1
    `;
        const ideaResult = await req.db.query(ideaQuery, [ideaId]);

        if (ideaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        const idea = ideaResult.rows[0];

        // Get or initialize session
        const sessionKey = sessionManager.initializeSession(ideaId, userId);

        // Store user message
        sessionManager.addMessage(sessionKey, 'user', message);

        // Get conversation history from session
        const conversationHistory = sessionManager.getConversationHistory(sessionKey);
        console.log(`[MarketChatRoutes] Processing with ${conversationHistory.length} messages in history`);

        // Generate AI response with full conversation context
        const response = await marketValidatorChatService.generateChatResponse(
            idea,
            message,
            conversationHistory
        );

        // Store assistant response
        sessionManager.addMessage(sessionKey, 'assistant', response);

        // Get session metadata (extracted competitors, problem statements)
        const metadata = sessionManager.getSessionMetadata(sessionKey);

        res.json({
            success: true,
            response,
            sessionKey,
            metadata: {
                competitorCount: metadata.competitors.length,
                problemStatementCount: metadata.problemStatements.length,
                messageCount: conversationHistory.length + 1
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[MarketChatRoutes] Error processing chat message:', error);
        res.status(500).json({ error: 'Failed to process chat message' });
    }
});

/**
 * GET /api/ideas/:ideaId/market-chat/session
 * Get current session data and metadata
 */
router.get('/:ideaId/market-chat/session', authenticateToken, async (req, res) => {
    try {
        const { ideaId } = req.params;
        const userId = req.user?.id || 'default';

        const sessionKey = sessionManager.initializeSession(ideaId, userId);
        const history = sessionManager.getConversationHistory(sessionKey);
        const metadata = sessionManager.getSessionMetadata(sessionKey);

        res.json({
            success: true,
            sessionKey,
            history,
            metadata
        });
    } catch (error) {
        console.error('[MarketChatRoutes] Error retrieving session:', error);
        res.status(500).json({ error: 'Failed to retrieve session data' });
    }
});

/**
 * DELETE /api/ideas/:ideaId/market-chat/session
 * Clear session (when user exits chat)
 */
router.delete('/:ideaId/market-chat/session', authenticateToken, async (req, res) => {
    try {
        const { ideaId } = req.params;
        const userId = req.user?.id || 'default';

        const sessionKey = `${ideaId}_${userId}`;
        const cleared = sessionManager.clearSession(sessionKey);

        res.json({
            success: true,
            cleared,
            message: 'Session cleared successfully'
        });
    } catch (error) {
        console.error('[MarketChatRoutes] Error clearing session:', error);
        res.status(500).json({ error: 'Failed to clear session' });
    }
});

/**
 * GET /api/ideas/:ideaId/market-chat/download
 * Download the market chat conversation as a PDF
 */
router.post('/:ideaId/market-chat/download', authenticateToken, async (req, res) => {
    try {
        const { ideaId } = req.params;
        const { messages } = req.body;
        const userId = req.user?.id || 'default';

        // If no messages provided, use session history
        let chatMessages = messages;
        if (!chatMessages || !Array.isArray(chatMessages)) {
            const sessionKey = sessionManager.initializeSession(ideaId, userId);
            chatMessages = sessionManager.getConversationHistory(sessionKey);
        }

        if (!chatMessages || chatMessages.length === 0) {
            return res.status(400).json({ error: 'No conversation history available' });
        }

        // Get idea details from database
        const ideaQuery = `
      SELECT id, title, description, domain, technologies, business_group, theme
      FROM ideas
      WHERE id = $1
    `;
        const ideaResult = await req.db.query(ideaQuery, [ideaId]);

        if (ideaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        const idea = ideaResult.rows[0];

        // Import PDF generator
        const { generateMarketChatPDF } = await import('../services/marketChatPdfService.js');

        // Generate PDF
        const doc = generateMarketChatPDF(idea, chatMessages);

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Market_Chat_${ideaId}_${Date.now()}.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);
        doc.end();
    } catch (error) {
        console.error('[MarketChatRoutes] Error generating PDF:', error);
        res.status(500).json({ error: 'Failed to generate PDF report' });
    }
});

/**
 * GET /api/market-chat/sessions/stats
 * Get statistics about all active sessions (admin/debug endpoint)
 */
router.get('/sessions/stats', authenticateToken, async (req, res) => {
    try {
        const stats = sessionManager.getSessionStats();
        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        console.error('[MarketChatRoutes] Error getting session stats:', error);
        res.status(500).json({ error: 'Failed to get session statistics' });
    }
});

module.exports = router;
