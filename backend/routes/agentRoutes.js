import express from 'express';
import crypto from 'crypto';
import { executeAgent, executeSimpleAgent } from '../agents/reactAgent.js';
import sessionManager from '../services/sessionManager.js';
import auth from '../middleware/auth.js';

console.log('✅ [Router] agentRoutes.js loaded');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// --- NEW Session-based Endpoints ---

/**
 * POST /api/agent/session
 * Starts a new asynchronous agent execution job and saves to database.
 */
router.post('/session', async (req, res) => {
    try {
        const { userQuery, embeddingProvider = 'llama', filters = {}, synergyMode = false } = req.body;

        if (!userQuery) {
            return res.status(400).json({ error: true, message: 'userQuery is required' });
        }

        const httpSessionId = req.session?.id;
        const pool = req.app.locals.pool;

        if (!pool) {
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        // Get user ID from JWT token (req.user is set by auth middleware)
        const userId = req.user?.user?.emp_id;
        if (!userId) {
            return res.status(401).json({ error: true, message: 'User not authenticated' });
        }

        // Create a unique ID for this specific job
        const jobId = crypto.randomUUID();

        // Save initial session to database
        try {
            await pool.query(
                `INSERT INTO agent_sessions (user_id, job_id, query, status, embedding_provider, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                [userId, jobId, userQuery, 'queued', embeddingProvider]
            );
            console.log(`[Agent Session] Created database record for job ${jobId}, user: ${userId}`);
        } catch (dbError) {
            console.error(`[Agent Session] Failed to save to database:`, dbError.message);
            return res.status(500).json({ error: true, message: 'Failed to create session record' });
        }

        const initialState = {
            query: userQuery,
            status: 'queued',
            result: null,
            history: [],
        };
        sessionManager.createSession(jobId, initialState);

        // Immediately respond to the client with the job ID
        res.status(202).json({ success: true, jobId });

        // Execute the agent in the background (don't await)
        executeAgent(jobId, userQuery, pool, httpSessionId, { embeddingProvider, filters, synergyMode, userId })
            .catch(err => {
                console.error(`[Agent Job ${jobId}] Execution failed:`, err);
                sessionManager.updateSession(jobId, { status: 'failed', error: err.message });
                // Update database with failure status
                pool.query(
                    `UPDATE agent_sessions SET status = $1, updated_at = NOW() WHERE job_id = $2`,
                    ['failed', jobId]
                ).catch(e => console.error(`Failed to update DB status:`, e.message));
            });

    } catch (error) {
        console.error('Failed to start agent session:', error.message);
        res.status(500).json({ error: true, message: 'Failed to start agent session' });
    }
});


/**
 * GET /api/agent/session/:id/status
 * Polls for the status and result of an agent job.
 * Updates database when session completes.
 */
router.get('/session/:id/status', async (req, res) => {
    const { id } = req.params;
    const session = sessionManager.getSession(id);

    if (!session) {
        return res.status(404).json({ error: true, message: 'Job not found' });
    }

    // Update database if session is completed
    if (session.status === 'completed' && session.result) {
        const pool = req.app.locals.pool;
        if (pool) {
            try {
                await pool.query(
                    `UPDATE agent_sessions 
                     SET status = $1, result = $2, updated_at = NOW() 
                     WHERE job_id = $3`,
                    ['completed', JSON.stringify(session.result), id]
                );
            } catch (dbError) {
                console.error(`[Agent Session ${id}] Failed to update database:`, dbError.message);
            }
        }
    }

    res.json({ success: true, ...session });
});

/**
 * POST /api/agent/session/:id/stop
 * Cancels a running agent job.
 */
router.post('/session/:id/stop', (req, res) => {
    const { id } = req.params;
    const session = sessionManager.getSession(id);

    if (!session) {
        return res.status(404).json({ error: true, message: 'Job not found' });
    }

    if (session.status === 'running' || session.status === 'queued') {
        sessionManager.updateSession(id, { status: 'cancelled' });
        console.log(`[Agent Job ${id}] Cancellation request received.`);
        res.json({ success: true, message: 'Cancellation requested.' });
    } else {
        res.json({ success: false, message: `Job is already ${session.status}.` });
    }
});


// --- History Management Endpoints ---

/**
 * GET /api/agent/history
 * Fetch agent search history for the authenticated user.
 * Returns last 20 completed sessions ordered by most recent.
 */
router.get('/history', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        if (!pool) {
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        const userId = req.user?.user?.emp_id;
        if (!userId) {
            return res.status(401).json({ error: true, message: 'User not authenticated' });
        }

        const result = await pool.query(
            `SELECT id, job_id, query, status, result, embedding_provider, created_at, updated_at
             FROM agent_sessions
             WHERE user_id = $1 AND status = 'completed'
             ORDER BY created_at DESC
             LIMIT 20`,
            [userId]
        );

        const history = result.rows.map(row => ({
            id: row.job_id,
            query: row.query,
            timestamp: new Date(row.created_at).getTime(),
            session: {
                id: row.job_id,
                status: row.status,
                query: row.query,
                result: row.result,
                createdAt: new Date(row.created_at).getTime(),
                updatedAt: new Date(row.updated_at).getTime(),
                history: []
            }
        }));

        console.log(`[Agent History] Fetched ${history.length} items for user: ${userId}`);
        res.json({ success: true, history });

    } catch (error) {
        console.error('Failed to fetch agent history:', error.message);
        res.status(500).json({ error: true, message: 'Failed to fetch history' });
    }
});

/**
 * DELETE /api/agent/history
 * Clear all agent search history for the authenticated user.
 */
router.delete('/history', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        if (!pool) {
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        const userId = req.user?.user?.emp_id;
        if (!userId) {
            return res.status(401).json({ error: true, message: 'User not authenticated' });
        }

        const result = await pool.query(
            `DELETE FROM agent_sessions WHERE user_id = $1`,
            [userId]
        );

        console.log(`[Agent History] Cleared ${result.rowCount} sessions for user: ${userId}`);
        res.json({ success: true, message: `Cleared ${result.rowCount} sessions`, count: result.rowCount });

    } catch (error) {
        console.error('Failed to clear agent history:', error.message);
        res.status(500).json({ error: true, message: 'Failed to clear history' });
    }
});

/**
 * DELETE /api/agent/history/:id
 * Delete a specific agent session by job ID.
 */
router.delete('/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pool = req.app.locals.pool;

        if (!pool) {
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        const userId = req.user?.user?.emp_id;
        if (!userId) {
            return res.status(401).json({ error: true, message: 'User not authenticated' });
        }

        // Ensure user can only delete their own sessions
        const result = await pool.query(
            `DELETE FROM agent_sessions WHERE job_id = $1 AND user_id = $2`,
            [id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: true, message: 'Session not found or unauthorized' });
        }

        console.log(`[Agent History] Deleted session ${id} for user: ${userId}`);
        res.json({ success: true, message: 'Session deleted' });

    } catch (error) {
        console.error('Failed to delete agent session:', error.message);
        res.status(500).json({ error: true, message: 'Failed to delete session' });
    }
});


// --- DEPRECATED Synchronous Endpoint ---

/**
 * POST /api/agent/query
 * @deprecated Use session-based endpoints instead.
 * Execute agent query with optional filters
 */
router.post('/query', async (req, res) => {
    try {
        const { userQuery, embeddingProvider = 'llama', filters = {}, synergyMode = false } = req.body;

        if (!userQuery || typeof userQuery !== 'string') {
            return res.status(400).json({
                error: true,
                message: 'userQuery is required and must be a string'
            });
        }

        const sessionId = req.session?.id || null;
        const pool = req.app.locals.pool;

        if (!pool) {
            return res.status(503).json({
                error: true,
                message: 'Database not available'
            });
        }

        console.log(`[DEPRECATED] 📥 Agent query from session ${sessionId} using [${embeddingProvider}]: "${userQuery}"`);

        // Execute agent (synchronously)
        // NOTE: The signature of executeAgent will change. This old route may break
        // or require a dedicated synchronous agent function. For now, we call the simple one.
        const result = await executeSimpleAgent(userQuery, pool, sessionId, { embeddingProvider });

        res.json({
            success: !result.error,
            ...result,
            sessionId
        });

    } catch (error) {
        console.error('Agent query error:', error.message);
        res.status(500).json({
            error: true,
            message: 'Failed to process agent query',
            details: error.message
        });
    }
});

export default router;
