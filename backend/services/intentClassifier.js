/**
 * Intent Classifier Service
 * Uses Llama to classify user intent into 7 categories
 * Replaces all rule-based NLP classification
 */

import { generateText } from '../config/ollama.js';

// Intent categories
export const INTENTS = {
    SEMANTIC_SEARCH: 'semantic_search',
    APPLY_FILTER: 'apply_filter',
    REMOVE_FILTER: 'remove_filter',
    REFINE_SEARCH: 'refine_search',
    RESET_FILTERS: 'reset_filters',
    ASK_QUESTION: 'ask_question',
    FREE_FORM_CHAT: 'free_form_chat'
};

/**
 * Classify user intent using Llama
 */
export async function classifyIntent(message, conversationHistory = []) {
    const prompt = buildIntentPrompt(message, conversationHistory);

    try {
        const response = await generateText(prompt, {
            model: 'llama3.1',
            temperature: 0.1,  // Low temperature for consistent classification
            maxOutputTokens: 20
        });

        const intent = parseIntent(response);
        console.log(`[Intent Classifier] "${message}" → ${intent}`);

        return intent;

    } catch (error) {
        console.error('[Intent Classifier] Error:', error.message);
        // Default to semantic search on error
        return INTENTS.SEMANTIC_SEARCH;
    }
}

/**
 * Build intent classification prompt
 */
function buildIntentPrompt(message, conversationHistory) {
    const historyContext = conversationHistory.length > 0
        ? `Previous intents: ${conversationHistory.slice(-3).map(h => h.intent).join(', ')}`
        : '';

    return `You are an intent classifier for a conversational search system.

Classify this user message into EXACTLY ONE of these categories:

1. semantic_search - User wants to search for ideas by meaning/topic
   Examples: "find AI projects", "show banking ideas", "healthcare innovations"

2. apply_filter - User wants to filter results by metadata
   Examples: "filter by Python", "only 2024 ideas", "show BFSI projects"

3. remove_filter - User wants to remove a specific filter
   Examples: "remove Python filter", "clear year filter", "don't filter by domain"

4. refine_search - User adds details to current search
   Examples: "also include React", "narrow to machine learning", "more specific to chatbots"

5. reset_filters - User wants to clear all filters and start fresh
   Examples: "clear all filters", "reset", "start over", "remove all filters"

6. ask_question - User asks a question about the results
   Examples: "how many results?", "what's the best idea?", "show me top 5"

7. free_form_chat - General conversation, greetings, thanks
   Examples: "hello", "thanks", "what can you do?", "bye"

${historyContext}

User message: "${message}"

Return ONLY the category name, nothing else.`;
}

/**
 * Parse and validate intent from Llama response
 */
function parseIntent(response) {
    const cleaned = response.trim().toLowerCase();

    // Match against known intents
    if (cleaned.includes('semantic_search') || cleaned.includes('semantic search')) {
        return INTENTS.SEMANTIC_SEARCH;
    }
    if (cleaned.includes('apply_filter') || cleaned.includes('apply filter')) {
        return INTENTS.APPLY_FILTER;
    }
    if (cleaned.includes('remove_filter') || cleaned.includes('remove filter')) {
        return INTENTS.REMOVE_FILTER;
    }
    if (cleaned.includes('refine_search') || cleaned.includes('refine search')) {
        return INTENTS.REFINE_SEARCH;
    }
    if (cleaned.includes('reset_filters') || cleaned.includes('reset filter')) {
        return INTENTS.RESET_FILTERS;
    }
    if (cleaned.includes('ask_question') || cleaned.includes('ask question')) {
        return INTENTS.ASK_QUESTION;
    }
    if (cleaned.includes('free_form_chat') || cleaned.includes('free form')) {
        return INTENTS.FREE_FORM_CHAT;
    }

    // Default to semantic search
    console.warn(`[Intent Classifier] Unknown response: "${response}", defaulting to semantic_search`);
    return INTENTS.SEMANTIC_SEARCH;
}

export default {
    classifyIntent,
    INTENTS
};
