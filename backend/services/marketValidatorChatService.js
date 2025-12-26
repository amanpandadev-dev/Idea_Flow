// Market Validator Chat Service
// Provides conversational AI support for market validation inquiries

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

/**
 * Generate initial welcome message for market validation chat
 */
export async function generateInitialMessage(idea) {
    try {
        const welcomeMessage = `Hi! I'm your Market Validation Assistant for "${idea.title}". 

I can help you with:
• Market trends and size analysis
• Competitive landscape insights
• Patent and IP risk assessment
• Market opportunities and gaps
• Strategic recommendations

What would you like to know about the market for this idea?`;

        return welcomeMessage;
    } catch (error) {
        console.error('[MarketValidatorChatService] Error generating initial message:', error);
        return `Hi! I'm your Market Validation Assistant. How can I help you understand the market for "${idea.title}"?`;
    }
}

/**
 * Generate AI response for user query
 */
export async function generateChatResponse(idea, userMessage, conversationHistory) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        // Build context from idea
        const ideaContext = `
Idea Title: ${idea.title}
Description: ${idea.description}
Domain: ${idea.theme || idea.domain}
Technologies: ${Array.isArray(idea.technologies) ? idea.technologies.join(', ') : idea.technologies}
`;

        // Build conversation context
        let conversationContext = '';
        if (conversationHistory && conversationHistory.length > 0) {
            conversationContext = '\n\nPrevious conversation:\n';
            conversationHistory.forEach(msg => {
                if (msg.role === 'user') {
                    conversationContext += `User: ${msg.content}\n`;
                } else if (msg.role === 'assistant') {
                    conversationContext += `Assistant: ${msg.content}\n`;
                }
            });
        }

        // Create prompt for Gemini
        const prompt = `You are a Market Validation AI Assistant helping analyze business ideas. You provide insights on market trends, competitors, opportunities, and risks.

${ideaContext}

${conversationContext}

User's current question: ${userMessage}

Provide a helpful, informative response focusing on market validation aspects. Be specific and data-driven when possible. If you don't have specific data, acknowledge it and provide general market insights.

Response:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return text;
    } catch (error) {
        console.error('[MarketValidatorChatService] Error generating chat response:', error);

        // Fallback response
        return generateFallbackResponse(userMessage, idea);
    }
}

/**
 * Generate fallback response when AI is unavailable
 */
function generateFallbackResponse(userMessage, idea) {
    const query = userMessage.toLowerCase();
    const domain = idea.theme || idea.domain || 'this';

    if (query.includes('competitor') || query.includes('competition')) {
        return `To analyze competitors for "${idea.title}" in the ${domain} domain, I'd recommend:

1. Research companies in similar spaces using Google, Product Hunt, and industry databases
2. Analyze their features, pricing, and market positioning
3. Look for differentiation opportunities
4. Monitor their growth and funding if publicly available

Would you like me to help you think through specific competitive advantages?`;
    }

    if (query.includes('market size') || query.includes('market trend')) {
        return `Market analysis for ${domain} typically involves:

1. Total Addressable Market (TAM) estimation
2. Industry growth rates and forecasts
3. Key market drivers and trends
4. Regulatory and technological changes

For ${idea.title}, consider researching:
• Industry reports from Gartner, Forrester, or similar
• Market research databases
• Industry associations and publications
• Government statistics and economic data

What specific aspect of the market would you like to explore?`;
    }

    if (query.includes('patent') || query.includes('ip') || query.includes('intellectual property')) {
        return `For IP and patent considerations regarding "${idea.title}":

1. Conduct a preliminary patent search on USPTO or Google Patents
2. Look for similar solutions in your technology space
3. Consider if your approach is novel or combines existing methods differently
4. Consult with an IP attorney for thorough analysis

⚠️ Note: This is general guidance, not legal advice. Always consult with qualified IP counsel.

Would you like guidance on patent search strategies?`;
    }

    if (query.includes('opportunity') || query.includes('gap')) {
        return `Market opportunities for "${idea.title}" could include:

1. Underserved customer segments
2. Emerging technologies enabling new solutions
3. Changing regulations creating demand
4. Shifts in customer behavior or preferences
5. Geographic expansion possibilities

Based on ${domain}, consider:
• What problems are customers struggling with?
• What new capabilities do emerging technologies provide?
• How is the competitive landscape evolving?

Which opportunity area interests you most?`;
    }

    // Generic response
    return `That's a great question about "${idea.title}". 

For market validation in the ${domain} space, key areas to investigate include:
• Market size and growth trends
• Competitive landscape
• Customer needs and pain points
• Regulatory environment
• Technology trends
• Potential partnerships

Could you be more specific about what aspect you'd like to explore? For example:
- Who are the main competitors?
- What's the market size?
- Are there patent risks?
- What opportunities exist?`;
}
