/**
 * Evidence Normalizer Service
 * 
 * Structures and normalizes external evidence (Tavily results) 
 * before passing to LLM synthesis.
 * 
 * Key responsibilities:
 * - Normalize Tavily search results into consistent objects
 * - Extract company names from competitor results
 * - Truncate content to manageable lengths
 * - Preserve source URLs for citation
 */

/**
 * Normalize market trend results
 */
export function normalizeMarketTrends(results) {
    return results.map(r => ({
        title: r.title || 'Untitled',
        summary: truncateContent(r.content, 300),
        source: r.url,
        category: 'market_trend',
        score: r.score || 0,
        relevance: calculateRelevance(r.score)
    }));
}

/**
 * Normalize competitor results and extract company names
 */
export function normalizeCompetitors(results) {
    return results.map(r => {
        const companyName = extractCompanyName(r);

        return {
            name: companyName,
            title: r.title || 'Untitled',
            description: truncateContent(r.content, 250),
            source: r.url,
            category: 'competitor',
            score: r.score || 0
        };
    });
}

/**
 * Normalize patent results
 */
export function normalizePatents(results) {
    return results.map(r => ({
        title: r.title || 'Untitled Patent',
        abstract: truncateContent(r.content, 200),
        source: r.url,
        category: 'patent',
        score: r.score || 0,
        isRelevant: r.score > 0.5 // Flag for IP risk calculation
    }));
}

/**
 * Aggregate and structure all external evidence
 */
export function structureExternalEvidence(externalIntelligence) {
    if (!externalIntelligence) {
        return {
            marketTrends: [],
            competitors: [],
            patents: [],
            summary: { totalSources: 0, hasEvidence: false }
        };
    }

    const structured = {
        marketTrends: normalizeMarketTrends(externalIntelligence.marketTrends || []),
        competitors: normalizeCompetitors(externalIntelligence.competitors || []),
        patents: normalizePatents(externalIntelligence.patents || []),
        summary: {
            totalSources: 0,
            hasMarketData: false,
            hasCompetitorData: false,
            hasPatentData: false,
            hasEvidence: false
        }
    };

    // Calculate summary stats
    structured.summary.totalSources =
        structured.marketTrends.length +
        structured.competitors.length +
        structured.patents.length;

    structured.summary.hasMarketData = structured.marketTrends.length > 0;
    structured.summary.hasCompetitorData = structured.competitors.length > 0;
    structured.summary.hasPatentData = structured.patents.length > 0;
    structured.summary.hasEvidence = structured.summary.totalSources > 0;

    return structured;
}

/**
 * Extract company name from competitor result
 * Uses heuristics to find company names in titles and content
 */
function extractCompanyName(result) {
    const title = result.title || '';
    const content = result.content || '';

    // Common patterns for company names in search results
    const patterns = [
        /^([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)/,  // Capitalized words at start
        /([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\s+(?:Inc|Corp|Ltd|LLC)/,  // Company with suffix
        /([A-Z][a-zA-Z0-9]+)\s+-\s+/  // "CompanyName - description"
    ];

    for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    // Fallback: use first 3 words of title
    const words = title.split(' ').slice(0, 3).join(' ');
    return words || 'Unknown Company';
}

/**
 * Truncate content to specified length, ending at sentence boundary
 */
function truncateContent(content, maxLength) {
    if (!content || content.length <= maxLength) {
        return content || '';
    }

    // Try to end at a sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastQuestion = truncated.lastIndexOf('?');

    const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);

    if (lastSentenceEnd > maxLength * 0.7) {
        // If we can end within 70% of max length, do it
        return truncated.substring(0, lastSentenceEnd + 1);
    }

    // Otherwise just truncate and add ellipsis
    return truncated.trim() + '...';
}

/**
 * Calculate relevance label from score
 */
function calculateRelevance(score) {
    if (score >= 0.7) return 'High';
    if (score >= 0.4) return 'Medium';
    return 'Low';
}

export default {
    normalizeMarketTrends,
    normalizeCompetitors,
    normalizePatents,
    structureExternalEvidence
};
