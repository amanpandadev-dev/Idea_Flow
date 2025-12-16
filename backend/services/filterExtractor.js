/**
 * Filter Extractor Service
 * Extracts filter type, value, and action (REPLACE/ADD/REMOVE) from user message
 * Uses Llama for intelligent extraction
 */

import { generateStructuredJSON } from '../config/ollama.js';

/**
 * Known categories/themes from the database
 * These should be checked BEFORE sending to LLM to avoid misidentification
 */
const KNOWN_CATEGORIES = [
    'GenAI & its techniques',
    'Multi-modal UX',
    'Edge AI',
    'Agentic AI',
    'Responsible AI',
    'AI for accessibility',
    'AI for Organization',
    'AI for Industry',
    'AI for Data & Data for AI',
    'AI in service line',
    'Classical AI/ML/DL for prediction/recommendations',
    'Orchestration & MCP',
    'Proprietary models'
];

/**
 * Extract filter information from message with action semantics
 * @param {string} message - User message
 * @returns {Promise<Object>} {type, value, action: 'REPLACE'|'ADD'|'REMOVE'}
 */
export async function extractFilterInfo(message) {
    // PRE-CHECK: Match against known categories first
    const lowerMessage = message.toLowerCase();

    // Check for category/theme matches
    for (const category of KNOWN_CATEGORIES) {
        if (lowerMessage.includes(category.toLowerCase())) {
            console.log(`[Filter Extractor] Matched known category: "${category}"`);

            // Determine action based on keywords
            let action = 'ADD'; // default for categories
            if (lowerMessage.includes('only') || lowerMessage.includes('just')) {
                action = 'REPLACE';
            } else if (lowerMessage.includes('remove') || lowerMessage.includes('without')) {
                action = 'REMOVE';
            } else if (lowerMessage.includes('also') || lowerMessage.includes('and')) {
                action = 'ADD';
            }

            return {
                type: 'theme',
                value: category,
                action: action
            };
        }
    }

    // If no category match, proceed with LLM extraction
    const prompt = `Extract filter information from this user message and determine the action.

User message: "${message}"

Identify:
1. Filter type: technology|domain|year|businessGroup|theme
2. Filter value: the specific value(s) to filter by
3. Action: REPLACE|ADD|REMOVE based on these rules:

ACTION RULES:
================

YEAR FILTERS (default: REPLACE):
- "created at 2024" → REPLACE years with [2024]
- "created in 2025" → REPLACE years with [2025]
- "in 2024" → REPLACE years with [2024]
- "from 2024 and 2025" → REPLACE years with [2024, 2025]
- "also in 2023" → ADD 2023 to existing years
- "also 2023" → ADD
- "remove 2024" → REMOVE

TECHNOLOGY FILTERS (default: ADD):
- "using Java" → ADD Java
- "with Python" → ADD Python
- "using Java and Python" → ADD both
- "only Java" → REPLACE technologies with [Java]
- "only Python projects" → REPLACE with [Python]
- "remove Java" → REMOVE
- "without Java" → REMOVE

DOMAIN/THEME FILTERS (default: ADD):
- "healthcare projects" → ADD
- "only healthcare" → REPLACE
- "also finance" → ADD

Keywords:
- REPLACE: "only", "at", "in", "created in/at" (for years)
- ADD: "also", "and", "using", "with" (default for tech)
- REMOVE: "remove", "without", "clear"

Return ONLY valid JSON:
{
  "type": "year",
  "value": 2024,
  "action": "REPLACE"
}

For multiple values:
{
  "type": "year",
  "value": [2024, 2025],
  "action": "REPLACE"
}

If no filter detected:
{
  "type": null,
  "value": null,
  "action": null
}`;

    try {
        const result = await generateStructuredJSON(prompt, {
            model: 'llama3.1',
            temperature: 0.1
        });

        // Validate result
        if (result && result.type && result.value) {
            console.log(`[Filter Extractor] "${message}" → ${result.type}: ${JSON.stringify(result.value)} (${result.action})`);
            return result;
        }

        return { type: null, value: null, action: null };

    } catch (error) {
        console.error('[Filter Extractor] Error:', error.message);
        return { type: null, value: null, action: null };
    }
}

/**
 * Normalize filter type
 */
export function normalizeFilterType(type) {
    if (!type) return null;

    const normalized = type.toLowerCase();

    if (normalized.includes('tech')) return 'technologies';
    if (normalized.includes('domain')) return 'domains';
    if (normalized.includes('year')) return 'years';
    if (normalized.includes('business') || normalized.includes('group')) return 'businessGroups';
    if (normalized.includes('theme')) return 'themes';

    return type;
}

/**
 * Normalize filter value
 */
export function normalizeFilterValue(value, type) {
    if (!value) return null;

    // Handle arrays
    if (Array.isArray(value)) {
        return value.map(v => normalizeFilterValue(v, type));
    }

    // Convert year strings to numbers
    if (type === 'years' || type === 'year') {
        const yearNum = parseInt(value);
        return isNaN(yearNum) ? null : yearNum;
    }

    // Capitalize first letter for display
    if (typeof value === 'string') {
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }

    return value;
}

export default {
    extractFilterInfo,
    normalizeFilterType,
    normalizeFilterValue
};
