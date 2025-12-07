import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateChatCompletion, getModelNames } from '../config/ollama.js';
import TavilyTool from './tools/tavilyTool.js';
import InternalRAGTool from './tools/internalRAGTool.js';
import { formatResponse } from './responseFormatter.js';
import sessionManager from '../services/sessionManager.js';
import ConversationService from '../services/conversationService.js';

const API_KEY = process.env.API_KEY;

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
    const { embeddingProvider = 'gemini', userId = null } = options;

    try {
        console.log(`[Agent Job ${jobId}] Starting...`);
        sessionManager.updateSession(jobId, { status: 'running', stage: 'starting' });

        // Initialize tools - pass userId instead of httpSessionId for context isolation
        const internalTool = new InternalRAGTool(pool, userId, embeddingProvider);
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

        // --- Step 2: Synthesize results with Gemini 1.5 Flash ---
        let synthesizedAnswer;

        // Try Gemini first, fallback to Ollama if unavailable
        if (API_KEY && API_KEY !== 'your-google-genai-api-key-here') {
            try {
                const genAI = new GoogleGenerativeAI(API_KEY);
                const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

                const prompt = `You are an AI assistant helping analyze innovation ideas. Your task is to synthesize information from internal and external sources to answer user questions comprehensively.

When answering:
1. Combine insights from both internal and external sources.
2. Cite specific ideas by their IDEA-XXX identifiers when referencing internal data (format: IDEA-123).
3. Include URLs when referencing external sources.
4. Be concise but thorough.
5. If information is limited, acknowledge it.

Question: ${userQuery}

Internal Search Results:
${internalData}

External Search Results:
${externalData}

Please provide a comprehensive answer that synthesizes both sources.`;

                const result = await model.generateContent(prompt);
                synthesizedAnswer = result.response.text();
                console.log(`[Agent Job ${jobId}] Synthesis completed with Gemini`);

            } catch (geminiError) {
                console.warn(`[Agent Job ${jobId}] Gemini synthesis failed, falling back to Ollama:`, geminiError.message);

                // Fallback to Ollama
                const { reasoning: modelName } = getModelNames();
                const messages = [
                    {
                        role: 'system',
                        content: `You are an AI assistant helping analyze innovation ideas. Cite ideas as IDEA-XXX and include URLs for external sources.`
                    },
                    {
                        role: 'user',
                        content: `Question: ${userQuery}\n\nInternal: ${internalData}\n\nExternal: ${externalData}\n\nSynthesize both sources.`
                    }
                ];
                const completion = await generateChatCompletion(messages, modelName, { temperature: 0.7, max_tokens: 1000 });
                synthesizedAnswer = completion.message.content;
            }
        } else {
            // Use Ollama if Gemini not configured
            console.log(`[Agent Job ${jobId}] Using Ollama for synthesis`);
            const { reasoning: modelName } = getModelNames();
            const messages = [
                {
                    role: 'system',
                    content: `You are an AI assistant helping analyze innovation ideas. Cite ideas as IDEA-XXX and include URLs for external sources.`
                },
                {
                    role: 'user',
                    content: `Question: ${userQuery}\n\nInternal: ${internalData}\n\nExternal: ${externalData}\n\nSynthesize both sources.`
                }
            ];
            const completion = await generateChatCompletion(messages, modelName, { temperature: 0.7, max_tokens: 1000 });
            synthesizedAnswer = completion.message.content;
        }

        // Check for cancellation
        if (sessionManager.getSession(jobId)?.status === 'cancelled') return;

        // --- Step 3: Format the final response ---
        const processingTime = (Date.now() - startTime) / 1000;
        const formattedResponse = formatResponse(
            synthesizedAnswer,
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

        // Save conversation to database (non-blocking)
        saveConversationAsync(pool, jobId, userQuery, finalResult, httpSessionId, embeddingProvider)
            .catch(err => console.error(`[Agent Job ${jobId}] Failed to save conversation:`, err.message));

    } catch (error) {
        console.error(`[Agent Job ${jobId}] Execution error:`, error.message);
        sessionManager.updateSession(jobId, { status: 'failed', error: error.message });
    }
}

/**
 * Save agent conversation to database (async, non-blocking)
 * @param {Object} pool - Database pool
 * @param {string} jobId - Job ID
 * @param {string} userQuery - User's query
 * @param {Object} agentResponse - Agent's response
 * @param {string} sessionId - Session ID
 * @param {string} embeddingProvider - Embedding provider used
 */
async function saveConversationAsync(pool, jobId, userQuery, agentResponse, sessionId, embeddingProvider) {
    try {
        // Get user ID from session or use a default
        // In production, this should come from authenticated user
        const userId = 'system'; // TODO: Get from authenticated user context

        const conversationService = new ConversationService(pool);

        // Generate title from user query
        const title = conversationService.generateTitle(userQuery);

        // Create conversation
        const conversation = await conversationService.createConversation(userId, {
            title,
            tags: [],
            sessionId,
            documentContext: null,
            embeddingProvider
        });

        // Add user message
        await conversationService.addMessage(conversation.id, userId, {
            role: 'user',
            content: userQuery,
            metadata: null
        });

        // Add agent response
        await conversationService.addMessage(conversation.id, userId, {
            role: 'agent',
            content: agentResponse.answer || agentResponse.response || 'No response generated',
            metadata: {
                sources: agentResponse.sources || [],
                toolsUsed: ['internalRAG', 'tavilySearch'],
                processingTime: agentResponse.processingTime,
                jobId
            }
        });

        console.log(`[Agent Job ${jobId}] Conversation saved: ${conversation.id}`);

    } catch (error) {
        // Log but don't throw - conversation saving should not break agent execution
        console.error(`[Agent Job ${jobId}] Error saving conversation:`, error.message);
    }
}

/**
 * DEPRECATED: Synchronous agent for the old /query route.
 */
export async function executeSimpleAgent(userQuery, pool, sessionId = null, options = {}) {
    const startTime = Date.now();
    const { embeddingProvider = 'gemini' } = options;

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
