/**
 * Test Year Filter - Verify year filtering is working correctly
 */
import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

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
        return await response.json();
    } catch (error) {
        return { error: true, message: error.message };
    }
}

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                    YEAR FILTER TESTING                               ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

    // First, check what technologies exist in the database
    console.log('1. Checking technologies in database...');
    const techResult = await pool.query(`
        SELECT DISTINCT code_preference as tech, COUNT(*) as count
        FROM ideas
        WHERE code_preference IS NOT NULL AND code_preference != ''
        GROUP BY code_preference
        ORDER BY count DESC
        LIMIT 20
    `);
    console.log('Top technologies in DB:');
    techResult.rows.forEach(r => console.log(`   - ${r.tech}: ${r.count} ideas`));

    // Check if React exists
    const reactResult = await pool.query(`
        SELECT COUNT(*) as count FROM ideas 
        WHERE LOWER(code_preference) LIKE '%react%'
    `);
    console.log(`\n   React ideas in DB: ${reactResult.rows[0].count}`);

    // Check ideas by year
    console.log('\n2. Checking ideas by year...');
    const yearResult = await pool.query(`
        SELECT EXTRACT(YEAR FROM created_at) as year, COUNT(*) as count
        FROM ideas
        GROUP BY EXTRACT(YEAR FROM created_at)
        ORDER BY year DESC
    `);
    console.log('Ideas by year:');
    yearResult.rows.forEach(r => console.log(`   - ${r.year}: ${r.count} ideas`));

    // Test 1: Year filter only (should work)
    console.log('\n3. Testing year filter only...');
    const test1 = await search('show ideas', { year: 2024 });
    console.log(`   Query: "show ideas" with year=2024`);
    console.log(`   Results: ${test1.results?.length || 0}`);
    console.log(`   Applied filters: ${JSON.stringify(test1.metadata?.filters)}`);
    if (test1.results?.length > 0) {
        const years = test1.results.map(r => r.submissionDate ? new Date(r.submissionDate).getFullYear() : 'N/A');
        console.log(`   Result years: ${[...new Set(years)].join(', ')}`);
        const allCorrectYear = years.every(y => y === 2024);
        console.log(`   ✅ All results from 2024: ${allCorrectYear ? 'YES' : 'NO'}`);
    }

    // Test 2: Year filter from query text
    console.log('\n4. Testing year from query text...');
    const test2 = await search('ideas from 2024', {});
    console.log(`   Query: "ideas from 2024"`);
    console.log(`   Results: ${test2.results?.length || 0}`);
    console.log(`   Applied filters: ${JSON.stringify(test2.metadata?.filters)}`);
    if (test2.results?.length > 0) {
        const years = test2.results.map(r => r.submissionDate ? new Date(r.submissionDate).getFullYear() : 'N/A');
        console.log(`   Result years: ${[...new Set(years)].join(', ')}`);
    }

    // Test 3: TechStack that exists + year
    console.log('\n5. Testing existing tech + year...');
    const existingTech = techResult.rows[0]?.tech || 'Python';
    const test3 = await search('show projects', { year: 2024, techStack: [existingTech] });
    console.log(`   Query: "show projects" with year=2024, techStack=[${existingTech}]`);
    console.log(`   Results: ${test3.results?.length || 0}`);
    console.log(`   Applied filters: ${JSON.stringify(test3.metadata?.filters)}`);
    if (test3.results?.length > 0) {
        console.log(`   Sample result: ${test3.results[0].title}`);
        console.log(`   Tech: ${test3.results[0].technologies}`);
    }

    // Test 4: React specifically (may not exist)
    console.log('\n6. Testing React + year (may not exist in DB)...');
    const test4 = await search('show projects', { year: 2024, techStack: ['react'] });
    console.log(`   Query: "show projects" with year=2024, techStack=[react]`);
    console.log(`   Results: ${test4.results?.length || 0}`);
    console.log(`   Applied filters: ${JSON.stringify(test4.metadata?.filters)}`);
    console.log(`   AI Response: ${test4.aiResponse}`);

    // Test 5: Direct DB query for React 2024
    console.log('\n7. Direct DB check for React 2024...');
    const directResult = await pool.query(`
        SELECT COUNT(*) as count FROM ideas 
        WHERE LOWER(code_preference) LIKE '%react%'
        AND EXTRACT(YEAR FROM created_at) = 2024
    `);
    console.log(`   React ideas from 2024 in DB: ${directResult.rows[0].count}`);

    // Test 6: Python 2024 (should exist)
    console.log('\n8. Testing Python + year 2024...');
    const test6 = await search('show projects', { year: 2024, techStack: ['python'] });
    console.log(`   Query: "show projects" with year=2024, techStack=[python]`);
    console.log(`   Results: ${test6.results?.length || 0}`);
    if (test6.results?.length > 0) {
        const years = test6.results.map(r => r.submissionDate ? new Date(r.submissionDate).getFullYear() : 'N/A');
        const techs = test6.results.map(r => r.technologies);
        console.log(`   Result years: ${[...new Set(years)].join(', ')}`);
        console.log(`   Result techs: ${[...new Set(techs)].slice(0, 5).join(', ')}`);
    }

    await pool.end();
    
    console.log('\n' + '═'.repeat(70));
    console.log('YEAR FILTER TEST COMPLETE');
    console.log('═'.repeat(70));
}

runTests().catch(console.error);
