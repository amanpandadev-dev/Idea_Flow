/**
 * Advanced Search Testing Script
 * Tests spell correction, query expansion, and hybrid ranking
 */

import { enhanceQuery, correctSpelling, expandQuery } from '../backend/services/nlpQueryProcessor.js';

console.log('\n🧪 Advanced Search System - Test Suite\n');
console.log('='.repeat(60));

// Test 1: Spell Correction
console.log('\n📝 Test 1: Spell Correction');
console.log('-'.repeat(60));

const misspelledWords = [
  'clodus',
  'custmer',
  'amatuer',
  'databse',
  'kubernets',
  'artifical',
  'machien',
  'bussiness'
];

misspelledWords.forEach(word => {
  const corrected = correctSpelling(word);
  const status = corrected !== word ? '✅' : '⚠️';
  console.log(`${status} "${word}" → "${corrected}"`);
});

// Test 2: Query Expansion
console.log('\n🔍 Test 2: Query Expansion');
console.log('-'.repeat(60));

const testQueries = [
  'monitoring',
  'banking',
  'hospital',
  'ai',
  'cloud',
  'security'
];

testQueries.forEach(query => {
  const expanded = expandQuery([query]);
  console.log(`\n"${query}" expanded to:`);
  console.log(`  ${expanded.slice(0, 5).join(', ')}...`);
  console.log(`  (${expanded.length} total terms)`);
});

// Test 3: Full Query Processing
console.log('\n\n🧠 Test 3: Full Query Processing (Rule-Based)');
console.log('-'.repeat(60));

const complexQueries = [
  'clodus monitoring for hospitals',
  'custmer managment system',
  'ai chatbot for banking apps',
  'databse for healthcare',
  'monitoring system'
];

for (const query of complexQueries) {
  console.log(`\n📥 Input: "${query}"`);
  const result = await enhanceQuery(query, { useAI: false });
  console.log(`📤 Corrected: "${result.corrected}"`);
  console.log(`🔢 Expanded terms: ${result.expanded.length}`);
  console.log(`   Sample: ${result.expanded.slice(0, 8).join(', ')}...`);
}

// Test 4: AI-Enhanced Processing (if API key available)
console.log('\n\n🤖 Test 4: AI-Enhanced Processing');
console.log('-'.repeat(60));

const apiKey = process.env.API_KEY;

if (apiKey) {
  console.log('✅ API Key found - Testing AI enhancement\n');
  
  const aiTestQueries = [
    'monitoring system for hospitals',
    'banking apps for custmers',
    'clodus databse'
  ];
  
  for (const query of aiTestQueries) {
    console.log(`\n📥 Input: "${query}"`);
    try {
      const result = await enhanceQuery(query, { useAI: true, apiKey });
      console.log(`📤 AI Enhanced: "${result.corrected}"`);
      console.log(`🔢 Expanded terms: ${result.expanded.length}`);
      console.log(`   ${result.expanded.slice(0, 10).join(', ')}...`);
      console.log(`✨ AI Enhanced: ${result.aiEnhanced ? 'Yes' : 'No'}`);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
} else {
  console.log('⚠️  No API Key - Skipping AI tests');
  console.log('   Set API_KEY environment variable to test AI features');
}

// Test 5: Performance Benchmark
console.log('\n\n⚡ Test 5: Performance Benchmark');
console.log('-'.repeat(60));

const benchmarkQueries = [
  'cloud',
  'monitoring system',
  'ai chatbot for customer support',
  'healthcare management system with analytics'
];

for (const query of benchmarkQueries) {
  const start = Date.now();
  const result = await enhanceQuery(query, { useAI: false });
  const duration = Date.now() - start;
  
  console.log(`\n"${query}"`);
  console.log(`  ⏱️  Processing time: ${duration}ms`);
  console.log(`  📊 Terms: ${query.split(' ').length} → ${result.expanded.length}`);
  console.log(`  🚀 Expansion ratio: ${(result.expanded.length / query.split(' ').length).toFixed(2)}x`);
}

// Summary
console.log('\n\n' + '='.repeat(60));
console.log('✅ Test Suite Complete!');
console.log('='.repeat(60));
console.log('\n📊 Summary:');
console.log(`  ✅ Spell correction: ${misspelledWords.length} words tested`);
console.log(`  ✅ Query expansion: ${testQueries.length} queries tested`);
console.log(`  ✅ Full processing: ${complexQueries.length} queries tested`);
console.log(`  ${apiKey ? '✅' : '⚠️ '} AI enhancement: ${apiKey ? 'Tested' : 'Skipped (no API key)'}`);
console.log(`  ✅ Performance: ${benchmarkQueries.length} benchmarks completed`);

console.log('\n💡 Next Steps:');
console.log('  1. Start the server: npm run server');
console.log('  2. Test the API: curl "http://localhost:3001/api/ideas/search?q=clodus+monitoring"');
console.log('  3. Check the documentation: ADVANCED_SEARCH_DOCUMENTATION.md');
console.log('\n');
