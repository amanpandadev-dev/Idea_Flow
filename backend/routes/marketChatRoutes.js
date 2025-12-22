// Market Validator Chat Routes
const express = require('express');
const router = express.Router({ mergeParams: true });
const marketValidatorChatService = require('../services/marketValidatorChatService');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * POST /api/ideas/:ideaId/market-chat/initialize
 * Initialize a market validation chat session
 */
router.post('/:ideaId/market-chat/initialize', authenticateToken, async (req, res) => {
    try {
        const { ideaId } = req.params;

        // Get idea details from database
        const ideaQuery = `
      SELECT id, title, description, domain, technologies
      FROM ideas
      WHERE id = $1
    `;
        const ideaResult = await req.db.query(ideaQuery, [ideaId]);

        if (ideaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        const idea = ideaResult.rows[0];
        const initialMessage = await marketValidatorChatService.generateInitialMessage(idea);

        res.json({
            success: true,
            ideaId,
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
 */
router.post('/:ideaId/market-chat', authenticateToken, async (req, res) => {
    try {
        const { ideaId } = req.params;
        const { message, conversationHistory } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get idea details from database
        const ideaQuery = `
      SELECT id, title, description, domain, technologies
      FROM ideas
      WHERE id = $1
    `;
        const ideaResult = await req.db.query(ideaQuery, [ideaId]);

        if (ideaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        const idea = ideaResult.rows[0];

        // Generate AI response
        const response = await marketValidatorChatService.generateChatResponse(
            idea,
            message,
            conversationHistory || []
        );

        res.json({
            success: true,
            response,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[MarketChatRoutes] Error processing chat message:', error);
        res.status(500).json({ error: 'Failed to process chat message' });
    }
});

module.exports = router;
