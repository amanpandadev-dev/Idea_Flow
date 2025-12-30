/**
 * Chat History Routes - Complete Implementation
 * Manages chat sessions, messages, and integration with ProSearch
 */

import express from 'express';
import pg from 'pg';

const router = express.Router();
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

/**
 * GET /api/chat/sessions
 * Load all chat sessions for user (grouped by date)
 */
router.get('/sessions', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.user?.user?.emp_id;
        console.log('[ChatHistory] Loading sessions for user:', userId);

        const query = `
            SELECT id, user_id, title, created_at, updated_at
            FROM chat_sessions
            WHERE user_id = $1
            ORDER BY updated_at DESC
            LIMIT 50
        `;

        const result = await pool.query(query, [userId]);

        // Format and group by date
        const sessions = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            updatedAt: row.updated_at,
            createdAt: row.created_at
        }));

        // Group by time periods
        const grouped = {
            today: [],
            yesterday: [],
            thisWeek: [],
            older: []
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        sessions.forEach(session => {
            const sessionDate = new Date(session.updatedAt);
            if (sessionDate >= today) {
                grouped.today.push(session);
            } else if (sessionDate >= yesterday) {
                grouped.yesterday.push(session);
            } else if (sessionDate >= weekAgo) {
                grouped.thisWeek.push(session);
            } else {
                grouped.older.push(session);
            }
        });

        console.log(`[ChatHistory] Returning ${sessions.length} sessions`);
        res.json({ sessions: grouped });

    } catch (error) {
        console.error('[ChatHistory] Error loading sessions:', error);
        res.json({ sessions: { today: [], yesterday: [], thisWeek: [], older: [] } });
    }
});

/**
 * POST /api/chat/sessions
 * Create a new chat session
 */
router.post('/sessions', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.user?.user?.emp_id;
        const { title } = req.body;

        console.log('[ChatHistory] Creating session for user:', userId);

        const query = `
            INSERT INTO chat_sessions (user_id, title, created_at, updated_at)
            VALUES ($1, $2, NOW(), NOW())
            RETURNING id, title, created_at, updated_at
        `;

        const result = await pool.query(query, [userId, title || 'New Chat']);
        const session = result.rows[0];

        console.log(`[ChatHistory] Created session ${session.id}`);

        res.json({
            session: {
                id: session.id,
                title: session.title,
                created_at: session.created_at,
                updated_at: session.updated_at
            }
        });

    } catch (error) {
        console.error('[ChatHistory] Error creating session:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to create session'
        });
    }
});

/**
 * GET /api/chat/sessions/:sessionId/messages
 * Load all messages for a session
 */
router.get('/sessions/:sessionId/messages', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.headers['x-user-id'] || req.user?.user?.emp_id;

        console.log(`[ChatHistory] Loading messages for session ${sessionId}`);

        // Verify session belongs to user
        const sessionCheck = await pool.query(
            'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, userId]
        );

        if (sessionCheck.rows.length === 0) {
            return res.status(404).json({ error: true, message: 'Session not found' });
        }

        // Load messages
        const query = `
            SELECT id, role, content, metadata, created_at
            FROM chat_messages
            WHERE session_id = $1
            ORDER BY created_at ASC
        `;

        const result = await pool.query(query, [sessionId]);

        const messages = result.rows.map(row => ({
            id: row.id,
            role: row.role,
            content: row.content,
            metadata: row.metadata,
            timestamp: row.created_at
        }));

        console.log(`[ChatHistory] Loaded ${messages.length} messages`);

        res.json({ messages });

    } catch (error) {
        console.error('[ChatHistory] Error loading messages:', error);
        res.status(500).json({ error: true, message: 'Failed to load messages' });
    }
});

/**
 * POST /api/chat/sessions/:sessionId/messages
 * Save a message to a session
 */
router.post('/sessions/:sessionId/messages', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { role, content, metadata } = req.body;
        const userId = req.headers['x-user-id'] || req.user?.user?.emp_id;

        console.log(`[ChatHistory] Saving message to session ${sessionId}`);

        // Verify session belongs to user
        const sessionCheck = await pool.query(
            'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, userId]
        );

        if (sessionCheck.rows.length === 0) {
            return res.status(404).json({ error: true, message: 'Session not found' });
        }

        // Save message
        const query = `
            INSERT INTO chat_messages (session_id, role, content, metadata, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, role, content, metadata, created_at
        `;

        const result = await pool.query(query, [
            sessionId,
            role,
            content,
            JSON.stringify(metadata || {})
        ]);

        // Update session updated_at
        await pool.query(
            'UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1',
            [sessionId]
        );

        const message = result.rows[0];

        res.json({
            message: {
                id: message.id,
                role: message.role,
                content: message.content,
                metadata: message.metadata,
                timestamp: message.created_at
            }
        });

    } catch (error) {
        console.error('[ChatHistory] Error saving message:', error);
        res.status(500).json({ error: true, message: 'Failed to save message' });
    }
});

/**
 * DELETE /api/chat/sessions/:sessionId
 * Delete a chat session and all its messages
 */
router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.headers['x-user-id'] || req.user?.user?.emp_id;

        console.log(`[ChatHistory] Deleting session ${sessionId}`);

        // Delete session (messages will cascade)
        const result = await pool.query(
            'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
            [sessionId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: true, message: 'Session not found' });
        }

        console.log(`[ChatHistory] Deleted session ${sessionId}`);

        res.json({ success: true, message: 'Session deleted' });

    } catch (error) {
        console.error('[ChatHistory] Error deleting session:', error);
        res.status(500).json({ error: true, message: 'Failed to delete session' });
    }
});

export default router;
