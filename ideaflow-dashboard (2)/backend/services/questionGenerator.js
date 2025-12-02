const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Generate contextual questions from uploaded document
 * @param {Object} contextStats - Document context statistics with themes
 * @param {string} provider - Embedding provider ('grok' or 'llama')
 * @returns {Promise<string[]>} Array of generated questions
 */
export async function generateQuestionsFromContext(contextStats, provider = 'grok') {
    if (!contextStats || !contextStats.themes || contextStats.themes.length === 0) {
        console.log('[QuestionGenerator] No themes available, returning default questions');
        return [
            'What are the main topics covered in this document?',
            'How can these concepts be applied to our business?',
            'What innovations are mentioned in this content?'
        ];
    }

    const themes = contextStats.themes.join(', ');
    const prompt = `Based on a document with the following themes: ${themes}

Generate 4 insightful questions that would help users explore this document's content in the context of innovation and business strategy.

Requirements:
- Questions should be specific to the themes
- Open-ended and exploratory
- Relevant for business/innovation context
- Actionable and thought-provoking

Return ONLY the questions, one per line, without numbering or bullets.`;

    try {
        if (provider === 'grok' && OPENROUTER_API_KEY) {
            console.log('[QuestionGenerator] Generating questions using Grok...');
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
                .slice(0, 4);

            console.log(`[QuestionGenerator] Generated ${questions.length} questions`);
            return questions.length > 0 ? questions : getDefaultQuestions(themes);
        } else {
            // Fallback to template-based questions
            console.log('[QuestionGenerator] Using template-based questions');
            return getDefaultQuestions(themes);
        }
    } catch (error) {
        console.error('[QuestionGenerator] Error generating questions:', error.message);
        return getDefaultQuestions(themes);
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
