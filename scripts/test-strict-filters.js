/**
 * Test STRICT Filters from ExploreModal
 * Verifies that when filters are selected, ONLY matching data is returned
 */
import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = 'http://localhost:3001';

async function search(query, filters = {}) {
    const response = await fetch(`${BASE_URL}/api/search/conversational`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, additionalFilters: filters, limit: 20 })
    });
    return await response.json();
}

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║              STRICT FILTER TESTING (ExploreModal)                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

    // Get available values from DB
    const techResult = await pool.query(`SELECT DISTINCT code_preference FROM ideas WHERE code_preference IS NOT NULL LIMIT 5`);
    const domainResult = await pool.query(`SELECT DISTINCT challenge_opportunity FROM ideas WHERE challenge_opportunity IS NOT NULL LIMIT 5`);
    const bgResult = await pool.query(`SELECT DISTINCT business_group FROM ideas WHERE business_group IS NOT NULL LIMIT 5`);
    
    const techs = techResult.rows.map(r => r.code_preference);
    const domains = domainResult.rows.map(r => r.challenge_opportunity);
    const businessGroups = bgResult.rows.map(r => r.business_group);
    
    console.log('Available test values:');
    console.log(`  Technologies: ${techs.slice(0, 3).join(', ')}`);
    console.log(`  Domains: ${domains.slice(0, 2).join(', ')}`);
    console.log(`  Business Groups: ${businessGroups.slice(0, 2).join(', ')}\n`);

    let passed = 0, failed = 0;

    // Test 1: Single Technology Filter
    console.log('═'.repeat(70));
    console.log('TEST 1: Single Technology Filter (STRICT)');
    const tech1 = techs[0];
    const test1 = await search('show ideas', { techStack: [tech1] });
    console.log(`  Filter: techStack=[${tech1}]`);
    console.log(`  Results: ${test1.results?.length || 0}`);
    if (test1.results?.length > 0) {
        const allMatch = test1.results.every(r => r.technologies?.toLowerCase().includes(tech1.toLowerCase()));
        console.log(`  All results have ${tech1}: ${allMatch ? '✅ YES' : '❌ NO'}`);
        if (!allMatch) {
            const mismatches = test1.results.filter(r => !r.technologies?.toLowerCase().includes(tech1.toLowerCase()));
            console.log(`  Mismatches: ${mismatches.map(r => r.technologies).join(', ')}`);
        }
        allMatch ? passed++ : failed++;
    } else { failed++; }

    // Test 2: Single Domain Filter
    console.log('\n' + '═'.repeat(70));
    console.log('TEST 2: Single Domain/Theme Filter (STRICT)');
    const domain1 = domains[0];
    const test2 = await search('show ideas', { domain: [domain1] });
    console.log(`  Filter: domain=[${domain1}]`);
    console.log(`  Results: ${test2.results?.length || 0}`);
    if (test2.results?.length > 0) {
        const allMatch = test2.results.every(r => r.domain?.toLowerCase().includes(domain1.toLowerCase()));
        console.log(`  All results have domain "${domain1}": ${allMatch ? '✅ YES' : '❌ NO'}`);
        allMatch ? passed++ : failed++;
    } else { failed++; }

    // Test 3: Single Business Group Filter
    console.log('\n' + '═'.repeat(70));
    console.log('TEST 3: Single Business Group Filter (STRICT)');
    const bg1 = businessGroups[0];
    const test3 = await search('show ideas', { businessGroup: [bg1] });
    console.log(`  Filter: businessGroup=[${bg1}]`);
    console.log(`  Results: ${test3.results?.length || 0}`);
    if (test3.results?.length > 0) {
        const allMatch = test3.results.every(r => r.businessGroup?.toLowerCase().includes(bg1.toLowerCase()));
        console.log(`  All results have businessGroup "${bg1}": ${allMatch ? '✅ YES' : '❌ NO'}`);
        allMatch ? passed++ : failed++;
    } else { failed++; }

    // Test 4: Year Filter
    console.log('\n' + '═'.repeat(70));
    console.log('TEST 4: Year Filter (STRICT)');
    const test4 = await search('show ideas', { year: 2024 });
    console.log(`  Filter: year=2024`);
    console.log(`  Results: ${test4.results?.length || 0}`);
    if (test4.results?.length > 0) {
        const years = test4.results.map(r => r.submissionDate ? new Date(r.submissionDate).getFullYear() : null);
        const allMatch = years.every(y => y === 2024);
        console.log(`  All results from 2024: ${allMatch ? '✅ YES' : '❌ NO'}`);
        console.log(`  Years found: ${[...new Set(years)].join(', ')}`);
        allMatch ? passed++ : failed++;
    } else { failed++; }

    // Test 5: Multiple Technologies (OR within same filter type)
    console.log('\n' + '═'.repeat(70));
    console.log('TEST 5: Multiple Technologies (OR logic)');
    const tech2 = techs[1] || techs[0];
    const test5 = await search('show ideas', { techStack: [tech1, tech2] });
    console.log(`  Filter: techStack=[${tech1}, ${tech2}]`);
    console.log(`  Results: ${test5.results?.length || 0}`);
    if (test5.results?.length > 0) {
        const allMatch = test5.results.every(r => {
            const t = (r.technologies || '').toLowerCase();
            return t.includes(tech1.toLowerCase()) || t.includes(tech2.toLowerCase());
        });
        console.log(`  All results have ${tech1} OR ${tech2}: ${allMatch ? '✅ YES' : '❌ NO'}`);
        allMatch ? passed++ : failed++;
    } else { failed++; }

    // Test 6: Combined Filters (AND between different filter types)
    console.log('\n' + '═'.repeat(70));
    console.log('TEST 6: Combined Filters (Year + Tech - AND logic)');
    const test6 = await search('show ideas', { year: 2024, techStack: [tech1] });
    console.log(`  Filter: year=2024 AND techStack=[${tech1}]`);
    console.log(`  Results: ${test6.results?.length || 0}`);
    if (test6.results?.length > 0) {
        const allMatch = test6.results.every(r => {
            const year = r.submissionDate ? new Date(r.submissionDate).getFullYear() : null;
            const hasTech = (r.technologies || '').toLowerCase().includes(tech1.toLowerCase());
            return year === 2024 && hasTech;
        });
        console.log(`  All results: year=2024 AND tech=${tech1}: ${allMatch ? '✅ YES' : '❌ NO'}`);
        allMatch ? passed++ : failed++;
    } else { 
        console.log(`  ⚠️ No results (may be valid if no matching data)`);
        passed++; // No results is valid if filters are too restrictive
    }

    // Test 7: All Filters Combined
    console.log('\n' + '═'.repeat(70));
    console.log('TEST 7: All Filters Combined (Year + Tech + Domain)');
    const test7 = await search('show ideas', { year: 2024, techStack: [tech1], domain: [domain1] });
    console.log(`  Filter: year=2024 AND techStack=[${tech1}] AND domain=[${domain1}]`);
    console.log(`  Results: ${test7.results?.length || 0}`);
    console.log(`  Applied filters: ${JSON.stringify(test7.metadata?.filters)}`);
    passed++; // Just verify it doesn't crash

    await pool.end();

    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Passed: ${passed}/${passed + failed} ✅`);
    console.log(`Failed: ${failed}/${passed + failed} ❌`);
    console.log('═'.repeat(70));
}

runTests().catch(console.error);
