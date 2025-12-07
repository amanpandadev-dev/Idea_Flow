import { GoogleGenerativeAI } from '@google/generative-ai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const API_KEY = process.env.API_KEY;

/**
 * Generate questions using Gemini 1.5 Flash
 * @param {string[]} themes - Array of document themes
 * @param {string} fullText - Optional full document text for context
 * @returns {Promise<string[]>} Array of 5-8 generated questions
 */
export async function generateQuestionsWithGemini(themes, fullText = '') {
    if (!API_KEY || API_KEY === 'your-google-genai-api-key-here') {
        console.warn('[QuestionGenerator] Gemini API key not configured, using fallback');
        return getDefaultQuestions(themes.join(', '));
    }

    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const themesText = themes.join(', ');
        const prompt = `Based on a document with themes: ${themesText}

Generate 5-8 insightful questions that would help users explore this document's content.
Questions should be:
- Specific to the themes
- Open-ended and exploratory
- Relevant for innovation/business context
- Actionable and thought-provoking

Return as JSON array of strings.`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: 'application/json',
                maxOutputTokens: 500,
                temperature: 0.7
            }
        });

        const responseText = result.response.text();
        const questions = JSON.parse(responseText);

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

        console.log(`[QuestionGenerator] Generated ${validQuestions.length} questions with Gemini`);
        return validQuestions;

    } catch (error) {
        console.error('[QuestionGenerator] Error generating questions with Gemini:', error.message);
        return getDefaultQuestions(themes.join(', '));
    }
}

/**
 * Generate contextual questions from uploaded document
 * @param {Object} contextStats - Document context statistics with themes
 * @param {string} provider - Embedding provider ('gemini', 'grok' or 'llama')
 * @returns {Promise<string[]>} Array of generated questions
 */
export async function generateQuestionsFromContext(contextStats, provider = 'gemini') {
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
        // Try Gemini first if provider is 'gemini' or if API key is available
        if (provider === 'gemini' || (API_KEY && API_KEY !== 'your-google-genai-api-key-here')) {
            console.log('[QuestionGenerator] Generating questions using Gemini...');
            return await generateQuestionsWithGemini(themes);
        } else if (provider === 'grok' && OPENROUTER_API_KEY) {
            console.log('[QuestionGenerator] Generating questions using Grok...');
            const themesText = themes.join(', ');
            const prompt = `Based on a document with the following themes: ${themesText}

Generate 5-8 insightful questions that would help users explore this document's content in the context of innovation and business strategy.

Requirements:
- Questions should be specific to the themes
- Open-ended and exploratory
- Relevant for business/innovation context
- Actionable and thought-provoking

Return ONLY the questions, one per line, without numbering or bullets.`;

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3001',
                    'X-Title': 'IdeaFlow Dashboard'
                },
                body: JSON.stringify({
                    model: 'x-ai/grok-beta',
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 300
                })
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`OpenRouter API error: ${response.status} - ${errorBody.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content || '';

            // Parse questions from response
            const questions = content
                .split('\n')
                .map(q => q.trim())
                .filter(q => q.length > 10 && q.endsWith('?'))
                .slice(0, 8);

            console.log(`[QuestionGenerator] Generated ${questions.length} questions`);
            return questions.length > 0 ? questions : getDefaultQuestions(themesText);
        } else {
            // Fallback to template-based questions
            console.log('[QuestionGenerator] Using template-based questions');
            return getDefaultQuestions(themes.join(', '));
        }
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
        `What challenges and opportunities exist in ${themes}?`
    ];
}
