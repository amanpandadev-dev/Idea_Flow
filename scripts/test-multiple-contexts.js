/**
 * Test Multiple Contexts (Filters) and Get Results
 * Tests various combinations of filters: year, techStack, domain, businessGroup
 */
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3001';

async function search(query, filters = {}) {
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
            return { error: true, status: response.status };
        }

        return await response.json();
    } catch (error) {
        return { error: true, message: error.message };
    }
}

function printResults(testName, query, filters, data) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TEST: ${testName}`);
    console.log(`Query: "${query}"`);
    console.log(`Filters: ${JSON.stringify(filters)}`);
    console.log('='.repeat(70));
    
    if (data.error) {
        console.log(`❌ ERROR: ${data.message || data.status}`);
        return false;
    }
    
    const count = data.results?.length || 0;
    console.log(`✅ Found ${count} results`);
    console.log(`AI Response: ${data.aiResponse}`);
    console.log(`Applied Filters: ${JSON.stringify(data.metadata?.filters || {})}`);
    
    if (count > 0) {
        console.log(`\nTop 3 Results:`);
        data.results.slice(0, 3).forEach((r, i) => {
            const year = r.submissionDate ? new Date(r.submissionDate).getFullYear() : 'N/A';
            console.log(`  ${i + 1}. ${r.title?.substring(0, 50)}...`);
            console.log(`     Year: ${year} | Tech: ${r.technologies || 'N/A'} | Domain: ${r.domain || 'N/A'}`);
        });
    }
    
    return count > 0;
}

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║           MULTIPLE CONTEXT (FILTER) TESTING                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    
    let passed = 0;
    let failed = 0;
    
    // Test 1: No filters - should return results
    {
        const data = await search('show all ideas', {});
        if (printResults('No Filters', 'show all ideas', {}, data)) passed++; else failed++;
    }
    
    // Test 2: Year filter only (from UI)
    {
        const data = await search('show ideas', { year: 2024 });
        if (printResults('Year Filter (UI)', 'show ideas', { year: 2024 }, data)) passed++; else failed++;
    }
    
    // Test 3: Year filter from query text
    {
        const data = await search('ideas from 2024', {});
        if (printResults('Year Filter (Query)', 'ideas from 2024', {}, data)) passed++; else failed++;
    }
    
    // Test 4: TechStack filter only (from UI)
    {
        const data = await search('show projects', { techStack: ['python'] });
        if (printResults('TechStack Filter (UI)', 'show projects', { techStack: ['python'] }, data)) passed++; else failed++;
    }
    
    // Test 5: Domain filter only
    {
        const data = await search('AI projects', {});
        if (printResults('Domain Filter (Query)', 'AI projects', {}, data)) passed++; else failed++;
    }
    
    // Test 6: Year + TechStack combined
    {
        const data = await search('show projects', { year: 2024, techStack: ['python'] });
        if (printResults('Year + TechStack', 'show projects', { year: 2024, techStack: ['python'] }, data)) passed++; else failed++;
    }
    
    // Test 7: Year + Domain combined
    {
        const data = await search('healthcare ideas', { year: 2024 });
        if (printResults('Year + Domain', 'healthcare ideas', { year: 2024 }, data)) passed++; else failed++;
    }
    
    // Test 8: Multiple TechStacks
    {
        const data = await search('show projects', { techStack: ['python', 'javascript'] });
        if (printResults('Multiple TechStacks', 'show projects', { techStack: ['python', 'javascript'] }, data)) passed++; else failed++;
    }
    
    // Test 9: Year + TechStack + Domain (all three)
    {
        const data = await search('AI projects', { year: 2024, techStack: ['python'] });
        if (printResults('Year + TechStack + Domain', 'AI projects', { year: 2024, techStack: ['python'] }, data)) passed++; else failed++;
    }
    
    // Test 10: Query with year but different UI year (UI should take precedence)
    {
        const data = await search('ideas from 2023', { year: 2024 });
        const appliedYear = data.metadata?.filters?.year;
        console.log(`\n${'='.repeat(70)}`);
        console.log(`TEST: Year Precedence (UI vs Query)`);
        console.log(`Query: "ideas from 2023" with UI year: 2024`);
        console.log(`Applied Year: ${appliedYear}`);
        if (appliedYear === 2024) {
            console.log(`✅ UI year takes precedence correctly`);
            passed++;
        } else {
            console.log(`❌ Expected UI year (2024) to take precedence`);
            failed++;
        }
    }
    
    // Test 11: Blockchain domain detection
    {
        const data = await search('blockchain projects', {});
        if (printResults('Blockchain Domain', 'blockchain projects', {}, data)) passed++; else failed++;
    }
    
    // Test 12: Cloud domain detection
    {
        const data = await search('cloud computing ideas', {});
        if (printResults('Cloud Domain', 'cloud computing ideas', {}, data)) passed++; else failed++;
    }
    
    // Test 13: Finance domain with year
    {
        const data = await search('fintech banking', { year: 2024 });
        if (printResults('Finance + Year', 'fintech banking', { year: 2024 }, data)) passed++; else failed++;
    }
    
    // Test 14: Empty query with filters only
    {
        const data = await search('show all', { year: 2024, techStack: ['java'] });
        if (printResults('Filters Only (minimal query)', 'show all', { year: 2024, techStack: ['java'] }, data)) passed++; else failed++;
    }
    
    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total Tests: ${passed + failed}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    console.log('═'.repeat(70));
}

runTests().catch(console.error);
