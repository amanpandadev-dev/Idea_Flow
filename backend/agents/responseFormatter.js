/**
 * Format agent responses with structured citations
 */

/**
 * Parse agent output to extract answer and citations
 * @param {string} agentOutput - Raw agent output
 * @param {Array} toolResults - Results from tool calls
 * @returns {Object} Formatted response
 */
export function formatResponse(agentOutput, toolResults = []) {
    const response = {
        answer: agentOutput,
        citations: {
            internal: [],
            external: []
        },
        reasoning: '',
        usedEphemeralContext: false
    };

    // Extract citations from tool results
    toolResults.forEach(result => {
        if (result.tool === 'internal_rag') {
            response.citations.internal.push(...parseInternalCitations(result.output));

            // Check if ephemeral context was used
            if (result.output.includes('From Uploaded Document')) {
                response.usedEphemeralContext = true;
            }
        } else if (result.tool === 'tavily_search') {
            response.citations.external.push(...parseExternalCitations(result.output));
        }
    });

    return response;
}

/**
 * Parse internal citations from tool output
 * @param {string} output - Tool output
 * @returns {Array} Internal citations
 */
function parseInternalCitations(output) {
    const citations = [];

    // Match idea entries: [1] IDEA-123: Title
    const ideaPattern = /\[(\d+)\] (IDEA-\d+): (.+?)\n/g;
    let match;

    while ((match = ideaPattern.exec(output)) !== null) {
        const [, index, ideaId, title] = match;

        // Extract additional info
        const ideaBlock = output.substring(match.index, match.index + 500);
        const summaryMatch = ideaBlock.match(/Summary: (.+?)(?:\n|$)/);
        const domainMatch = ideaBlock.match(/Domain: (.+?)(?:\n|$)/);
        const scoreMatch = ideaBlock.match(/Score: (\d+)/);

        citations.push({
            ideaId,
            title,
            snippet: summaryMatch ? summaryMatch[1] : '',
            domain: domainMatch ? domainMatch[1] : '',
            relevance: scoreMatch ? parseInt(scoreMatch[1]) / 10 : 0.5
        });
    }

    return citations;
}

/**
 * Parse external citations from tool output
 * @param {string} output - Tool output
 * @returns {Array} External citations
 */
function parseExternalCitations(output) {
    const citations = [];

    // Split by result separator
    const results = output.split('---\n');

    results.forEach(result => {
        const titleMatch = result.match(/\[\d+\] (.+?)\n/);
        const urlMatch = result.match(/URL: (.+?)\n/);
        const summaryMatch = result.match(/Summary: (.+?)(?:\n|$)/s);

        if (titleMatch && urlMatch) {
            citations.push({
                title: titleMatch[1],
                url: urlMatch[1],
                snippet: summaryMatch ? summaryMatch[1].trim() : ''
            });
        }
    });

    return citations;
}

/**
 * Format response for API output
 * @param {Object} response - Formatted response
 * @param {number} processingTime - Processing time in seconds
 * @returns {Object} API response
 */
export function formatAPIResponse(response, processingTime = 0) {
    return {
        answer: response.answer,
        citations: response.citations,
        reasoning: response.reasoning,
        usedEphemeralContext: response.usedEphemeralContext,
        processingTime: parseFloat(processingTime.toFixed(2)),
        timestamp: new Date().toISOString()
    };
}

/**
 * Create error response
 * @param {string} message - Error message
 * @param {Error} error - Error object
 * @returns {Object} Error response
 */
export function formatErrorResponse(message, error = null) {
    return {
        error: true,
        message,
        details: error ? error.message : null,
        timestamp: new Date().toISOString()
    };
}

export default {
    formatResponse,
    formatAPIResponse,
    formatErrorResponse
};
