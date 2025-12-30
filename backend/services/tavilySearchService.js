/**
 * Tavily Search Service
 * 
 * Handles external market intelligence via Tavily API
 * - Market trends
 * - Competitor research
 * - Patent/IP signals
 */

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_API_URL = 'https://api.tavily.com/search';

// Configuration
const CONFIG = {
    maxResultsPerQuery: 5,
    timeout: 30000, // 30 seconds
    includeDomains: [], // No restrictions
    excludeDomains: []
};

/**
 * Search for market trends related to the idea
 */
export async function searchMarketTrends(idea) {
    const queries = [
        `${idea.title} market trends 2024 2025`,
        `${idea.summary} industry adoption statistics`,
        `market size ${idea.title} forecast`
    ];

    const results = [];
    for (const query of queries.slice(0, 1)) { // Only first query to stay within limits
        try {
            const searchResults = await tavilySearch(query, 'market_trends');
            results.push(...searchResults);
        } catch (error) {
            console.error(`[Tavily] Market trends search failed:`, error.message);
        }
    }

    return deduplicateResults(results);
}

/**
 * Search for competitors and similar products
 * @param {Object} idea - The idea object
 * @param {String} customQuery - Optional custom search query for specific requests
 */
export async function searchCompetitors(idea, customQuery = null) {
    const query = customQuery || `companies building ${idea.title} competitors products`;

    try {
        return await tavilySearch(query, 'competitors');
    } catch (error) {
        console.error(`[Tavily] Competitor search failed:`, error.message);
        return [];
    }
}

/**
 * Search for patent and IP signals (heuristic only)
 */
export async function searchPatents(idea) {
    const query = `site:patents.google.com ${idea.title} ${idea.summary}`;

    try {
        return await tavilySearch(query, 'patents');
    } catch (error) {
        console.error(`[Tavily] Patent search failed:`, error.message);
        return [];
    }
}

/**
 * Core Tavily API search function
 */
async function tavilySearch(query, category) {
    if (!TAVILY_API_KEY) {
        throw new Error('TAVILY_API_KEY not configured');
    }

    console.log(`[Tavily] Searching ${category}: "${query}"`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.timeout);

    try {
        const response = await fetch(TAVILY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: query,
                max_results: CONFIG.maxResultsPerQuery,
                search_depth: 'basic',
                include_domains: CONFIG.includeDomains,
                exclude_domains: CONFIG.excludeDomains
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        console.log(`[Tavily] Found ${data.results?.length || 0} results for ${category}`);

        return (data.results || []).map(result => ({
            title: result.title,
            url: result.url,
            content: result.content,
            score: result.score || 0,
            category
        }));

    } catch (error) {
        clearTimeout(timeout);

        if (error.name === 'AbortError') {
            throw new Error(`Tavily search timed out after ${CONFIG.timeout}ms`);
        }
        throw error;
    }
}

/**
 * Deduplicate results by URL
 */
function deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
        if (seen.has(result.url)) {
            return false;
        }
        seen.add(result.url);
        return true;
    });
}

/**
 * Aggregate all external search results
 */
export async function aggregateExternalIntelligence(idea) {
    console.log(`[Tavily] Starting external intelligence gathering for idea ${idea.idea_id}`);

    const [marketTrends, competitors, patents] = await Promise.allSettled([
        searchMarketTrends(idea),
        searchCompetitors(idea),
        searchPatents(idea)
    ]);

    return {
        marketTrends: marketTrends.status === 'fulfilled' ? marketTrends.value : [],
        competitors: competitors.status === 'fulfilled' ? competitors.value : [],
        patents: patents.status === 'fulfilled' ? patents.value : [],
        summary: {
            totalSources: [
                ...(marketTrends.status === 'fulfilled' ? marketTrends.value : []),
                ...(competitors.status === 'fulfilled' ? competitors.value : []),
                ...(patents.status === 'fulfilled' ? patents.value : [])
            ].length,
            searchedAt: new Date().toISOString()
        }
    };
}

export default {
    searchMarketTrends,
    searchCompetitors,
    searchPatents,
    aggregateExternalIntelligence
};