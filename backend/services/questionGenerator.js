import { generateStructuredJSON } from '../config/ollama.js';

/**
 * Generate questions using Llama (Ollama) with structured JSON
 * @param {string[]} themes - Array of document themes
 * @param {string} fullText - Optional full document text for context
 * @returns {Promise<string[]>} Array of 5-8 generated questions
 */
export async function generateQuestionsWithLlama(themes, fullText = '') {
    try {
        const themesText = themes.join(', ');
        const prompt = `Based on a document with themes: ${themesText}

Generate 5-8 insightful questions that would help users explore this document's content.
Questions should be:
- Specific to the themes
- Open-ended and exploratory
- Relevant for innovation/business context
- Actionable and thought-provoking

Return a JSON object with a "questions" array containing the questions as strings.`;

        const data = await generateStructuredJSON(prompt, {
            temperature: 0.7,
            maxOutputTokens: 500
        });

        // Extract questions from response
        const questions = data.questions || [];

        // Validate questions
        if (!Array.isArray(questions)) {
            throw new Error('Response is not an array');
        }

        // Filter and validate questions
        const validQuestions = questions
            .filter(q => typeof q === 'string' && q.trim().length > 10 && q.trim().endsWith('?'))
            .slice(0, 8);

        // Ensure we have at least 5 questions
        if (validQuestions.length < 5) {
            console.warn('[QuestionGenerator] Generated fewer than 5 questions, using fallback');
            return getDefaultQuestions(themesText);
        }

        console.log(`[QuestionGenerator] Generated ${validQuestions.length} questions with Llama`);
        return validQuestions;

    } catch (error) {
        console.error('[QuestionGenerator] Error generating questions with Llama:', error.message);
        return getDefaultQuestions(themes.join(', '));
    }
}

/**
 * Generate contextual questions from uploaded document
 * @param {Object} contextStats - Document context statistics with themes
 * @param {string} provider - Provider argument (ignored, always uses Llama)
 * @returns {Promise<string[]>} Array of generated questions
 */
export async function generateQuestionsFromContext(contextStats, provider) {
    if (!contextStats || !contextStats.themes || contextStats.themes.length === 0) {
        console.log('[QuestionGenerator] No themes available, returning default questions');
        return [
            'What are the main topics covered in this document?',
            'How can these concepts be applied to our business?',
            'What innovations are mentioned in this content?'
        ];
    }

    const themes = contextStats.themes;

    try {
        console.log('[QuestionGenerator] Generating questions using Llama...');
        return await generateQuestionsWithLlama(themes);
    } catch (error) {
        console.error('[QuestionGenerator] Error generating questions:', error.message);
        return getDefaultQuestions(Array.isArray(themes) ? themes.join(', ') : themes);
    }
}

/**
 * Generate default questions based on themes
 * @param {string} themes - Comma-separated themes
 * @returns {string[]} Array of default questions
 */
function getDefaultQuestions(themes) {
    return [
        `What are the key insights about ${themes}?`,
        `How can we apply ${themes} to our innovation strategy?`,
        `What are the latest trends in ${themes}?`,
        `What challenges and opportunities exist in ${themes}?`,
        `How does ${themes} impact our business model?`
    ];
}
