/**
 * Test Year and TechStack Filtering
 */
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3001';

async function testSearch(query, filters = {}) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Query: "${query}"`);
    console.log(`Filters:`, JSON.stringify(filters));
    console.log('='.repeat(60));

    try {
        const response = await fetch(`${BASE_URL}/api/search/conversational`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                additionalFilters: filters,
                limit: 10
            })
        });

        if (!response.ok) {
            console.log(`❌ Error: ${response.status}`);
            return;
        }

        const data = await response.json();
        console.log(`✅ Found ${data.results?.length || 0} results`);
        console.log(`AI Response: ${data.aiResponse}`);
        console.log(`Filters applied:`, JSON.stringify(data.metadata?.filters || {}));
        
        if (data.results?.length > 0) {
            console.log(`\nTop 3 results:`);
            data.results.slice(0, 3).forEach((r, i) => {
                const year = r.submissionDate ? new Date(r.submissionDate).getFullYear() : 'N/A';
                console.log(`  ${i + 1}. ${r.title} (Year: ${year}, Tech: ${r.technologies || 'N/A'})`);
            });
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

async function runTests() {
    console.log('Testing Year and TechStack Filtering\n');

    // Test 1: Year filter from query
    await testSearch('Ideas from 2024');

    // Test 2: Year filter from UI (additionalFilters)
    await testSearch('show all ideas', { year: 2024 });

    // Test 3: TechStack filter from query
    await testSearch('React projects');

    // Test 4: TechStack filter from UI
    await testSearch('show all ideas', { techStack: ['python'] });

    // Test 5: Combined year + tech filter
    await testSearch('AI projects', { year: 2024, techStack: ['python'] });

    // Test 6: Year only (filter-only query)
    await testSearch('2024');

    // Test 7: Domain + Year
    await testSearch('healthcare ideas from 2024');

    console.log('\n' + '='.repeat(60));
    console.log('Filter tests complete!');
    console.log('='.repeat(60));
}

runTests();
