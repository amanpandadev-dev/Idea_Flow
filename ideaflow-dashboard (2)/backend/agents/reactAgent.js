import { generateChatCompletion, getModelNames } from '../config/ollama.js';
import TavilyTool from './tools/tavilyTool.js';
import InternalRAGTool from './tools/internalRAGTool.js';
import { formatResponse } from './responseFormatter.js';
import sessionManager from '../services/sessionManager.js';

/**
 * Asynchronously executes the agent process for a given job.
 * This function is designed to be long-running and updates a session store
 * with its progress, rather than returning a direct response.
 * @param {string} jobId - The unique ID for this execution job.
 * @param {string} userQuery - The user's original question.
 * @param {Object} pool - The PostgreSQL connection pool.
 * @param {string} httpSessionId - The user's HTTP session ID for ephemeral context.
 * @param {Object} options - Additional options like embeddingProvider.
 */
export async function executeAgent(jobId, userQuery, pool, httpSessionId = null, options = {}) {
    const startTime = Date.now();
    const { embeddingProvider = 'llama' } = options;

    try {
        console.log(`[Agent Job ${jobId}] Starting...`);
        sessionManager.updateSession(jobId, { status: 'running', stage: 'starting' });

        // Initialize tools
        const internalTool = new InternalRAGTool(pool, httpSessionId, embeddingProvider);
        const tavilyTool = new TavilyTool();
        
        // --- Step 1: Execute tools in parallel ---
        sessionManager.updateSession(jobId, { stage: 'searching', history: ['Searching internal repository and the web...'] });
        const [internalResults, externalResults] = await Promise.allSettled([
            internalTool.execute(userQuery),
            tavilyTool.execute(userQuery)
        ]);

        // Check for cancellation
        if (sessionManager.getSession(jobId)?.status === 'cancelled') return;

        const internalData = internalResults.status === 'fulfilled' ? internalResults.value : 'Internal search failed';
        const externalData = externalResults.status === 'fulfilled' ? externalResults.value : 'External search unavailable';
        
        sessionManager.updateSession(jobId, { 
            history: [
                'Searching internal repository and the web... Done.',
                'Synthesizing results...'
            ],
            stage: 'synthesizing',
            toolOutputs: { internalData, externalData }
        });

        // --- Step 2: Synthesize results with an LLM ---
        const { reasoning: modelName } = getModelNames();
        const messages = [
            {
                role: 'system',
                content: `You are an AI assistant helping analyze innovation ideas. Your task is to synthesize information from internal and external sources to answer user questions comprehensively.

When answering:
1. Combine insights from both internal and external sources.
2. Cite specific ideas by their IDEA-XXX identifiers when referencing internal data.
3. Include URLs when referencing external sources.
4. Be concise but thorough.
5. If information is limited, acknowledge it.`
            },
            {
                role: 'user',
                content: `Question: ${userQuery}\n\nInternal Search Results:\n${internalData}\n\nExternal Search Results:\n${externalData}\n\nPlease provide a comprehensive answer that synthesizes both sources.`
            }
        ];

        const completion = await generateChatCompletion(messages, modelName, { temperature: 0.7, max_tokens: 1000 });
        
        // Check for cancellation
        if (sessionManager.getSession(jobId)?.status === 'cancelled') return;

        // --- Step 3: Format the final response ---
        const processingTime = (Date.now() - startTime) / 1000;
        const formattedResponse = formatResponse(
            completion.message.content,
            [
                { tool: 'internal_rag', output: internalData },
                { tool: 'tavily_search', output: externalData }
            ]
        );

        const finalResult = {
            ...formattedResponse,
            usedEphemeralContext: httpSessionId !== null,
            processingTime: parseFloat(processingTime.toFixed(2))
        };
        
        console.log(`[Agent Job ${jobId}] Completed in ${processingTime}s.`);
        sessionManager.updateSession(jobId, { status: 'completed', stage: 'finished', result: finalResult });

    } catch (error) {
        console.error(`[Agent Job ${jobId}] Execution error:`, error.message);
        sessionManager.updateSession(jobId, { status: 'failed', error: error.message });
    }
}

/**
 * DEPRECATED: Synchronous agent for the old /query route.
 */
export async function executeSimpleAgent(userQuery, pool, sessionId = null, options = {}) {
    const startTime = Date.now();
    const { embeddingProvider = 'llama' } = options;

    try {
        console.log(`[DEPRECATED] Simple agent processing: "${userQuery}"`);

        const internalTool = new InternalRAGTool(pool, sessionId, embeddingProvider);
        const tavilyTool = new TavilyTool();

        const internalResults = await internalTool.execute(userQuery);
        
        let externalResults = '';
        try {
            externalResults = await tavilyTool.execute(userQuery);
        } catch (e) {
            console.warn('External search failed, continuing with internal only');
            externalResults = 'External search unavailable';
        }

        const answer = `Based on our internal repository and external sources:\n\n${internalResults}\n\n${externalResults}`;
        const processingTime = (Date.now() - startTime) / 1000;

        // Manually format a response object similar to the async one for compatibility
        return {
            answer,
            citations: { internal: [], external: [] },
            reasoning: 'Simple tool execution (non-agentic)',
            usedEphemeralContext: sessionId !== null,
            processingTime: parseFloat(processingTime.toFixed(2))
        };

    } catch (error) {
        console.error('Simple agent error:', error.message);
        throw error;
    }
}

export default {
    executeAgent,
    executeSimpleAgent
};
