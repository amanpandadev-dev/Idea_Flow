// Test script for Gemini to Ollama fallback behavior
// Verifies that when Gemini fails, the system falls back to Ollama

import 'dotenv/config';
import { getEmbeddingVector } from '../services/embeddingProvider.js';

async function testFallback() {
  console.log('='.repeat(60));
  console.log('Gemini to Ollama Fallback Test');
  console.log('='.repeat(60));
  console.log();

  const testText = "Testing fallback from Gemini to Ollama";
  console.log(`Test text: "${testText}"`);
  console.log();

  // Test 1: Try Gemini (should fallback to Ollama if API key is invalid)
  console.log('Test 1: Gemini with Fallback to Ollama');
  console.log('-'.repeat(60));
  
  try {
    const startTime = Date.now();
    const embedding = await getEmbeddingVector(testText, 'gemini');
    const duration = Date.now() - startTime;
    
    console.log(`✅ Success! Generated embedding in ${duration}ms`);
    console.log(`   Dimension: ${embedding.length}`);
    console.log(`   Preview: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`   Note: If Gemini failed, this is from Ollama fallback`);
  } catch (error) {
    console.error(`❌ Both Gemini and Ollama failed: ${error.message}`);
    console.error('   Make sure Ollama is running: ollama serve');
  }
  console.log();

  // Test 2: Direct Ollama test
  console.log('Test 2: Direct Ollama Test');
  console.log('-'.repeat(60));
  
  try {
    const startTime = Date.now();
    const embedding = await getEmbeddingVector(testText, 'llama');
    const duration = Date.now() - startTime;
    
    console.log(`✅ Success! Generated Ollama embedding in ${duration}ms`);
    console.log(`   Dimension: ${embedding.length}`);
    console.log(`   Preview: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
  } catch (error) {
    console.error(`❌ Ollama test failed: ${error.message}`);
    console.error('   Make sure Ollama is running: ollama serve');
    console.error('   And the model is installed: ollama pull nomic-embed-text');
  }
  console.log();

  console.log('='.repeat(60));
  console.log('Fallback Test Complete');
  console.log('='.repeat(60));
}

testFallback().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
