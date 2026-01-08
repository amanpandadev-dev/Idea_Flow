// Market Validator Chat Service
// Provides conversational AI support for market validation inquiries
// Enhanced with intelligent query routing and external/internal resource selection

import { generateChatCompletion } from '../config/ollama.js';
import { searchPatents, searchMarketTrends, searchCompetitors } from './tavilySearchService.js';

// Intent categories for query routing
const INTENTS = {
    PATENT_RISK: 'patent_risk',
    MARKET_TRENDS: 'market_trends',
    COMPETITORS: 'competitors',
    COMPETITOR_RISK: 'competitor_risk',
    SUMMARIZE: 'summarize',
    GAP_ANALYSIS: 'gap_analysis',          // NEW: Use Case 3
    ELABORATE_PROBLEM: 'elaborate_problem', // NEW: Use Case 4
    OFF_TOPIC: 'off_topic',
    OUT_OF_SCOPE: 'out_of_scope',          // NEW: Questions unrelated to this specific idea
    UNSUPPORTED: 'unsupported',
    GENERAL: 'general'
};

// Keywords for intent detection
const INTENT_KEYWORDS = {
    [INTENTS.PATENT_RISK]: ['patent', 'ip', 'intellectual property', 'patent risk', 'ip risk', 'infringement', 'prior art'],
    [INTENTS.MARKET_TRENDS]: ['market trend', 'market size', 'industry trend', 'growth rate', 'market forecast', 'market analysis', 'tam', 'sam', 'som'],
    [INTENTS.COMPETITORS]: ['competitor', 'competition', 'rival', 'alternative', 'similar product', 'market player'],
    [INTENTS.SUMMARIZE]: ['summarize', 'summary', 'overview', 'brief', 'recap', 'tldr', 'explain this idea', 'what is this idea'],
    [INTENTS.GAP_ANALYSIS]: ['gap', 'unaddressed', 'not working on', 'missing', 'whitespace', 'opportunity', 'opportunities', 'problem statement', 'problem statements', 'problems', 'unique problem', 'areas to focus', 'area to focus', 'areas to work', 'area to work', 'where to start', 'what to work on', 'focus area', 'focus areas', 'give me area', 'give me few problem'],
    [INTENTS.ELABORATE_PROBLEM]: ['elaborate', 'detail', 'explain more', 'implementation', 'how to implement', 'starting point', 'start point', 'roadmap', 'guide', 'step by step', 'how do i', 'how to get started', 'area to start', 'where do i start'],
    [INTENTS.OFF_TOPIC]: ['weather', 'joke', 'hello', 'hi', 'bye', 'how are you', 'what time', 'who are you', 'your name', 'coding', 'recipe', 'poem', 'story']
};

// Analysis keywords that indicate user wants LLM analysis rather than raw search
const ANALYSIS_KEYWORDS = [
    'analyze', 'analysis', 'compare', 'comparison', 'evaluate', 'assessment',
    'strengths', 'weaknesses', 'pros', 'cons', 'advantages', 'disadvantages',
    'differentiate', 'differentiation', 'how does', 'what makes', 'why',
    'explain', 'breakdown', 'deep dive', 'insights', 'implications'
];

// Follow-up/reference keywords that indicate user is asking about previous data
const REFERENCE_KEYWORDS = [
    'with reference to', 'based on', 'from the above', 'mentioned above', 'listed above',
    'these competitors', 'those competitors', 'the competitors', 'the companies',
    'usp of', 'strengths of', 'weaknesses of', 'what does', 'how does',
    'focus on', 'recommend', 'suggestion', 'advice'
];

/**
 * Beautify and format LLM response
 * Removes markdown artifacts, formats properly for display
 */
function beautifyResponse(text) {
    if (!text) return text;

    // Remove triple asterisks (***) - common markdown artifact
    text = text.replace(/\*\*\*/g, '');

    // Remove markdown headers (##, ###, ####) - keep content but remove header markers
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Fix repeated source citations like "(Source 1)" appearing multiple times
    // Keep only the [Source X](url) format
    text = text.replace(/\(Source \d+\)/g, '');

    // Remove "Description:" labels that might appear
    text = text.replace(/^Description:\s*/gm, '');

    // Fix double asterisks to proper bold (keep them for frontend to render)
    // Frontend should handle ** as bold

    // Remove extra newlines (more than 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n');

    // Trim whitespace
    text = text.trim();

    return text;
}

/**
 * Format external sources with proper citations
 */
function formatSourcesWithCitations(results, category) {
    if (!results || results.length === 0) {
        return null;
    }

    let formatted = '';

    results.forEach((result, index) => {
        formatted += `${index + 1}. **${result.title}**\n`;
        formatted += `   ${result.content?.substring(0, 200)}...\n`;
        formatted += `   [Source](${result.url})\n\n`;
    });

    return formatted;
}

/**
 * Generate LLM-enhanced response with external data
 * This ensures all responses go through LLM for proper formatting and intelligence
 */
async function generateEnhancedResponse(idea, userMessage, externalData, dataType) {
    console.log(`[MarketChat] Generating LLM-enhanced response for ${dataType}`);

    try {
        const systemMessage = {
            role: 'system',
            content: `You are a specialized Market Validation AI Assistant. 
STRICT BOUNDARIES:
1. ONLY answer questions related to market validation, competitors, patents, and the provided Idea.
2. If the user asks anything outside of this scope (e.g., general knowledge, personal advice, unrelated tasks), politely decline and redirect them to market validation.
3. Use the provided context to ground your answer. 
4. If the provided data is insufficient, state clearly that you don't have enough specific data from the current search results, but can provide general domain guidance.`
        };

        let prompt = `Idea: ${idea.title}
Domain: ${idea.theme || idea.domain}

User asked: ${userMessage}

`;

        if (externalData && externalData.length > 0) {
            prompt += `External research data (${dataType}):\n\n`;
            externalData.forEach((item, index) => {
                prompt += `Source ${index + 1}: ${item.title}\n`;
                prompt += `Content: ${item.content}\n`;
                prompt += `URL: ${item.url}\n\n`;
            });

            prompt += `\nInstructions:
1. **CRITICAL: Use bullet points (•) for each competitor, NOT numbered lists.**
2. Write a clear, professional response about the ${dataType}
3. For EACH competitor/item, write ONE paragraph with:
   - Bullet point first (•)
   - Company name in bold: **Company Name**
   - Brief description (1-2 sentences)
   - Cite the source at the end: [Source](URL)
4. After listing all items, add a section called "Strategic Insight:" (use bold: **Strategic Insight:**)
5. Do NOT repeat source numbers multiple times
6. Do NOT use headers with ## or ###
7. Do NOT use *** (triple asterisks)
8. Keep it concise and actionable

Example format:
• **Company Name** - Brief description of what they do and their strengths. [Source](url)

• **Another Company** - Brief description of their offerings. [Source](url)

**Strategic Insight:** Your analysis and recommendation here.

Generate your response now:`;
        } else {
            // No external data - for summaries or general queries
            if (dataType === 'idea summary') {
                prompt += `\nInstructions:
1. Write a clear, concise summary of this idea
2. Structure it as:
   - Brief overview (2-3 sentences)
   - Key features or capabilities
   - Target market or use case
   - Value proposition
3. Do NOT use headers with ## or ###
4. Do NOT use *** (triple asterisks) - use ** for bold only
5. Keep it professional and actionable
6. End with **Key Opportunity:** highlighting the main market opportunity

Generate your response now:`;
            } else {
                prompt += `No external data available for this specific query.

Instructions:
1. Provide helpful, actionable guidance based EXCLUSIVELY on general market validation principles for the ${idea.theme || idea.domain} domain.
2. If the query is not about market validation, state that you cannot assist with that topic.
3. Do NOT invent specific companies, patents, or data points that are not in the context.
4. Do NOT use headers with ## or ###
5. Do NOT use *** (triple asterisks) - use ** for bold only
6. End with **Strategic Recommendation:** (in bold)

Generate your response:`;
            }
        }

        const userMessageObj = {
            role: 'user',
            content: prompt
        };

        const result = await generateChatCompletion(
            [systemMessage, userMessageObj],
            process.env.OLLAMA_REASONING_MODEL || 'qwen2.5:3b',
            {
                temperature: 0.7,
                num_predict: 600
            }
        );

        let response = result.message?.content || result.response || '';

        // Beautify the response
        response = beautifyResponse(response);

        return response;
    } catch (error) {
        console.error('[MarketChat] Error generating enhanced response:', error);
        // Return formatted external data as fallback
        if (externalData && externalData.length > 0) {
            return formatSourcesWithCitations(externalData, dataType);
        }
        return `I encountered an issue generating a response. Please try again.`;
    }
}

/**
 * Extract query parameters from user message
 * Extracts numbers, specific requirements, and constraints
 */
function extractQueryParameters(message) {
    const params = {
        limit: null,
        specificNames: [],
        timeframe: null,
        region: null,
        constraints: []
    };

    // Extract numerical limits (top 2, first 5, 3 competitors, etc.)
    const limitPatterns = [
        /(?:top|first|best|leading)\s+(\d+)/i,
        /(\d+)\s+(?:top|best|leading|main|key)/i,
        /give\s+(?:me\s+)?(\d+)/i,
        /list\s+(\d+)/i
    ];

    for (const pattern of limitPatterns) {
        const match = message.match(pattern);
        if (match) {
            params.limit = parseInt(match[1]);
            break;
        }
    }

    // Extract specific company/competitor names (capitalized words)
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let nameMatch;
    while ((nameMatch = namePattern.exec(message)) !== null) {
        const name = nameMatch[1];
        // Filter out common words that aren't company names
        if (!['What', 'Who', 'Give', 'Tell', 'Show', 'List', 'Find'].includes(name)) {
            params.specificNames.push(name);
        }
    }

    // Extract timeframe
    const timeframePattern = /(?:in|for|during)\s+(202\d|next\s+\d+\s+years?|last\s+\d+\s+years?)/i;
    const timeMatch = message.match(timeframePattern);
    if (timeMatch) {
        params.timeframe = timeMatch[1];
    }

    // Extract region/geography
    const regionPattern = /(?:in|for)\s+(US|USA|Europe|Asia|China|India|global|worldwide)/i;
    const regionMatch = message.match(regionPattern);
    if (regionMatch) {
        params.region = regionMatch[1];
    }

    // Extract constraints (biggest, smallest, newest, oldest, etc.)
    const constraintKeywords = ['biggest', 'largest', 'smallest', 'newest', 'oldest', 'most funded', 'fastest growing'];
    for (const keyword of constraintKeywords) {
        if (message.toLowerCase().includes(keyword)) {
            params.constraints.push(keyword);
        }
    }

    return params;
}

/**
 * LLM-based intent classification for robust natural language understanding
 * Uses Qwen to intelligently classify user intent regardless of phrasing
 */
async function classifyIntentWithLLM(message, idea, conversationHistory = []) {
    try {
        const systemMessage = {
            role: 'system',
            content: `You are an intent classifier for a Market Validation chatbot focused EXCLUSIVELY on validating the idea: "${idea.title}".

Your job is to classify user queries into ONE of these intents:

VALID INTENTS (Questions about THIS specific idea):
- PATENT_RISK: Patents, IP risks, intellectual property conflicts for THIS idea
- MARKET_TRENDS: Market size, trends, growth forecasts for THIS idea's domain (${idea.theme || idea.domain})
- COMPETITORS: Who the competitors are for THIS specific idea/product
- COMPETITOR_RISK: Specific competitor's threat to THIS idea
- SUMMARIZE: Summary or overview of THIS idea
- GAP_ANALYSIS: Problem statements, opportunities, gaps, areas to work on for THIS idea
- ELABORATE_PROBLEM: Detailed implementation, roadmap, how to build THIS idea
- GENERAL: General market validation questions about THIS idea

INVALID INTENTS (Redirect user back to scope):
- OUT_OF_SCOPE: Questions about OTHER ideas, different domains, unrelated products, personal advice, general technology questions NOT about THIS specific idea
- OFF_TOPIC: Completely unrelated (weather, jokes, personal questions)

CRITICAL GUARDRAILS:
⚠️ If user asks about a DIFFERENT idea, product, or domain than "${idea.title}" → OUT_OF_SCOPE
⚠️ If user asks about general topics not related to validating "${idea.title}" → OUT_OF_SCOPE
⚠️ If user asks for help with coding, implementation of OTHER projects → OUT_OF_SCOPE
✅ ONLY classify as valid intent if the question is DIRECTLY about validating "${idea.title}"

Examples:
- "What are competitors for loan personalization?" [THIS idea is about loans] → COMPETITORS ✅
- "What about competitors in healthcare domain?" [THIS idea is NOT healthcare] → OUT_OF_SCOPE ❌
- "How do I build THIS idea?" → ELABORATE_PROBLEM ✅
- "How do I build a chatbot?" [Not THIS idea] → OUT_OF_SCOPE ❌

Respond with ONLY the intent name (e.g., "GAP_ANALYSIS" or "OUT_OF_SCOPE"). Nothing else.`
        };

        const userPrompt = `Idea: "${idea.title}"
Domain: ${idea.theme || idea.domain || 'Not specified'}

User message: "${message}"

${conversationHistory && conversationHistory.length > 0 ? `Previous context: User has been discussing market validation for this idea.` : ''}

Classify this query's intent:`;

        const result = await generateChatCompletion(
            [systemMessage, { role: 'user', content: userPrompt }],
            process.env.OLLAMA_REASONING_MODEL || 'qwen2.5:3b',
            {
                temperature: 0.1, // Low temperature for deterministic classification
                num_predict: 20   // Just need the intent name
            }
        );

        const response = (result.message?.content || result.response || '').trim().toUpperCase();

        // Map LLM response to our intent constants
        const intentMapping = {
            'PATENT_RISK': INTENTS.PATENT_RISK,
            'PATENT': INTENTS.PATENT_RISK,
            'IP_RISK': INTENTS.PATENT_RISK,
            'MARKET_TRENDS': INTENTS.MARKET_TRENDS,
            'MARKET_TREND': INTENTS.MARKET_TRENDS,
            'TRENDS': INTENTS.MARKET_TRENDS,
            'COMPETITORS': INTENTS.COMPETITORS,
            'COMPETITOR': INTENTS.COMPETITORS,
            'COMPETITION': INTENTS.COMPETITORS,
            'COMPETITOR_RISK': INTENTS.COMPETITOR_RISK,
            'SUMMARIZE': INTENTS.SUMMARIZE,
            'SUMMARY': INTENTS.SUMMARIZE,
            'GAP_ANALYSIS': INTENTS.GAP_ANALYSIS,
            'GAP': INTENTS.GAP_ANALYSIS,
            'GAPS': INTENTS.GAP_ANALYSIS,
            'ELABORATE_PROBLEM': INTENTS.ELABORATE_PROBLEM,
            'ELABORATE': INTENTS.ELABORATE_PROBLEM,
            'IMPLEMENTATION': INTENTS.ELABORATE_PROBLEM,
            'OUT_OF_SCOPE': INTENTS.OUT_OF_SCOPE,
            'SCOPE': INTENTS.OUT_OF_SCOPE,
            'OFF_TOPIC': INTENTS.OFF_TOPIC,
            'GENERAL': INTENTS.GENERAL
        };

        const detectedIntent = intentMapping[response] || INTENTS.GENERAL;
        console.log(`[MarketChat] LLM classified intent: "${response}" → ${detectedIntent}`);

        return detectedIntent;

    } catch (error) {
        console.error('[MarketChat] LLM intent classification failed:', error.message);
        // Fallback to keyword-based classification
        return null;
    }
}

/**
 * Classify user intent from message (with LLM fallback to keywords)
 * Now uses intelligent LLM-based classification for natural language understanding
 */
async function classifyIntent(message, idea, conversationHistory = []) {
    const lowerMessage = message.toLowerCase();
    const params = extractQueryParameters(message);

    // STEP 1: Try intelligent LLM-based classification first
    const llmIntent = await classifyIntentWithLLM(message, idea, conversationHistory);
    if (llmIntent) {
        console.log(`[MarketChat] Using LLM classification: ${llmIntent}`);
        return { intent: llmIntent, metadata: params };
    }

    // STEP 2: Fallback to keyword-based classification if LLM fails
    console.log(`[MarketChat] LLM classification unavailable, using keyword fallback`);

    // Check if this is a follow-up/reference query (should use conversation history, not new search)
    const isReferenceQuery = REFERENCE_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
    const hasConversationHistory = conversationHistory && conversationHistory.length > 0;

    if (isReferenceQuery && hasConversationHistory) {
        return { intent: INTENTS.GENERAL, metadata: { ...params, useHistoryOnly: true, isReferenceQuery: true } };
    }

    // Check if this is an analysis request (should use LLM, not raw search)
    const isAnalysisRequest = ANALYSIS_KEYWORDS.some(keyword => lowerMessage.includes(keyword));

    // If it's an analysis request, route to GENERAL for LLM processing
    if (isAnalysisRequest) {
        return { intent: INTENTS.GENERAL, metadata: { ...params, requiresAnalysis: true } };
    }

    // Check for off-topic first
    for (const keyword of INTENT_KEYWORDS[INTENTS.OFF_TOPIC]) {
        if (lowerMessage.includes(keyword) && lowerMessage.length < 50) {
            return { intent: INTENTS.OFF_TOPIC, metadata: params };
        }
    }

    // Check for competitor risk (specific competitor mentioned + risk keywords)
    const competitorRiskPattern = /(?:risk|threat|danger|challenge).*(?:from|by|of)\s+([A-Z][a-zA-Z]+)|([A-Z][a-zA-Z]+).*(?:risk|threat|danger|challenge)/i;
    const competitorMatch = message.match(competitorRiskPattern);
    if (competitorMatch) {
        const competitorName = competitorMatch[1] || competitorMatch[2];
        if (competitorName && competitorName.length > 2) {
            return { intent: INTENTS.COMPETITOR_RISK, metadata: { ...params, competitor: competitorName } };
        }
    }

    // Check for patent/IP risk
    for (const keyword of INTENT_KEYWORDS[INTENTS.PATENT_RISK]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.PATENT_RISK, metadata: params };
        }
    }

    // Check for market trends
    for (const keyword of INTENT_KEYWORDS[INTENTS.MARKET_TRENDS]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.MARKET_TRENDS, metadata: params };
        }
    }

    // Check for competitors (but not if it's an analysis request)
    for (const keyword of INTENT_KEYWORDS[INTENTS.COMPETITORS]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.COMPETITORS, metadata: params };
        }
    }

    // Check for summarize
    for (const keyword of INTENT_KEYWORDS[INTENTS.SUMMARIZE]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.SUMMARIZE, metadata: params };
        }
    }

    // Check for gap analysis (Use Case 3)
    for (const keyword of INTENT_KEYWORDS[INTENTS.GAP_ANALYSIS]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.GAP_ANALYSIS, metadata: params };
        }
    }

    // Check for problem elaboration (Use Case 4)
    for (const keyword of INTENT_KEYWORDS[INTENTS.ELABORATE_PROBLEM]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.ELABORATE_PROBLEM, metadata: params };
        }
    }

    // NEW: Heuristic for identifying completely unrelated queries
    const validationKeywords = ['market', 'patent', 'competitor', 'trend', 'customer', 'business', 'strategy', 'risk', 'opportunity', 'idea', 'product', 'service', 'validation', 'industry'];
    const hasValidationContext = validationKeywords.some(k => lowerMessage.includes(k));

    if (lowerMessage.length > 30 && !hasValidationContext && !isAnalysisRequest) {
        return { intent: INTENTS.UNSUPPORTED, metadata: params };
    }

    return { intent: INTENTS.GENERAL, metadata: params };
}

/**
 * Generate initial welcome message for market validation chat
 */
export async function generateInitialMessage(idea) {
    try {
        const welcomeMessage = `Hi! I'm your Market Validation Assistant for "${idea.title}". 

I can help you with:
• **Patent & IP Risks** - I'll search external sources to find potential patent conflicts
• **Market Trends** - Real-time market data and industry forecasts
• **Competitor Analysis** - Who's in this space and what they're doing
• **Idea Summary** - A clear overview based on your idea details

What would you like to know?`;

        return welcomeMessage;
    } catch (error) {
        console.error('[MarketValidatorChatService] Error generating initial message:', error);
        return `Hi! I'm your Market Validation Assistant. How can I help you understand the market for "${idea.title}"?`;
    }
}

/**
 * Handle unsupported or irrelevant queries
 */
function handleUnsupportedQuery(idea) {
    return `I'm here to focus specifically on the market validation and competitive landscape for "**${idea.title}**".

To stay on track, I can help you with things like:
• Analyzing **patent and IP risks**
• Evaluating **market trends** and industry signals
• Identifying **competitors** and their strategies
• Reviewing your **idea summary** and value proposition

Please ask a question related to these areas!`;
}

/**
 * Handle out-of-scope queries (questions about different ideas or domains)
 */
function handleOutOfScopeQuery(idea) {
    return `I'm your dedicated Market Validation Assistant for "**${idea.title}**" specifically.

🎯 **My Focus**: I can ONLY help you validate and analyze **this specific idea** in the **${idea.theme || idea.domain}** domain.

I noticed your question seems to be about a different topic or idea. Let's keep our conversation focused on validating "**${idea.title}**".

✅ **Questions I can help with:**
• **Patent & IP Risks** - For THIS idea specifically
• **Market Trends** - In the ${idea.theme || idea.domain} space
• **Competitor Analysis** - Who's building similar solutions to THIS idea
• **Gap Analysis** - What problem statements should THIS idea address?
• **Implementation** - How to build and launch THIS specific idea

❌ **Out of Scope:**
• Questions about other ideas or products
• Different domains or industries
• General technology questions unrelated to THIS idea

**Let's refocus**: What would you like to know about validating "**${idea.title}**" in the market?`;
}

/**
 * Format Tavily search results for display
 */
function formatTavilyResults(results, category) {
    if (!results || results.length === 0) {
        return `I searched for ${category} information but couldn't find specific results. This could indicate a niche market opportunity or limited public data availability.`;
    }

    let formatted = `Based on my search, here's what I found:\n\n`;

    results.slice(0, 5).forEach((result, index) => {
        formatted += `**${index + 1}. ${result.title}**\n`;
        formatted += `${result.content?.substring(0, 200)}...\n`;
        formatted += `🔗 [Source](${result.url})\n\n`;
    });

    return formatted;
}

/**
 * Handle patent risk queries using Tavily
 * Enhanced to use LLM for final response generation with proper citations
 */
async function handlePatentRiskQuery(idea, metadata, userMessage) {
    console.log('[MarketChat] Handling PATENT_RISK query via Tavily with params:', metadata);

    try {
        const patentResults = await searchPatents(idea);

        if (!patentResults || patentResults.length === 0) {
            // No patents found - use LLM to provide guidance
            return await generateEnhancedResponse(idea, userMessage || 'Are there any patent risks?', null, 'patents');
        }

        const limitedResults = metadata.limit
            ? patentResults.slice(0, metadata.limit)
            : patentResults;

        // Use LLM to generate enhanced response with citations
        return await generateEnhancedResponse(idea, userMessage || 'What are the patent risks?', limitedResults, 'patents');

    } catch (error) {
        console.error('[MarketChat] Patent search failed:', error.message);
        return `I encountered an issue searching for patent information. Please try again or conduct a manual search on Google Patents for "${idea.title}".`;
    }
}

/**
 * Handle market trends queries using Tavily
 * Enhanced to use LLM for final response generation with proper citations
 */
async function handleMarketTrendsQuery(idea, metadata, userMessage) {
    console.log('[MarketChat] Handling MARKET_TRENDS query via Tavily with params:', metadata);

    try {
        const trendResults = await searchMarketTrends(idea);

        if (!trendResults || trendResults.length === 0) {
            // No trends found - use LLM to provide guidance
            return await generateEnhancedResponse(idea, userMessage || 'What are the market trends?', null, 'market trends');
        }

        const limitedResults = metadata.limit
            ? trendResults.slice(0, metadata.limit)
            : trendResults.slice(0, 5);

        // Use LLM to generate enhanced response with citations
        return await generateEnhancedResponse(idea, userMessage || 'What are the market trends?', limitedResults, 'market trends');

    } catch (error) {
        console.error('[MarketChat] Market trends search failed:', error.message);
        return `I encountered an issue fetching market trends. Please try again or check industry reports manually.`;
    }
}

/**
 * Handle competitor queries using Tavily with query-specific filtering
 * Enhanced to use LLM for final response generation with proper citations
 */
async function handleCompetitorsQuery(idea, userMessage, metadata, conversationHistory) {
    console.log('[MarketChat] Handling COMPETITORS query via Tavily with params:', metadata);

    try {
        // Build enhanced search query based on user parameters
        let searchQuery = `companies building ${idea.title} competitors products`;

        if (metadata.constraints && metadata.constraints.length > 0) {
            searchQuery += ` ${metadata.constraints.join(' ')}`;
        }

        if (metadata.region) {
            searchQuery += ` in ${metadata.region}`;
        }

        if (metadata.timeframe) {
            searchQuery += ` ${metadata.timeframe}`;
        }

        // Perform search with enhanced query
        const competitorResults = await searchCompetitors(idea, searchQuery);

        if (!competitorResults || competitorResults.length === 0) {
            // No external data - use LLM with internal knowledge
            return await generateEnhancedResponse(idea, userMessage, null, 'competitors');
        }

        // Apply limit if specified
        const limitedResults = metadata.limit
            ? competitorResults.slice(0, metadata.limit)
            : competitorResults.slice(0, 5);

        // Use LLM to generate enhanced response with citations
        return await generateEnhancedResponse(idea, userMessage, limitedResults, 'competitors');

    } catch (error) {
        console.error('[MarketChat] Competitor search failed:', error.message);
        return `I encountered an issue searching for competitors. Please try again.`;
    }
}

/**
 * Handle specific competitor risk queries using Tavily
 */
async function handleCompetitorRiskQuery(idea, competitorName) {
    console.log(`[MarketChat] Handling COMPETITOR_RISK query for "${competitorName}" via Tavily`);

    try {
        // Custom Tavily search for specific competitor
        const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
        if (!TAVILY_API_KEY) {
            return `I need the Tavily API to search for information about ${competitorName}. Please ensure TAVILY_API_KEY is configured.`;
        }

        const query = `${competitorName} ${idea.title} competition strategy market`;

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: query,
                max_results: 5,
                search_depth: 'basic'
            })
        });

        if (!response.ok) {
            throw new Error(`Tavily API error: ${response.status}`);
        }

        const data = await response.json();
        const results = data.results || [];

        let formattedResponse = `## Risk Analysis: ${competitorName} vs "${idea.title}"\n\n`;

        if (results.length > 0) {
            formattedResponse += `Here's what I found about ${competitorName} in relation to your idea:\n\n`;
            formattedResponse += formatTavilyResults(results, `${competitorName} analysis`);
            formattedResponse += `\n⚔️ **Competitive Strategy**: Use this intelligence to position your idea uniquely against ${competitorName}.`;
        } else {
            formattedResponse += `I couldn't find specific information about ${competitorName}'s activities related to your idea.\n\n`;
            formattedResponse += `This could be a positive sign - they may not be active in this exact space.`;
        }

        return formattedResponse;
    } catch (error) {
        console.error(`[MarketChat] Competitor risk search failed:`, error.message);
        return `I encountered an issue researching ${competitorName}. Please try again.`;
    }
}

/**
 * Handle summarize queries using internal data only
 * Enhanced to use LLM for better formatting
 */
async function handleSummarizeQuery(idea, userMessage) {
    console.log('[MarketChat] Handling SUMMARIZE query with internal data only');

    try {
        // Use LLM to generate a nice summary from internal data
        // No external data needed
        return await generateEnhancedResponse(idea, userMessage || 'Summarize this idea', null, 'idea summary');
    } catch (error) {
        console.error('[MarketChat] Error generating summary:', error);

        // Fallback to simple summary
        const technologies = Array.isArray(idea.technologies)
            ? idea.technologies.join(', ')
            : idea.technologies || 'Not specified';

        return `**${idea.title}**

${idea.description || idea.summary || 'No description available'}

**Domain:** ${idea.theme || idea.domain || 'Not specified'}

**Technologies:** ${technologies}

**Key Value Proposition:**
This idea leverages ${idea.theme || 'innovative technology'} to deliver value in the ${idea.domain || 'target'} space.`;
    }
}

/**
 * Handle gap analysis queries (Use Case 3)
 * Identifies problem statements and opportunities not addressed by competitors
 */
async function handleGapAnalysisQuery(idea, userMessage, conversationHistory, metadata) {
    console.log('[MarketChat] Handling GAP_ANALYSIS query');

    try {
        // Extract competitors from conversation history
        let competitorContext = '';
        if (conversationHistory && conversationHistory.length > 0) {
            // Find the most recent competitor list
            for (let i = conversationHistory.length - 1; i >= 0; i--) {
                const msg = conversationHistory[i];
                if (msg.role === 'assistant' && msg.content.includes('competitor')) {
                    competitorContext = msg.content;
                    break;
                }
            }
        }

        const systemMessage = {
            role: 'system',
            content: `You are a Market Validation AI Specialist. You identify market gaps and unaddressed problem statements.

GUARDRAILS:
1. Analyze the competitive landscape from the conversation history
2. Identify specific problem statements, niches, or use cases that competitors are NOT addressing
3. For each gap, provide BOTH pros (why it's an opportunity) and cons (why it might be challenging)
4. Do NOT invent competitor capabilities - only use information from the conversation
5. Focus on actionable, specific opportunities`
        };

        const userPrompt = `Idea: ${idea.title}
Description: ${idea.description || idea.summary}
Domain: ${idea.theme || idea.domain}

${competitorContext ? `Competitive Landscape from previous analysis:\n${competitorContext}\n` : 'No competitor data available yet. Base your analysis on the idea domain and general market knowledge.'}

User's question: ${userMessage}

TASK: Identify 3-5 unique problem statements or market gaps that are either:
1. Not being addressed by the competitors mentioned above
2. Underserved areas in the ${idea.theme || idea.domain} space
3. Emerging opportunities due to new technologies or market shifts

For EACH problem statement, provide:
- **Problem Title** (concise, bold)
- Brief description (2-3 sentences)
- **Pros:** (2-3 bullet points on why this is an opportunity)
- **Cons:** (2-3 bullet points on potential challenges)

Format as a numbered list. Use markdown formatting.
End with **Strategic Recommendation:** on which problem statement to prioritize and why.

Generate your response now:`;

        const userMessageObj = { role: 'user', content: userPrompt };

        const result = await generateChatCompletion(
            [systemMessage, userMessageObj],
            process.env.OLLAMA_REASONING_MODEL || 'qwen2.5:3b',
            {
                temperature: 0.7,
                num_predict: 800 // More tokens for comprehensive analysis
            }
        );

        let response = result.message?.content || result.response || '';
        return beautifyResponse(response);

    } catch (error) {
        console.error('[MarketChat] Gap analysis failed:', error);
        return `I encountered an issue analyzing market gaps. Please try asking about specific areas you're interested in exploring.`;
    }
}

/**
 * Handle problem elaboration queries (Use Case 4)
 * Provides detailed implementation guide for a specific problem statement
 */
async function handleElaborateProblemQuery(idea, userMessage, conversationHistory, metadata) {
    console.log('[MarketChat] Handling ELABORATE_PROBLEM query');

    try {
        // Extract problem statement context from conversation history
        let problemContext = '';
        let problemTitle = '';

        // Try to find the problem statement being referenced
        if (conversationHistory && conversationHistory.length > 0) {
            for (let i = conversationHistory.length - 1; i >= 0; i--) {
                const msg = conversationHistory[i];
                if (msg.role === 'assistant' && (msg.content.includes('Problem') || msg.content.includes('**'))) {
                    problemContext = msg.content;

                    // Try to extract specific problem title from user message
                    const quotedText = userMessage.match(/["'](.+?)["']/) || userMessage.match(/\*\*(.+?)\*\*/);
                    if (quotedText) {
                        problemTitle = quotedText[1];
                    }
                    break;
                }
            }
        }

        const systemMessage = {
            role: 'system',
            content: `You are a Market Validation and Product Strategy AI. You create detailed implementation roadmaps.

GUARDRAILS:
1. Provide a comprehensive, step-by-step implementation guide
2. Include starting point, execution phases, and end state
3. Be specific and actionable - no generic advice
4. Ground recommendations in the idea's domain and technologies
5. Address technical, business, and go-to-market aspects`
        };

        const userPrompt = `Idea: ${idea.title}
Description: ${idea.description || idea.summary}
Domain: ${idea.theme || idea.domain}
Technologies: ${Array.isArray(idea.technologies) ? idea.technologies.join(', ') : idea.technologies}

${problemContext ? `Previous analysis:\n${problemContext.substring(0, 1000)}\n` : ''}

User's request: ${userMessage}
${problemTitle ? `\nSpecific problem statement to elaborate: "${problemTitle}"` : ''}

TASK: Provide a detailed implementation guide with the following structure:

## Problem Statement Overview
(2-3 sentences summarizing the opportunity)

## Starting Point: Prerequisites
- What capabilities/resources are needed to begin
- Required team skills
- Initial market research needed

## Implementation Roadmap

### Phase 1: Foundation (Months 1-3)
- Specific steps to take
- Key deliverables
- Success metrics

### Phase 2: Development (Months 4-6)
- Technical development tasks
- Customer validation approach
- Milestone checklist

### Phase 3: Launch & Scale (Months 7-12)
- Go-to-market strategy
- Key partnerships or integrations
- Scaling considerations

## End State: Success Criteria
- What "done" looks like
- Key performance indicators (KPIs)
- Long-term competitive positioning

## Critical Risks & Mitigation
- Top 3 risks
- Mitigation strategies for each

**Resource Estimate:** Rough estimate of team size and budget needed

Generate your comprehensive implementation guide now:`;

        const userMessageObj = { role: 'user', content: userPrompt };

        const result = await generateChatCompletion(
            [systemMessage, userMessageObj],
            process.env.OLLAMA_REASONING_MODEL || 'qwen2.5:3b',
            {
                temperature: 0.6,
                num_predict: 1000 // Extended output for detailed roadmap
            }
        );

        let response = result.message?.content || result.response || '';
        return beautifyResponse(response);

    } catch (error) {
        console.error('[MarketChat] Problem elaboration failed:', error);
        return `I encountered an issue creating the implementation guide. Please try rephrasing your request or specify which problem statement you'd like elaborated.`;
    }
}

/**
 * Handle off-topic queries
 */
function handleOffTopicQuery(idea) {
    return `I'm your Market Validation Assistant, focused on helping you validate "${idea.title}" in the market.

I can help you with:
• **"Are there any patent risks?"** - I'll search for IP conflicts
• **"What are the market trends?"** - Latest industry data
• **"Who are the competitors?"** - Competitive landscape analysis
• **"Summarize this idea"** - Overview based on your idea details
• **"What risks does [Company] pose?"** - Specific competitor analysis
• **"What gaps exist?"** - Identify unaddressed problems and opportunities
• **"Elaborate on [Problem]"** - Detailed implementation roadmap

What would you like to know about your idea's market potential?`;
}

/**
 * Generate AI response for user query - Main entry point
 */
export async function generateChatResponse(idea, userMessage, conversationHistory) {
    console.log(`[MarketChat] Processing query: "${userMessage}"`);

    // Step 1: Classify intent with LLM-based intelligent classification (pass idea for context)
    const { intent, metadata } = await classifyIntent(userMessage, idea, conversationHistory);
    console.log(`[MarketChat] Classified intent: ${intent}`, metadata);

    // Step 2: Route to appropriate handler with conversation context
    try {
        switch (intent) {
            case INTENTS.PATENT_RISK:
                return await handlePatentRiskQuery(idea, metadata, userMessage);

            case INTENTS.MARKET_TRENDS:
                return await handleMarketTrendsQuery(idea, metadata, userMessage);

            case INTENTS.COMPETITORS:
                return await handleCompetitorsQuery(idea, userMessage, metadata, conversationHistory);

            case INTENTS.COMPETITOR_RISK:
                return await handleCompetitorRiskQuery(idea, metadata.competitor);

            case INTENTS.SUMMARIZE:
                return await handleSummarizeQuery(idea, userMessage);

            case INTENTS.GAP_ANALYSIS:
                return await handleGapAnalysisQuery(idea, userMessage, conversationHistory, metadata);

            case INTENTS.ELABORATE_PROBLEM:
                return await handleElaborateProblemQuery(idea, userMessage, conversationHistory, metadata);

            case INTENTS.OUT_OF_SCOPE:
                return handleOutOfScopeQuery(idea);

            case INTENTS.OFF_TOPIC:
                return handleOffTopicQuery(idea);

            case INTENTS.UNSUPPORTED:
                return handleUnsupportedQuery(idea);

            case INTENTS.GENERAL:
            default:
                return await handleGeneralQuery(idea, userMessage, conversationHistory, metadata);
        }
    } catch (error) {
        console.error('[MarketChat] Error in intent handler:', error);
        return `I encountered an issue processing your request. Please try asking in a different way, or ask about patents, competitors, or market trends.`;
    }
}

/**
 * Handle general market validation queries using Qwen 2.5 (3B) with enhanced context awareness
 * Qwen 2.5 is much faster than llama3.1 while maintaining good quality
 */
async function handleGeneralQuery(idea, userMessage, conversationHistory, metadata) {
    console.log('[MarketChat] Handling GENERAL query via Qwen 2.5 (3B) - Fast model');

    try {
        // Build context from idea
        const ideaContext = `
Idea Title: ${idea.title}
Description: ${idea.description || idea.summary}
Domain: ${idea.theme || idea.domain}
Technologies: ${Array.isArray(idea.technologies) ? idea.technologies.join(', ') : idea.technologies}
`;

        // Extract data from previous responses if this is an analysis request
        let previousDataContext = '';
        if (metadata?.requiresAnalysis && conversationHistory && conversationHistory.length > 0) {
            console.log('[MarketChat] Analysis request detected - extracting previous data');

            // Look for the most recent assistant response with substantial data
            for (let i = conversationHistory.length - 1; i >= 0; i--) {
                const msg = conversationHistory[i];
                if (msg.role === 'assistant' && msg.content.length > 200) {
                    // Extract the full previous response for analysis
                    previousDataContext = `\n\nPrevious search results to analyze:\n${msg.content}\n`;
                    console.log('[MarketChat] Extracted previous data for analysis:', msg.content.substring(0, 200) + '...');
                    break;
                }
            }
        }

        // Build conversation context with adaptive detail level
        let conversationContext = '';
        if (conversationHistory && conversationHistory.length > 0) {
            const recentHistory = conversationHistory.slice(-6); // Last 6 messages for better context
            conversationContext = '\n\nRecent conversation:\n';
            recentHistory.forEach(msg => {
                if (msg.role === 'user') {
                    conversationContext += `User: ${msg.content}\n`;
                } else if (msg.role === 'assistant') {
                    // If this is a reference query, include FULL previous response, otherwise truncate
                    const includeFullResponse = metadata?.isReferenceQuery || metadata?.useHistoryOnly;
                    if (includeFullResponse) {
                        conversationContext += `Assistant: ${msg.content}\n`;
                    } else {
                        conversationContext += `Assistant: ${msg.content.substring(0, 200)}...\n`;
                    }
                }
            });
        }

        // Extract query parameters for better response tailoring
        const params = metadata || extractQueryParameters(userMessage);
        let paramContext = '';
        if (params.limit) {
            paramContext += `\nUser wants exactly ${params.limit} items in the response.`;
        }
        if (params.constraints && params.constraints.length > 0) {
            paramContext += `\nUser is specifically interested in: ${params.constraints.join(', ')}.`;
        }
        if (params.requiresAnalysis) {
            paramContext += `\nUser is requesting ANALYSIS/INSIGHTS, not raw data. Provide strategic analysis.`;
        }
        if (params.useHistoryOnly || params.isReferenceQuery) {
            paramContext += `\n\n🔒 CRITICAL: This is a FOLLOW-UP query referencing previous conversation data. You MUST answer ONLY using the information from the "Recent conversation" section above. Do NOT introduce new companies, competitors, or data points that were not mentioned in the previous assistant responses. If the previous data doesn't contain enough information to answer, say so explicitly.`;
        }

        // Create system message
        const systemMessage = {
            role: 'system',
            content: `You are a Market Validation AI Specialist. 
GUARDRAILS:
1. ONLY answer questions about market validation, competitors, trends, and the provided idea "${idea.title}".
2. Use the provided context to ground your answer. 
3. If the user's question is unrelated to business, market, or the idea, politely decline to answer.
4. Do NOT hallucinate specific figures, companies, or data points if they are not in the context.
5. You can provide general strategic advice if specific data is missing, but label it as such.`
        };

        // Create user message with full context
        const userPrompt = `${ideaContext}

${previousDataContext}

${conversationContext}

${paramContext}

User's question: ${userMessage}

CRITICAL RULES:
1. Provide a DIRECT, SPECIFIC answer - NEVER ask follow-up questions.
2. If the user asks for ANALYSIS (strengths, weaknesses, comparison, differentiation), provide STRATEGIC INSIGHTS based on the provided context.
3. If the user's query is irrelevant to market validation or the idea "${idea.title}", state that you are only programmed to assist with market validation for this specific project.
4. If data is provided in the conversation history or context, ANALYZE it. If no data is provided, speak generally about the industry/domain, but do NOT invent specific facts.
5. **CRITICAL**: If the user asks "with reference to above" or similar, you are ONLY allowed to use data from the "Recent conversation" section. Do NOT add new competitor names or data.
6. Maintain a professional, executive tone.
7. Keep response concise (under 500 words) and well-structured.
8. End with ONE actionable strategic recommendation.
9. If you lack specific data to answer a technical or factual question, honestly state: "Based on the previous conversation, I don't have specific details on [X]. I recommend conducting additional research on [X] to gather this information."
10. Do NOT make up names of people, companies, or URLs that were not in the previous conversation.

Provide your response now:`;

        const userMessageObj = {
            role: 'user',
            content: userPrompt
        };

        // Call Qwen 2.5 (3B) via Ollama - Much faster than llama3.1
        const result = await generateChatCompletion(
            [systemMessage, userMessageObj],
            process.env.OLLAMA_REASONING_MODEL || 'qwen2.5:3b',
            {
                temperature: 0.7,
                num_predict: 600 // Reduced for faster responses
            }
        );

        let text = result.message?.content || result.response || '';

        // Post-process to remove any questions that slipped through
        text = text.replace(/\?[^\n]*$/gm, ''); // Remove lines ending with questions
        text = text.replace(/Would you like.*?\?/gi, ''); // Remove "Would you like" questions
        text = text.replace(/Do you want.*?\?/gi, ''); // Remove "Do you want" questions
        text = text.replace(/Should I.*?\?/gi, ''); // Remove "Should I" questions

        return text.trim();
    } catch (error) {
        console.error('[MarketChat] Qwen error:', error);
        return generateFallbackResponse(userMessage, idea);
    }
}

/**
 * Generate fallback response when AI is unavailable
 */
function generateFallbackResponse(userMessage, idea) {
    const query = userMessage.toLowerCase();
    const domain = idea.theme || idea.domain || 'this';

    if (query.includes('opportunity') || query.includes('gap')) {
        return `Market opportunities for "${idea.title}" could include:

1. Underserved customer segments
2. Emerging technologies enabling new solutions
3. Changing regulations creating demand
4. Shifts in customer behavior or preferences
5. Geographic expansion possibilities

Based on ${domain}, consider what problems are customers struggling with and what new capabilities do emerging technologies provide.`;
    }

    // Generic response
    return `For market validation in the ${domain} space, key areas to investigate include:
• Market size and growth trends
• Competitive landscape
• Customer needs and pain points
• Regulatory environment
• Technology trends

Try asking specifically about patents, competitors, or market trends for more detailed analysis.`;
}

// Export functions for testing
export { extractQueryParameters, classifyIntent };
