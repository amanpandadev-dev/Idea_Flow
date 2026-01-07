import { generateChatCompletion, getModelNames } from '../config/ollama.js';
import TavilyTool from './tools/tavilyTool.js';
import InternalRAGTool from './tools/internalRAGTool.js';
import { formatResponse } from './responseFormatter.js';
import sessionManager from '../services/sessionManager.js';
import ConversationService from '../services/conversationService.js';

// No more Gemini - using Ollama/Llama only

/**
 * Check if question is explicitly out of scope by domain
 * Blocks linguistic, dictionary, celebrity, geography, and trivia questions
 * @param {string} query - User's question
 * @returns {boolean} True if question should be blocked
 */
function isOutOfScopeByDomain(query) {
    const lower = query.toLowerCase();

    // Regex patterns for explicitly blocked question types
    const blockedPatterns = [
        // Linguistic / Grammar / Vocabulary
        /difference between .+ and .+/i,
        /what'?s? the difference between/i,
        /meaning of .+/i,
        /what does .+ mean/i,
        /define .+/i,
        /definition of .+/i,
        /spell.+difference/i,
        /synonym of .+/i,
        /antonym of .+/i,
        /how do you spell/i,
        /pronunciation of/i,

        // Celebrity / Person queries (not business context)
        /who is [a-z ]+(?:gates|bezos|musk|zuckerberg|jobs|buffett)?/i,
        /who is [a-z ]+(?:babu|kalyan|kohli|tendulkar|dhoni)?/i,
        /biography of .+/i,
        /who was [a-z ]+/i,

        // Geography / Trivia
        /capital of .+/i,
        /population of .+/i,
        /when was .+ founded/i,
        /when did .+ happen/i,
        /what year (was|did)/i,

        // Pure education (non-business)
        /explain photosynthesis/i,
        /what is gravity/i,
        /how does photosynthesis/i,
        /biology of .+/i,
        /chemistry of .+/i,
        /physics of .+/i
    ];

    return blockedPatterns.some(pattern => pattern.test(lower));
}

/**
 * Check if user question is scoped to platform/documents context
 * Blocks celebrity, sports, entertainment, and generic knowledge queries
 * @param {string} query - User's question
 * @param {boolean} hasDocumentContext - Whether user has uploaded documents
 * @returns {boolean} True if question is in scope
 */
function isAgentScopedQuestion(query, hasDocumentContext = false) {
    const lowerQuery = query.toLowerCase();

    // 0. FIRST CHECK: Domain exclusion (hard block)
    if (isOutOfScopeByDomain(query)) {
        console.log(`[AgentScope] ❌ OUT OF SCOPE - Domain exclusion: "${query.substring(0, 50)}..."`);
        return false;
    }

    // 1. Allow document-specific questions if context exists
    const documentKeywords = ['document', 'summarize', 'summary', 'uploaded', 'file', 'content'];
    const hasDocumentIntent = documentKeywords.some(kw => lowerQuery.includes(kw));

    if (hasDocumentIntent || hasDocumentContext) {
        // Document-related OR document exists - IN SCOPE
        console.log(`[AgentScope] ✅ IN SCOPE - Document query`);
        return true;
    }

    // 2. Block celebrity/entertainment queries
    const celebrityKeywords = [
        'actor', 'actress', 'movie', 'film', 'bollywood', 'hollywood',
        'singer', 'musician', 'celebrity', 'star', 'director',
        'cricket', 'football', 'sports', 'player', 'match', 'game',
        'mahesh babu', 'pawan kalyan', 'shahrukh', 'salman',
        'politician', 'minister', 'president', 'election'
    ];

    const hasCelebrityIntent = celebrityKeywords.some(kw => lowerQuery.includes(kw));
    if (hasCelebrityIntent) {
        // Check if it's business/marketing context (not pure entertainment)
        const businessContext = ['marketing', 'brand', 'campaign', 'strategy', 'business', 'endorsement'];
        const hasBusinessContext = businessContext.some(kw => lowerQuery.includes(kw));

        if (!hasBusinessContext) {
            console.log(`[AgentScope] ❌ OUT OF SCOPE - Celebrity/entertainment: "${query.substring(0, 50)}..."`);
            return false; // REJECT
        }
    }

    // 3. Block generic knowledge queries
    const genericKnowledge = [
        'capital of', 'population of', 'who is the', 'what is the weather',
        'how to cook', 'recipe for', 'what time is', 'what day is',
        'tell me a joke', 'weather today', 'temperature in', 'how tall is'
    ];

    const isGenericKnowledge = genericKnowledge.some(phrase => lowerQuery.includes(phrase));
    if (isGenericKnowledge) {
        console.log(`[AgentScope] ❌ OUT OF SCOPE - Generic knowledge: "${query.substring(0, 50)}..."`);
        return false; // REJECT
    }

    // 4. Allow platform/business/tech/AI queries
    const platformKeywords = [
        'idea', 'innovation', 'platform', 'ideaflow', 'business', 'market',
        'technology', 'tech', 'ai', 'artificial intelligence', 'machine learning',
        'software', 'application', 'system', 'solution', 'strategy',
        'organization', 'company', 'enterprise', 'workflow', 'process',
        'data', 'analytics', 'cloud', 'database', 'api', 'integration',
        'startup', 'product', 'service', 'customer', 'user', 'design'
    ];

    const hasPlatformIntent = platformKeywords.some(kw => lowerQuery.includes(kw));

    if (hasPlatformIntent) {
        console.log(`[AgentScope] ✅ IN SCOPE - Platform/business query`);
        return true;
    }

    // 5. Default: Allow if question is substantive (not too short/vague)
    const words = lowerQuery.split(/\s+/).filter(w => w.length > 3);
    if (words.length >= 3) {
        // Question is substantive, give benefit of doubt
        console.log(`[AgentScope] ✅ IN SCOPE - Substantial query (default allow)`);
        return true;
    }

    // 6. Reject very short/vague queries
    console.log(`[AgentScope] ❌ OUT OF SCOPE - Too vague: "${query}"`);
    return false;
}

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

        // --- PRE-EXECUTION SCOPE VALIDATION ---
        sessionManager.updateSession(jobId, { stage: 'validating', history: ['Validating query scope...'] });

        // Quick check for document context
        let hasDocumentContext = false;
        try {
            hasDocumentContext = await internalTool.hasDocuments();
            console.log(`[Agent Job ${jobId}] Document context: ${hasDocumentContext ? 'YES' : 'NO'}`);
        } catch (err) {
            console.log(`[AgentScope] Could not check documents: ${err.message}`);
        }

        // Scope validation
        const isScoped = isAgentScopedQuestion(userQuery, hasDocumentContext);

        if (!isScoped) {
            console.log(`[Agent Job ${jobId}] ❌ OUT OF SCOPE - Rejecting query`);

            // STRICT REJECTION: No reasoning, no sources, no UI artifacts
            const rejectionResponse = {
                status: "REJECTED",
                answer: "Please ask a question related to the uploaded documents or the IdeaFlow platform context.",
                citations: { internal: [], external: [] },
                showReasoning: false,
                reasoning: [],
                sources: []
            };

            sessionManager.updateSession(jobId, {
                status: 'completed',
                stage: 'rejected',
                result: rejectionResponse,
                history: ['Query out of scope - rejected'],
                elapsedMs: Date.now() - startTime
            });

            return; // EXIT EARLY - No Tavily, no LLM, no formatting
        }

        console.log(`[Agent Job ${jobId}] ✅ IN SCOPE - Proceeding with tool execution`);

        // --- Step 1: Execute tools (conditionally) ---
        sessionManager.updateSession(jobId, { stage: 'searching', history: ['Searching for relevant information...'] });

        // Decide whether to call Tavily (skip for document-only queries)
        const lowerQuery = userQuery.toLowerCase();
        const isDocumentOnlyQuery = lowerQuery.includes('summarize') ||
            lowerQuery.includes('summary') ||
            (hasDocumentContext && lowerQuery.includes('document'));

        let internalResults, externalResults;

        if (isDocumentOnlyQuery) {
            // Document-only: Skip Tavily
            console.log(`[Agent Job ${jobId}] Document-only query - skipping Tavily`);
            [internalResults] = await Promise.allSettled([
                internalTool.execute(userQuery)
            ]);
            externalResults = { status: 'fulfilled', value: 'External search skipped for document query.' };
        } else {
            // Normal query: Use both tools
            [internalResults, externalResults] = await Promise.allSettled([
                internalTool.execute(userQuery),
                tavilyTool.execute(userQuery)
            ]);
        }

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

        // --- Step 2: Synthesize results with Llama (Ollama) ---
        console.log(`[Agent Job ${jobId}] Using Llama for synthesis`);
        const { reasoning: modelName } = getModelNames();

        // Detect if this is a document summarization request
        const isDocumentSummarization = internalData.includes('DOCUMENT_CONTENT:');
        const isDocumentUnavailable = internalData.includes('DOCUMENT_UNAVAILABLE:');

        let messages;

        if (isDocumentUnavailable) {
            // Document summarization requested but no document uploaded
            messages = [
                {
                    role: 'system',
                    content: 'You are a helpful assistant. The user asked to summarize a document, but no document has been uploaded.'
                },
                {
                    role: 'user',
                    content: `Question: ${userQuery}\n\n${internalData}\n\nRespond clearly that no document is available to summarize.`
                }
            ];
        } else if (isDocumentSummarization) {
            // Document summarization mode - strict grounding
            messages = [
                {
                    role: 'system',
                    content: `You are an AI assistant that summarizes uploaded documents.

CRITICAL RULES:
1. Summarize ONLY the document content provided below
2. Do NOT add external knowledge or information
3. Do NOT explain what summarization is or mention AI tools
4. Do NOT mention technical details about the system
5. Focus on the actual content: main topics, key points, technologies, and outcomes mentioned in the document

Your summary should be concise (2-4 paragraphs) and directly describe what the document contains.`
                },
                {
                    role: 'user',
                    content: `${internalData}\n\nProvide a clear, concise summary of the document content above.`
                }
            ];
        } else {
            // Normal Q&A mode - UPDATED with strict scoping
            messages = [
                {
                    role: 'system',
                    content: `You are an AI assistant for an innovation management platform called IdeaFlow.

CRITICAL RULES:
1. Answer ONLY using the provided Internal and External data
2. Focus on: innovation ideas, business strategy, technology, AI, organizational processes
3. Do NOT answer questions about celebrities, sports, movies, or generic trivia
4. If data is insufficient, say so clearly - do NOT make up information
5. Cite internal ideas as IDEA-XXX and include URLs for external sources
6. Keep responses professional and business-focused
7. Never acknowledge or explain that you're an AI - just answer directly`
                },
                {
                    role: 'user',
                    content: `Question: ${userQuery}\n\nInternal: ${internalData}\n\nExternal: ${externalData}\n\nSynthesize both sources professionally.`
                }
            ];
        }

        const completion = await generateChatCompletion(messages, modelName, { temperature: 0.7, max_tokens: 1000 });
        const synthesizedAnswer = completion.message.content;

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
