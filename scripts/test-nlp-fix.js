/**
 * Test NLP Query Processing - Verify no unwanted filters are added
 */
import dotenv from 'dotenv';
dotenv.config();

import { enhanceQuery, processQuery } from '../backend/services/nlpQueryProcessor.js';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';

console.log('='.repeat(60));
console.log('NLP Query Processing Test');
console.log('='.repeat(60));
console.log(`OpenRouter Key: ${OPENROUTER_KEY ? '✅ Found' : '❌ Missing'}`);
console.log(`Model: ${MODEL}`);
console.log('='.repeat(60));

async function testQuery(query, expectYear = false) {
    console.log(`\n🔍 Query: "${query}"`);
    console.log(`   Expected year in result: ${expectYear ? 'YES' : 'NO'}`);
    
    const result = await enhanceQuery(query, {
        useAI: !!OPENROUTER_KEY,
        openRouterKey: OPENROUTER_KEY,
        openRouterModel: MODEL
    });
    
    // Check if year was added when it shouldn't be
    const hasYear = result.expanded.some(t => /\b(202[0-9]|2030)\b/.test(t));
    
    console.log(`   Expanded: [${result.expanded.slice(0, 5).join(', ')}${result.expanded.length > 5 ? '...' : ''}]`);
    console.log(`   Has year: ${hasYear ? 'YES' : 'NO'}`);
    
    if (hasYear && !expectYear) {
        console.log(`   ❌ FAIL: Year was added but not expected!`);
        return false;
    } else if (!hasYear && expectYear) {
        console.log(`   ❌ FAIL: Year was expected but not found!`);
        return false;
    } else {
        console.log(`   ✅ PASS`);
        return true;
    }
}

async function runTests() {
    let passed = 0;
    let failed = 0;
    
    // Test queries WITHOUT year - should NOT have year in result
    const noYearQueries = [
        'blockchain projects',
        'AI chatbot',
        'healthcare monitoring',
        'cloud computing',
        'Find blockchain ideas'
    ];
    
    for (const q of noYearQueries) {
        if (await testQuery(q, false)) passed++; else failed++;
    }
    
    // Test queries WITH year - should have year in result
    const withYearQueries = [
        'blockchain 2024',
        'AI projects from 2025',
        'ideas from 2024'
    ];
    
    for (const q of withYearQueries) {
        if (await testQuery(q, true)) passed++; else failed++;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(60));
}

runTests();
