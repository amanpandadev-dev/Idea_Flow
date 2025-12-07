class BaseTool {
    constructor(name, description) {
        this.name = name;
        this.description = description;
    }

    async execute(input) {
        throw new Error('execute() must be implemented');
    }
}

export class TavilySearchTool extends BaseTool {
    constructor() {
        super(
            'tavily_search',
            `Use this tool to get up-to-date information from the internet.
It is best for recent events, public figures, or general knowledge questions.
Input should be a search query. For example: "latest advancements in AI".`
        );
        this.apiKey = process.env.TAVILY_API_KEY;
    }

    async execute(query) {
        if (!this.apiKey) {
            return 'Tavily Search API key is not set. Cannot perform web search.';
        }

        console.log(`🔍 Tavily search: "${query}"`);

        try {
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api_key: this.apiKey,
                    query: query,
                    search_depth: 'basic',
                    include_answer: true,
                    max_results: 5,
                }),
            });

            if (!response.ok) {
                const errorBody = await response.json();
                console.error('Tavily API Error:', errorBody);
                return `Tavily API request failed with status ${response.status}: ${errorBody.message || 'Unknown error'}`;
            }

            const data = await response.json();
            return this.formatResults(data);

        } catch (error) {
            console.error('Tavily search failed:', error.message);
            return `Tavily search request failed: ${error.message}`;
        }
    }

    formatResults(data) {
        if (!data || (!data.answer && (!data.results || data.results.length === 0))) {
            return 'No results found from Tavily search.';
        }

        let output = 'Web Search Results:\n\n';

        if (data.answer) {
            output += `💡 Answer: ${data.answer}\n\n---\n\n`;
        }

        if (data.results && data.results.length > 0) {
            output += '📄 Sources:\n';
            data.results.forEach((result, index) => {
                output += `[${index + 1}] ${result.title}\n`;
                output += `URL: ${result.url}\n`;
                output += `Content Snippet: ${result.content.substring(0, 200)}...\n\n`;
            });
        }

        return output;
    }
}

export { TavilySearchTool as TavilyTool };
export default TavilySearchTool;
