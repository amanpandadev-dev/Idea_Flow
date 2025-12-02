import express from 'express';
import crypto from 'crypto';
import { executeAgent, executeSimpleAgent } from '../agents/reactAgent.js';
import sessionManager from '../services/sessionManager.js';
import { generateQuestionsFromContext } from '../services/questionGenerator.js';

console.log('✅ [Router] agentRoutes.js loaded');

const router = express.Router();

// --- NEW Session-based Endpoints ---

/**
 * POST /api/agent/session
 * Starts a new asynchronous agent execution job.
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

        // Create a unique ID for this specific job
        const jobId = crypto.randomUUID();

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
        executeAgent(jobId, userQuery, pool, httpSessionId, { embeddingProvider, filters, synergyMode })
            .catch(err => {
                console.error(`[Agent Job ${jobId}] Execution failed:`, err);
                sessionManager.updateSession(jobId, { status: 'failed', error: err.message });
            });

    } catch (error) {
        console.error('Failed to start agent session:', error.message);
        res.status(500).json({ error: true, message: 'Failed to start agent session' });
    }
});


/**
 * GET /api/agent/session/:id/status
 * Polls for the status and result of an agent job.
 */
router.get('/session/:id/status', (req, res) => {
    const { id } = req.params;
    const session = sessionManager.getSession(id);

    if (!session) {
        return res.status(404).json({ error: true, message: 'Job not found' });
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

/**
 * POST /api/agent/generate-questions
 * Generate suggested questions from context stats
 */
router.post('/generate-questions', async (req, res) => {
    try {
        const { contextStats, provider = 'llama' } = req.body;
        const questions = await generateQuestionsFromContext(contextStats, provider);
        res.json({ success: true, questions });
    } catch (error) {
        console.error('Failed to generate questions:', error);
        res.status(500).json({ error: true, message: 'Failed to generate questions' });
    }
});

export default router;
