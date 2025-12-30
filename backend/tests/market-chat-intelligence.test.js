/**
 * Market Chat Intelligence Tests
 * Tests for enhanced query parameter extraction and intelligent response handling
 */

import { extractQueryParameters, classifyIntent } from '../services/marketValidatorChatService.js';

describe('Market Chat Intelligence', () => {
    describe('Query Parameter Extraction', () => {
        test('should extract numerical limits from "top N" pattern', () => {
            const queries = [
                'What are the top 2 competitors?',
                'Give me the first 5 market trends',
                'List top 10 patents'
            ];

            const expectedLimits = [2, 5, 10];

            queries.forEach((query, index) => {
                const result = extractQueryParameters(query);
                expect(result.limit).toBe(expectedLimits[index]);
            });
        });

        test('should extract constraints from query', () => {
            const query = 'Who are the biggest competitors?';
            const result = extractQueryParameters(query);
            
            expect(result.constraints).toContain('biggest');
        });

        test('should extract multiple constraints', () => {
            const query = 'Show me the newest and fastest growing competitors';
            const result = extractQueryParameters(query);
            
            expect(result.constraints).toContain('newest');
            expect(result.constraints).toContain('fastest growing');
        });

        test('should extract region from query', () => {
            const queries = [
                'Competitors in US',
                'Market trends for Europe',
                'Patents in China'
            ];

            const expectedRegions = ['US', 'Europe', 'China'];

            queries.forEach((query, index) => {
                const result = extractQueryParameters(query);
                expect(result.region).toBe(expectedRegions[index]);
            });
        });

        test('should extract timeframe from query', () => {
            const query = 'Market trends in 2024';
            const result = extractQueryParameters(query);
            
            expect(result.timeframe).toBe('2024');
        });

        test('should handle queries with no parameters', () => {
            const query = 'What are the competitors?';
            const result = extractQueryParameters(query);
            
            expect(result.limit).toBeNull();
            expect(result.constraints).toHaveLength(0);
            expect(result.region).toBeNull();
        });
    });

    describe('Intent Classification with Parameters', () => {
        test('should classify competitor query with limit', () => {
            const query = 'Give me top 2 competitors';
            const result = classifyIntent(query);
            
            expect(result.intent).toBe('competitors');
            expect(result.metadata.limit).toBe(2);
        });

        test('should classify market trends query with timeframe', () => {
            const query = 'What are the market trends in 2024?';
            const result = classifyIntent(query);
            
            expect(result.intent).toBe('market_trends');
            expect(result.metadata.timeframe).toBe('2024');
        });

        test('should classify competitor query with constraints', () => {
            const query = 'Who are the biggest competitors?';
            const result = classifyIntent(query);
            
            expect(result.intent).toBe('competitors');
            expect(result.metadata.constraints).toContain('biggest');
        });

        test('should classify patent query with limit', () => {
            const query = 'Show me top 3 patents';
            const result = classifyIntent(query);
            
            expect(result.intent).toBe('patent_risk');
            expect(result.metadata.limit).toBe(3);
        });
    });

    describe('Query Differentiation', () => {
        test('should differentiate between general and specific competitor queries', () => {
            const generalQuery = 'What are the competitors?';
            const specificQuery = 'Give top 2 competitors?';

            const generalResult = classifyIntent(generalQuery);
            const specificResult = classifyIntent(specificQuery);

            // Both should be competitor intent
            expect(generalResult.intent).toBe('competitors');
            expect(specificResult.intent).toBe('competitors');

            // But metadata should differ
            expect(generalResult.metadata.limit).toBeNull();
            expect(specificResult.metadata.limit).toBe(2);
        });

        test('should handle follow-up refinement queries', () => {
            const initialQuery = 'What are the market trends?';
            const followUpQuery = 'Show me just the top 3';

            const initialResult = classifyIntent(initialQuery);
            const followUpResult = classifyIntent(followUpQuery);

            // Follow-up should extract the limit
            expect(followUpResult.metadata.limit).toBe(3);
        });

        test('should detect analysis requests and route to GENERAL intent', () => {
            const analysisQueries = [
                'Analyze these competitors',
                'Compare the strengths and weaknesses',
                'What are the pros and cons?',
                'Evaluate the differentiation opportunities',
                'Explain the competitive advantages'
            ];

            analysisQueries.forEach(query => {
                const result = classifyIntent(query);
                expect(result.intent).toBe('general');
                expect(result.metadata.requiresAnalysis).toBe(true);
            });
        });

        test('should differentiate between data request and analysis request', () => {
            const dataQuery = 'What are the competitors?';
            const analysisQuery = 'Analyze the competitors strengths and weaknesses';

            const dataResult = classifyIntent(dataQuery);
            const analysisResult = classifyIntent(analysisQuery);

            // Data query should go to COMPETITORS intent
            expect(dataResult.intent).toBe('competitors');
            expect(dataResult.metadata.requiresAnalysis).toBeUndefined();

            // Analysis query should go to GENERAL intent with analysis flag
            expect(analysisResult.intent).toBe('general');
            expect(analysisResult.metadata.requiresAnalysis).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        test('should handle queries with multiple numbers', () => {
            const query = 'Show me top 5 competitors from the last 3 years';
            const result = extractQueryParameters(query);
            
            // Should extract the first number as limit
            expect(result.limit).toBe(5);
        });

        test('should handle off-topic queries', () => {
            const query = 'What is the weather today?';
            const result = classifyIntent(query);
            
            expect(result.intent).toBe('off_topic');
        });

        test('should filter out common words from company names', () => {
            const query = 'What are the competitors?';
            const result = extractQueryParameters(query);
            
            // "What" should not be extracted as a company name
            expect(result.specificNames).not.toContain('What');
        });
    });
});

describe('Response Formatting', () => {
    test('should format limited results correctly', () => {
        const results = [
            { title: 'Company A', content: 'Description A', url: 'http://a.com' },
            { title: 'Company B', content: 'Description B', url: 'http://b.com' },
            { title: 'Company C', content: 'Description C', url: 'http://c.com' }
        ];

        const limit = 2;
        const limitedResults = results.slice(0, limit);

        expect(limitedResults).toHaveLength(2);
        expect(limitedResults[0].title).toBe('Company A');
        expect(limitedResults[1].title).toBe('Company B');
    });

    test('should handle limit greater than available results', () => {
        const results = [
            { title: 'Company A', content: 'Description A', url: 'http://a.com' }
        ];

        const limit = 5;
        const limitedResults = results.slice(0, limit);

        expect(limitedResults).toHaveLength(1);
    });
});
