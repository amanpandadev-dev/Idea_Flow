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
    OFF_TOPIC: 'off_topic',
    GENERAL: 'general'
};

// Keywords for intent detection
const INTENT_KEYWORDS = {
    [INTENTS.PATENT_RISK]: ['patent', 'ip', 'intellectual property', 'patent risk', 'ip risk', 'infringement', 'prior art'],
    [INTENTS.MARKET_TRENDS]: ['market trend', 'market size', 'industry trend', 'growth rate', 'market forecast', 'market analysis', 'tam', 'sam', 'som'],
    [INTENTS.COMPETITORS]: ['competitor', 'competition', 'rival', 'alternative', 'similar product', 'market player'],
    [INTENTS.SUMMARIZE]: ['summarize', 'summary', 'overview', 'brief', 'recap', 'tldr', 'explain this idea', 'what is this idea'],
    [INTENTS.OFF_TOPIC]: ['weather', 'joke', 'hello', 'hi', 'bye', 'how are you', 'what time', 'who are you', 'your name']
};

// Analysis keywords that indicate user wants LLM analysis rather than raw search
const ANALYSIS_KEYWORDS = [
    'analyze', 'analysis', 'compare', 'comparison', 'evaluate', 'assessment',
    'strengths', 'weaknesses', 'pros', 'cons', 'advantages', 'disadvantages',
    'differentiate', 'differentiation', 'how does', 'what makes', 'why',
    'explain', 'breakdown', 'deep dive', 'insights', 'implications'
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
            content: 'You are a Market Validation AI Assistant. You provide well-formatted, professional responses about market validation. You cite sources when using external data. You use proper markdown formatting without artifacts like ***.'
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
1. Provide a comprehensive answer using the external data above
2. Cite sources using [Source 1], [Source 2] format after each point
3. Structure your response with clear headers and bullet points
4. Do NOT use *** (triple asterisks) - use ** for bold only
5. Include a strategic insight at the end
6. Format links as: [Source Name](URL)
7. Be specific and actionable

Generate your response:`;
        } else {
            prompt += `No external data available. Provide guidance based on general market validation principles for the ${idea.theme || idea.domain} domain.

Instructions:
1. Provide helpful, actionable advice
2. Structure with clear headers and bullet points
3. Do NOT use *** (triple asterisks) - use ** for bold only
4. Be specific to the domain
5. Include a strategic recommendation

Generate your response:`;
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
 * Classify user intent from message with enhanced parameter extraction
 */
function classifyIntent(message) {
    const lowerMessage = message.toLowerCase();
    const params = extractQueryParameters(message);

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
 */
function handleSummarizeQuery(idea) {
    console.log('[MarketChat] Handling SUMMARIZE query with internal data only');

    const technologies = Array.isArray(idea.technologies)
        ? idea.technologies.join(', ')
        : idea.technologies || 'Not specified';

    return `## Summary: "${idea.title}"

**Description:**
${idea.description || idea.summary || 'No description available'}

**Domain:** ${idea.theme || idea.domain || 'Not specified'}

**Technologies:** ${technologies}

**Key Value Proposition:**
This idea aims to leverage ${idea.theme || 'innovative technology'} to deliver value in the ${idea.domain || 'target'} space.

---
*This summary is based entirely on the idea's internal data. Would you like me to search for external market insights?*`;
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

What would you like to know about your idea's market potential?`;
}

/**
 * Generate AI response for user query - Main entry point
 */
export async function generateChatResponse(idea, userMessage, conversationHistory) {
    console.log(`[MarketChat] Processing query: "${userMessage}"`);

    // Step 1: Classify intent with parameter extraction
    const { intent, metadata } = classifyIntent(userMessage);
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
                return handleSummarizeQuery(idea);

            case INTENTS.OFF_TOPIC:
                return handleOffTopicQuery(idea);

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

        // Build conversation context with more detail
        let conversationContext = '';
        if (conversationHistory && conversationHistory.length > 0) {
            const recentHistory = conversationHistory.slice(-6); // Last 6 messages for better context
            conversationContext = '\n\nRecent conversation:\n';
            recentHistory.forEach(msg => {
                if (msg.role === 'user') {
                    conversationContext += `User: ${msg.content}\n`;
                } else if (msg.role === 'assistant') {
                    // Include summary of previous response
                    conversationContext += `Assistant: ${msg.content.substring(0, 200)}...\n`;
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

        // Create system message
        const systemMessage = {
            role: 'system',
            content: 'You are a Market Validation AI Assistant. You provide DIRECT, SPECIFIC ANSWERS about market validation topics. You analyze data, provide strategic insights, and help users understand competitive landscapes, market opportunities, and differentiation strategies.'
        };

        // Create user message with full context
        const userPrompt = `${ideaContext}

${previousDataContext}

${conversationContext}

${paramContext}

User's question: ${userMessage}

CRITICAL RULES:
1. Provide a DIRECT, SPECIFIC answer - NEVER ask follow-up questions
2. If the user asks for ANALYSIS (strengths, weaknesses, comparison, differentiation), provide DEEP STRATEGIC INSIGHTS
3. If previous search results are provided, ANALYZE them thoroughly - don't just repeat them
4. When analyzing competitors: identify their strengths, weaknesses, market positioning, and differentiation opportunities
5. If the user asks for a specific number of items (e.g., "top 2", "3 competitors"), provide EXACTLY that many
6. If this is a follow-up question refining a previous query, acknowledge the refinement and provide NEW information
7. Focus on market validation: trends, opportunities, risks, competitors, and strategic insights
8. If you don't have specific data, provide actionable general guidance based on the domain
9. Keep response concise (under 500 words for analysis, 400 for general) and well-structured
10. Use markdown formatting with headers, bullet points, and bold text
11. End with ONE actionable insight or recommendation
12. NEVER say "I don't have enough information" - always provide value based on what you know
13. If the user is asking for fewer/more details than before, adjust accordingly

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
