/**
 * Hybrid Search Helper Functions
 */

/**
 * Calculate hybrid score
 * Formula: 0.7 * vector + 0.2 * metadata + 0.1 * keyword
 */
function calculateHybridScore(vectorSimilarity, metadata, filters, query) {
    const vectorScore = vectorSimilarity;  // Already [0,1]
    const metadataScore = calculateMetadataScore(metadata, filters);
    const keywordScore = calculateKeywordScore(metadata, query);

    return (0.7 * vectorScore) + (0.2 * metadataScore) + (0.1 * keywordScore);
}

/**
 * Calculate metadata match score
 */
function calculateMetadataScore(metadata, filters) {
    if (!filters || Object.keys(filters).length === 0) {
        return 0;
    }

    let totalMatches = 0;
    let totalFilters = 0;

    if (filters.technologies?.length > 0) {
        totalFilters++;
        const techString = (metadata.technologies || '').toLowerCase();
        const hasMatch = filters.technologies.some(tech =>
            techString.includes(tech.toLowerCase())
        );
        if (hasMatch) totalMatches++;
    }

    if (filters.domains?.length > 0) {
        totalFilters++;
        const domainString = (metadata.domain || '').toLowerCase();
        const hasMatch = filters.domains.some(domain =>
            domainString.includes(domain.toLowerCase())
        );
        if (hasMatch) totalMatches++;
    }

    return totalFilters > 0 ? (totalMatches / totalFilters) : 0;
}

/**
 * Calculate keyword match score
 */
function calculateKeywordScore(documentOrMetadata, query) {
    if (!query) return 0;

    // Handle both document string and metadata object
    let documentText = '';

    if (typeof documentOrMetadata === 'string') {
        documentText = documentOrMetadata;
    } else if (typeof documentOrMetadata === 'object' && documentOrMetadata !== null) {
        // It's a metadata object - extract text fields
        const metadata = documentOrMetadata;
        documentText = [
            metadata.title || '',
            metadata.summary || '',
            metadata.domain || '',
            metadata.technologies || ''
        ].join(' ');
    }

    if (!documentText) return 0;

    const documentLower = documentText.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    if (queryTerms.length === 0) return 0;

    const matches = queryTerms.filter(term => documentLower.includes(term)).length;
    return matches / queryTerms.length;
}

/**
 * Format results for frontend
 */
function formatResults(results) {
    return results.map(result => {
        const metadata = result.metadata || {};

        return {
            id: `IDEA-${metadata.idea_id}`,
            dbId: metadata.idea_id,
            title: metadata.title || 'Untitled',
            description: metadata.summary || result.document?.substring(0, 300) || '',
            domain: metadata.domain || 'General',
            businessGroup: metadata.businessGroup || 'Unknown',
            technologies: metadata.technologies || '',
            score: metadata.score || 0,
            submissionDate: metadata.created_at || new Date().toISOString(),
            matchScore: result.similarity ? Math.round(result.similarity * 100) : 70,
            hybridScore: result.hybridScore,
            scoreBreakdown: result.scoreBreakdown
        };
    });
}

/**
 * Generate conversational response
 */
async function generateConversationalResponse(query, context) {
    const prompt = `You are a helpful assistant for an innovation portal.
    
User query: "${query}"
Current search: "${context.semanticQuery || 'No active search'}"
Active filters: ${JSON.stringify(context.getFilterSummary())}
Results found: ${context.cachedResults.length}

Provide a friendly, concise response (2-3 sentences max).`;

    try {
        const response = await generateText(prompt, {
            model: 'llama3.1',
            temperature: 0.7,
            maxOutputTokens: 150
        });
        return response.trim();
    } catch (error) {
        return `I found ${context.cachedResults.length} ideas. How can I help you explore them?`;
    }
}

/**
 * Generate search response
 */
async function generateSearchResponse(query, results, context) {
    if (results.length === 0) {
        return `I couldn't find any ideas matching "${query}". Try adjusting your search or filters.`;
    }

    const prompt = `Summarize these search results in 2-3 sentences.

Query: "${query}"
Results found: ${results.length}
Top domains: ${getTopDomains(results, 3).join(', ')}

Be concise and helpful.`;

    try {
        const response = await generateText(prompt, {
            model: 'llama3.1',
            temperature: 0.7,
            maxOutputTokens: 150
        });
        return response.trim();
    } catch (error) {
        return `Found ${results.length} ideas matching "${query}".`;
    }
}

/**
 * Generate smart suggestions
 */
function generateSmartSuggestions(results, context) {
    const suggestions = [];

    // Suggest filters based on results
    const topDomains = getTopDomains(results, 3);
    const topTechs = getTopTechnologies(results, 3);

    if (topDomains.length > 0) {
        suggestions.push(...topDomains.map(d => `filter by ${d}`));
    }

    if (topTechs.length > 0) {
        suggestions.push(...topTechs.map(t => `using ${t}`));
    }

    // Suggest filter removal if active
    const activeFilters = context.getFilterSummary();
    if (Object.keys(activeFilters).length > 0) {
        suggestions.push('clear all filters', 'reset search');
    }

    return suggestions.slice(0, 5);  // Max 5 suggestions
}

/**
 * Get top domains from results
 */
function getTopDomains(results, limit = 3) {
    const domainCounts = {};

    results.forEach(r => {
        const domain = r.domain || 'General';
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });

    return Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([domain,]) => domain);
}

/**
 * Get top technologies from results
 */
function getTopTechnologies(results, limit = 3) {
    const techCounts = {};

    results.forEach(r => {
        const techs = (r.technologies || '').split(',').map(t => t.trim()).filter(t => t);
        techs.forEach(tech => {
            techCounts[tech] = (techCounts[tech] || 0) + 1;
        });
    });

    return Object.entries(techCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tech]) => tech);
}

export {
    calculateHybridScore,
    calculateMetadataScore,
    calculateKeywordScore,
    formatResults,
    generateConversationalResponse,
    generateSearchResponse,
    generateSmartSuggestions,
    getTopDomains,
    getTopTechnologies
};
