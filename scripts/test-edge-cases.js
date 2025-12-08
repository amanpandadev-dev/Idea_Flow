/**
 * Test Edge Cases - Naive User Scenarios
 */
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3001';

async function search(query, filters = {}) {
    const response = await fetch(`${BASE_URL}/api/search/conversational`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, additionalFilters: filters, limit: 10 })
    });
    return await response.json();
}

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                    EDGE CASE TESTING                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

    const tests = [
        // Edge case 1: Domain that doesn't exist exactly
        { name: 'Non-exact domain (finance)', query: 'banking ideas', filters: { domain: ['finance'], year: 2023 } },
        
        // Edge case 2: Very restrictive filters
        { name: 'Very restrictive filters', query: 'show ideas', filters: { domain: ['healthcare'], techStack: ['react'], year: 2024 } },
        
        // Edge case 3: Empty query with filters
        { name: 'Minimal query with filters', query: 'ideas', filters: { year: 2024 } },
        
        // Edge case 4: Typo in domain
        { name: 'Typo in search', query: 'helthcare ideas', filters: {} },
        
        // Edge case 5: Multiple domains
        { name: 'Multiple domains', query: 'show ideas', filters: { domain: ['AI', 'cloud'] } },
        
        // Edge case 6: Tech that doesn't exist
        { name: 'Non-existent tech', query: 'show projects', filters: { techStack: ['react', 'vue'] } },
        
        // Edge case 7: Just year filter
        { name: 'Year only', query: 'show all', filters: { year: 2023 } },
        
        // Edge case 8: Broad search
        { name: 'Broad search', query: 'innovation ideas', filters: {} },
    ];

    for (const test of tests) {
        console.log('═'.repeat(70));
        console.log(`TEST: ${test.name}`);
        console.log(`Query: "${test.query}"`);
        console.log(`Filters: ${JSON.stringify(test.filters)}`);
        
        const result = await search(test.query, test.filters);
        
        console.log(`Results: ${result.results?.length || 0}`);
        console.log(`AI Response: ${result.aiResponse?.substring(0, 100)}...`);
        
        if (result.results?.length > 0) {
            console.log(`✅ Got results`);
        } else {
            console.log(`⚠️ No results - check if fallback worked`);
        }
        console.log();
    }

    console.log('═'.repeat(70));
    console.log('EDGE CASE TESTING COMPLETE');
    console.log('═'.repeat(70));
}

runTests().catch(console.error);
