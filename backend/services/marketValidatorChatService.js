// Market Validator Chat Service
// Provides conversational AI support for market validation inquiries
// Enhanced with intelligent query routing and external/internal resource selection

import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchPatents, searchMarketTrends, searchCompetitors } from './tavilySearchService.js';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

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

/**
 * Classify user intent from message
 */
function classifyIntent(message) {
    const lowerMessage = message.toLowerCase();

    // Check for off-topic first
    for (const keyword of INTENT_KEYWORDS[INTENTS.OFF_TOPIC]) {
        if (lowerMessage.includes(keyword) && lowerMessage.length < 50) {
            return { intent: INTENTS.OFF_TOPIC, metadata: {} };
        }
    }

    // Check for competitor risk (specific competitor mentioned + risk keywords)
    const competitorRiskPattern = /(?:risk|threat|danger|challenge).*(?:from|by|of)\s+([A-Z][a-zA-Z]+)|([A-Z][a-zA-Z]+).*(?:risk|threat|danger|challenge)/i;
    const competitorMatch = message.match(competitorRiskPattern);
    if (competitorMatch) {
        const competitorName = competitorMatch[1] || competitorMatch[2];
        if (competitorName && competitorName.length > 2) {
            return { intent: INTENTS.COMPETITOR_RISK, metadata: { competitor: competitorName } };
        }
    }

    // Check for patent/IP risk
    for (const keyword of INTENT_KEYWORDS[INTENTS.PATENT_RISK]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.PATENT_RISK, metadata: {} };
        }
    }

    // Check for market trends
    for (const keyword of INTENT_KEYWORDS[INTENTS.MARKET_TRENDS]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.MARKET_TRENDS, metadata: {} };
        }
    }

    // Check for competitors
    for (const keyword of INTENT_KEYWORDS[INTENTS.COMPETITORS]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.COMPETITORS, metadata: {} };
        }
    }

    // Check for summarize
    for (const keyword of INTENT_KEYWORDS[INTENTS.SUMMARIZE]) {
        if (lowerMessage.includes(keyword)) {
            return { intent: INTENTS.SUMMARIZE, metadata: {} };
        }
    }

    return { intent: INTENTS.GENERAL, metadata: {} };
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
 */
async function handlePatentRiskQuery(idea) {
    console.log('[MarketChat] Handling PATENT_RISK query via Tavily');

    try {
        const patentResults = await searchPatents(idea);

        let response = `## Patent & IP Risk Analysis for "${idea.title}"\n\n`;

        if (patentResults && patentResults.length > 0) {
            response += `I found **${patentResults.length} potential patent-related results** that may be relevant:\n\n`;
            response += formatTavilyResults(patentResults, 'patents');
            response += `\n⚠️ **Disclaimer**: This is a preliminary search. For comprehensive IP analysis, consult with a qualified patent attorney.`;
        } else {
            response += `Good news! My search didn't find obvious patent conflicts for "${idea.title}". However, this doesn't guarantee freedom-to-operate.\n\n`;
            response += `**Recommended next steps:**\n`;
            response += `1. Conduct a formal patent search on Google Patents or USPTO\n`;
            response += `2. Consider a professional IP clearance study\n`;
            response += `3. Consult with an IP attorney for thorough analysis`;
        }

        return response;
    } catch (error) {
        console.error('[MarketChat] Patent search failed:', error.message);
        return `I encountered an issue searching for patent information. Please try again or conduct a manual search on Google Patents for "${idea.title}".`;
    }
}

/**
 * Handle market trends queries using Tavily
 */
async function handleMarketTrendsQuery(idea) {
    console.log('[MarketChat] Handling MARKET_TRENDS query via Tavily');

    try {
        const trendResults = await searchMarketTrends(idea);

        let response = `## Market Trends Analysis for "${idea.title}"\n\n`;

        if (trendResults && trendResults.length > 0) {
            response += `Here are the latest market insights:\n\n`;
            response += formatTavilyResults(trendResults, 'market trends');
            response += `\n📊 **Key Takeaway**: The ${idea.theme || idea.domain || 'technology'} sector shows active development. Consider how your idea differentiates within these trends.`;
        } else {
            response += `I couldn't find specific market trend data for "${idea.title}". This might indicate:\n\n`;
            response += `• An emerging/nascent market (first-mover opportunity)\n`;
            response += `• A niche segment with limited public research\n`;
            response += `• Need for more specific search terms\n\n`;
            response += `**Suggestion**: Try asking about specific aspects like "AI market trends" or "healthcare technology growth".`;
        }

        return response;
    } catch (error) {
        console.error('[MarketChat] Market trends search failed:', error.message);
        return `I encountered an issue fetching market trends. Please try again or check industry reports manually.`;
    }
}

/**
 * Handle competitor queries using Tavily
 */
async function handleCompetitorsQuery(idea) {
    console.log('[MarketChat] Handling COMPETITORS query via Tavily');

    try {
        const competitorResults = await searchCompetitors(idea);

        let response = `## Competitive Landscape for "${idea.title}"\n\n`;

        if (competitorResults && competitorResults.length > 0) {
            response += `I found information about companies in this space:\n\n`;
            response += formatTavilyResults(competitorResults, 'competitors');
            response += `\n🎯 **Strategic Insight**: Analyze these competitors' strengths and weaknesses to identify your differentiation opportunities.`;
        } else {
            response += `I couldn't find direct competitors for "${idea.title}". This could mean:\n\n`;
            response += `• You're in a blue ocean market (great opportunity!)\n`;
            response += `• Competitors use different terminology\n`;
            response += `• The problem is being solved differently\n\n`;
            response += `**Suggestion**: Search for companies solving the same underlying problem, even if their approach differs.`;
        }

        return response;
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

    // Step 1: Classify intent
    const { intent, metadata } = classifyIntent(userMessage);
    console.log(`[MarketChat] Classified intent: ${intent}`, metadata);

    // Step 2: Route to appropriate handler
    try {
        switch (intent) {
            case INTENTS.PATENT_RISK:
                return await handlePatentRiskQuery(idea);

            case INTENTS.MARKET_TRENDS:
                return await handleMarketTrendsQuery(idea);

            case INTENTS.COMPETITORS:
                return await handleCompetitorsQuery(idea);

            case INTENTS.COMPETITOR_RISK:
                return await handleCompetitorRiskQuery(idea, metadata.competitor);

            case INTENTS.SUMMARIZE:
                return handleSummarizeQuery(idea);

            case INTENTS.OFF_TOPIC:
                return handleOffTopicQuery(idea);

            case INTENTS.GENERAL:
            default:
                return await handleGeneralQuery(idea, userMessage, conversationHistory);
        }
    } catch (error) {
        console.error('[MarketChat] Error in intent handler:', error);
        return `I encountered an issue processing your request. Please try asking in a different way, or ask about patents, competitors, or market trends.`;
    }
}

/**
 * Handle general market validation queries using Gemini
 */
async function handleGeneralQuery(idea, userMessage, conversationHistory) {
    console.log('[MarketChat] Handling GENERAL query via Gemini');

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        // Build context from idea
        const ideaContext = `
Idea Title: ${idea.title}
Description: ${idea.description || idea.summary}
Domain: ${idea.theme || idea.domain}
Technologies: ${Array.isArray(idea.technologies) ? idea.technologies.join(', ') : idea.technologies}
`;

        // Build conversation context (limited)
        let conversationContext = '';
        if (conversationHistory && conversationHistory.length > 0) {
            const recentHistory = conversationHistory.slice(-4); // Last 4 messages only
            conversationContext = '\n\nRecent conversation:\n';
            recentHistory.forEach(msg => {
                if (msg.role === 'user') {
                    conversationContext += `User: ${msg.content}\n`;
                } else if (msg.role === 'assistant') {
                    conversationContext += `Assistant: ${msg.content.substring(0, 200)}...\n`;
                }
            });
        }

        // Create focused prompt that avoids asking questions
        const prompt = `You are a Market Validation AI Assistant. You provide DIRECT ANSWERS about market validation topics.

${ideaContext}

${conversationContext}

User's question: ${userMessage}

IMPORTANT RULES:
1. Provide a direct, helpful answer - DO NOT ask follow-up questions
2. Focus on market validation: trends, opportunities, risks, and strategic insights
3. If you don't have specific data, give general industry guidance
4. Keep response concise (under 300 words)
5. Use markdown formatting for readability

Response:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return text;
    } catch (error) {
        console.error('[MarketChat] Gemini error:', error);
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
