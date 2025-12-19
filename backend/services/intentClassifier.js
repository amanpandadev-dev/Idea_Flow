/**
 * Intent Classifier Service
 * Uses rule-based classification with LLM fallback
 * Rule-based is fast and deterministic, LLM for ambiguous cases only
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
 * Classify user intent using rule-based overrides + Llama fallback
 * Rule-based is fast and deterministic, LLM is for ambiguous cases only
 * 
 * @param {string} message - User's message
 * @param {Object} context - Conversation context with baseQuery and semanticResults
 * @returns {Promise<string>} Intent category
 */
export async function classifyIntent(message, context = {}) {
    const queryLower = message.toLowerCase().trim();

    // RULE 1: No base query = NEW SEARCH (SEMANTIC_SEARCH)
    if (!context.baseQuery || !context.semanticResults || context.semanticResults.length === 0) {
        console.log(`[Intent Classifier] No base query → SEMANTIC_SEARCH`);
        return INTENTS.SEMANTIC_SEARCH;
    }

    // RULE 2: Reset keywords = RESET_FILTERS
    const resetKeywords = ['reset', 'clear all', 'start over', 'remove all'];
    if (resetKeywords.some(kw => queryLower.includes(kw))) {
        console.log(`[Intent Classifier] Reset keyword detected → RESET_FILTERS`);
        return INTENTS.RESET_FILTERS;
    }

    // RULE 3: Filter keywords + existing context = APPLY_FILTER
    const filterKeywords = ['filter', 'only', 'from', 'year', 'domain', 'group', 'in', 'exclude', 'just', 'by'];
    if (filterKeywords.some(kw => queryLower.includes(kw))) {
        console.log(`[Intent Classifier] Filter keyword detected → APPLY_FILTER`);
        return INTENTS.APPLY_FILTER;
    }

    // RULE 4: Remove filter keywords = REMOVE_FILTER
    const removeKeywords = ['remove', 'clear', 'without', 'not'];
    if (removeKeywords.some(kw => queryLower.includes(kw)) &&
        (queryLower.includes('filter') || queryLower.includes('domain') || queryLower.includes('year'))) {
        console.log(`[Intent Classifier] Remove filter detected → REMOVE_FILTER`);
        return INTENTS.REMOVE_FILTER;
    }

    // RULE 5: Refinement keywords = REFINE_SEARCH
    const refineKeywords = ['similar', 'like', 'related', 'narrow', 'focus on', 'more specific', 'also'];
    if (refineKeywords.some(kw => queryLower.includes(kw))) {
        console.log(`[Intent Classifier] Refinement keyword detected → REFINE_SEARCH`);
        return INTENTS.REFINE_SEARCH;
    }

    // RULE 6: Question keywords = ASK_QUESTION
    const questionKeywords = ['how many', 'what', 'which', 'show me top', 'best', 'worst', 'count'];
    if (questionKeywords.some(kw => queryLower.includes(kw)) || queryLower.endsWith('?')) {
        console.log(`[Intent Classifier] Question detected → ASK_QUESTION`);
        return INTENTS.ASK_QUESTION;
    }

    // RULE 7: Greeting/chat keywords = FREE_FORM_CHAT
    const chatKeywords = ['hello', 'hi', 'thanks', 'thank you', 'bye', 'help', 'what can you'];
    if (chatKeywords.some(kw => queryLower.includes(kw))) {
        console.log(`[Intent Classifier] Chat detected → FREE_FORM_CHAT`);
        return INTENTS.FREE_FORM_CHAT;
    }

    // FALLBACK: LLM classification for ambiguous cases
    console.log(`[Intent Classifier] No rule match, using LLM...`);
    const prompt = buildIntentPrompt(message, []);

    try {
        const response = await generateText(prompt, {
            model: 'llama3.1',
            temperature: 0.1,
            maxOutputTokens: 20
        });

        const intent = parseIntent(response);
        console.log(`[Intent Classifier] LLM: \"${message}\" → ${intent}`);

        return intent;

    } catch (error) {
        console.error('[Intent Classifier] LLM Error:', error.message);
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
