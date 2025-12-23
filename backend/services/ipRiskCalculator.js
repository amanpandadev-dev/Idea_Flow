/**
 * IP Risk Calculator
 * 
 * Provides deterministic, rule-based IP risk scoring.
 * LLM explains the score, but does NOT decide it.
 * 
 * Scoring Formula:
 * IP Risk Score = (numRelevantPatents * 0.6) + (maxSimilarity * 0.4)
 * 
 * Risk Levels:
 * - Low: < 30
 * - Medium: 30-60
 * - High: > 60
 */

/**
 * Calculate IP risk score based on patent count and internal similarity
 */
export function calculateIPRiskScore(patents, similarIdeas) {
    const PATENT_WEIGHT = 0.6;
    const SIMILARITY_WEIGHT = 0.4;

    // Patent component (0-100)
    // Count patents with score > 0.5 as relevant
    const relevantPatents = patents.filter(p => p.isRelevant || p.score > 0.5);
    const numRelevantPatents = relevantPatents.length;

    // Each relevant patent adds 20 points, capped at 100
    const patentScore = Math.min(100, numRelevantPatents * 20);

    // Similarity component (0-100)
    // Use highest similarity to existing internal ideas
    const similarities = similarIdeas.map(i => i.similarity || 0);
    const maxSimilarity = similarities.length > 0 ? Math.max(...similarities) : 0;
    const similarityScore = maxSimilarity * 100;

    // Weighted final score
    const finalScore = (patentScore * PATENT_WEIGHT) + (similarityScore * SIMILARITY_WEIGHT);

    // Determine risk level
    let level;
    if (finalScore < 30) {
        level = 'Low';
    } else if (finalScore < 60) {
        level = 'Medium';
    } else {
        level = 'High';
    }

    return {
        score: Math.round(finalScore),
        level,
        factors: {
            numRelevantPatents,
            maxSimilarity: parseFloat(maxSimilarity.toFixed(3)),
            patentContribution: Math.round(patentScore * PATENT_WEIGHT),
            similarityContribution: Math.round(similarityScore * SIMILARITY_WEIGHT)
        },
        disclaimer: 'This is an AI-assisted assessment, not legal advice. Consult an IP attorney for thorough analysis.'
    };
}

/**
 * Get similarity band for display
 */
export function getSimilarityBand(similarity) {
    if (similarity >= 0.8) return 'Strong overlap';
    if (similarity >= 0.5) return 'Moderate overlap';
    return 'Low overlap';
}

/**
 * Format IP risk for LLM explanation prompt
 */
export function formatIPRiskForPrompt(ipRisk, patents) {
    if (patents.length === 0) {
        return 'No patent signals found in search.';
    }

    let formatted = `**Calculated IP Risk Score: ${ipRisk.score}/100 (${ipRisk.level})**\n\n`;
    formatted += `**Risk Factors:**\n`;
    formatted += `- Relevant patents found: ${ipRisk.factors.numRelevantPatents}\n`;
    formatted += `- Max similarity to internal ideas: ${(ipRisk.factors.maxSimilarity * 100).toFixed(0)}%\n`;
    formatted += `- Patent contribution: ${ipRisk.factors.patentContribution} points\n`;
    formatted += `- Similarity contribution: ${ipRisk.factors.similarityContribution} points\n\n`;

    formatted += `**Patents Found:**\n`;
    patents.slice(0, 5).forEach((p, idx) => {
        formatted += `${idx + 1}. ${p.title}\n`;
    });

    return formatted;
}

export default {
    calculateIPRiskScore,
    getSimilarityBand,
    formatIPRiskForPrompt
};
