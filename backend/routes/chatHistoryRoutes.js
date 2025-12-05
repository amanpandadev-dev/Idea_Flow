/**
 * Chat History Routes for Pro Search
 * Stores and retrieves chat sessions and messages
 */

import express from 'express';

const router = express.Router();

// Get pool from app
const getPool = (req) => req.app.get('db');

/**
 * GET /api/chat/sessions - Get all chat sessions for a user
 */
router.get('/sessions', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';
        
        const result = await pool.query(`
            SELECT 
                cs.id,
                cs.title,
                cs.created_at,
                cs.updated_at,
                COUNT(cm.id) as message_count
            FROM chat_sessions cs
            LEFT JOIN chat_messages cm ON cs.id = cm.session_id
            WHERE cs.user_id = $1
            GROUP BY cs.id
            ORDER BY cs.updated_at DESC
            LIMIT 50
        `, [userId]);

        // Group sessions by date
        const grouped = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);

        result.rows.forEach(session => {
            const date = new Date(session.created_at);
            date.setHours(0, 0, 0, 0);

            let dateKey;
            if (date.getTime() === today.getTime()) {
                dateKey = 'Today';
            } else if (date.getTime() === yesterday.getTime()) {
                dateKey = 'Yesterday';
            } else if (date > lastWeek) {
                dateKey = 'Last 7 Days';
            } else {
                dateKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            }

            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push({
                id: session.id,
                title: session.title,
                messageCount: parseInt(session.message_count),
                createdAt: session.created_at,
                updatedAt: session.updated_at
            });
        });

        res.json({ sessions: grouped });
    } catch (err) {
        console.error('[ChatHistory] Error fetching sessions:', err);
        res.status(500).json({ error: 'Failed to fetch chat sessions' });
    }
});

/**
 * POST /api/chat/sessions - Create a new chat session
 */
router.post('/sessions', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';
        const { title } = req.body;

        const result = await pool.query(`
            INSERT INTO chat_sessions (user_id, title)
            VALUES ($1, $2)
            RETURNING id, title, created_at, updated_at
        `, [userId, title || 'New Chat']);

        res.json({ session: result.rows[0] });
    } catch (err) {
        console.error('[ChatHistory] Error creating session:', err);
        res.status(500).json({ error: 'Failed to create chat session' });
    }
});

/**
 * GET /api/chat/sessions/:sessionId/messages - Get messages for a session
 */
router.get('/sessions/:sessionId/messages', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const { sessionId } = req.params;
        
        const result = await pool.query(`
            SELECT id, role, content, metadata, created_at
            FROM chat_messages
            WHERE session_id = $1
            ORDER BY created_at ASC
        `, [sessionId]);

        res.json({ 
            messages: result.rows.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                metadata: msg.metadata,
                timestamp: msg.created_at
            }))
        });
    } catch (err) {
        console.error('[ChatHistory] Error fetching messages:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * POST /api/chat/sessions/:sessionId/messages - Add a message to a session
 */
router.post('/sessions/:sessionId/messages', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const { sessionId } = req.params;
        const { role, content, metadata } = req.body;

        // Limit results stored to prevent huge payloads (store top 10 only)
        let processedMetadata = metadata;
        if (metadata?.results && Array.isArray(metadata.results)) {
            processedMetadata = {
                ...metadata,
                results: metadata.results.slice(0, 10).map((r) => ({
                    id: r.id,
                    title: r.title,
                    description: r.description?.substring(0, 200),
                    domain: r.domain,
                    businessGroup: r.businessGroup,
                    technologies: r.technologies,
                    matchScore: r.matchScore
                }))
            };
        }

        // Insert message
        const msgResult = await pool.query(`
            INSERT INTO chat_messages (session_id, role, content, metadata)
            VALUES ($1, $2, $3, $4)
            RETURNING id, role, content, metadata, created_at
        `, [sessionId, role, content, processedMetadata ? JSON.stringify(processedMetadata) : null]);

        // Update session title if first user message
        if (role === 'user') {
            const countResult = await pool.query(
                'SELECT COUNT(*) FROM chat_messages WHERE session_id = $1 AND role = $2',
                [sessionId, 'user']
            );
            
            if (parseInt(countResult.rows[0].count) === 1) {
                const title = content.length > 50 ? content.substring(0, 47) + '...' : content;
                await pool.query(
                    'UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [title, sessionId]
                );
            } else {
                await pool.query(
                    'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [sessionId]
                );
            }
        }

        res.json({ 
            message: {
                id: msgResult.rows[0].id,
                role: msgResult.rows[0].role,
                content: msgResult.rows[0].content,
                metadata: msgResult.rows[0].metadata,
                timestamp: msgResult.rows[0].created_at
            }
        });
    } catch (err) {
        console.error('[ChatHistory] Error adding message:', err);
        res.status(500).json({ error: 'Failed to add message' });
    }
});

/**
 * DELETE /api/chat/sessions/:sessionId - Delete a chat session
 */
router.delete('/sessions/:sessionId', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const { sessionId } = req.params;
        const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';

        await pool.query('DELETE FROM chat_messages WHERE session_id = $1', [sessionId]);
        await pool.query(
            'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, userId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('[ChatHistory] Error deleting session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

/**
 * PATCH /api/chat/sessions/:sessionId - Rename a chat session
 */
router.patch('/sessions/:sessionId', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const { sessionId } = req.params;
        const { title } = req.body;
        const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';

        const result = await pool.query(`
            UPDATE chat_sessions 
            SET title = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2 AND user_id = $3
            RETURNING id, title, updated_at
        `, [title, sessionId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ session: result.rows[0] });
    } catch (err) {
        console.error('[ChatHistory] Error renaming session:', err);
        res.status(500).json({ error: 'Failed to rename session' });
    }
});

export default router;
