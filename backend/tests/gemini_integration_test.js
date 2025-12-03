// Test script for Gemini 1.5 Flash integration
// Tests embedding generation, retry logic, and fallback behavior

import 'dotenv/config';
import { 
  initializeGemini, 
  isGeminiAvailable, 
  generateGeminiEmbedding,
  generateGeminiEmbeddingWithRetry,
  checkGeminiHealth,
  getModelNames
} from '../config/gemini.js';

async function runTests() {
  console.log('='.repeat(60));
  console.log('Gemini 1.5 Flash Integration Test Suite');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Initialization
  console.log('Test 1: Initialization');
  console.log('-'.repeat(60));
  const initialized = initializeGemini();
  console.log(`Initialization result: ${initialized ? '✅ Success' : '❌ Failed'}`);
  console.log(`Gemini available: ${isGeminiAvailable()}`);
  console.log();

  if (!isGeminiAvailable()) {
    console.log('⚠️  Gemini not available. Check API_KEY in .env file.');
    console.log('Skipping remaining tests.');
    return;
  }

  // Test 2: Model Configuration
  console.log('Test 2: Model Configuration');
  console.log('-'.repeat(60));
  const models = getModelNames();
  console.log(`Embedding model: ${models.embedding}`);
  console.log(`Generation model: ${models.generation}`);
  console.log();

  // Test 3: Health Check
  console.log('Test 3: Health Check');
  console.log('-'.repeat(60));
  try {
    const healthy = await checkGeminiHealth();
    console.log(`Health check: ${healthy ? '✅ Passed' : '❌ Failed'}`);
  } catch (error) {
    console.error(`❌ Health check error: ${error.message}`);
  }
  console.log();

  // Test 4: Basic Embedding Generation
  console.log('Test 4: Basic Embedding Generation');
  console.log('-'.repeat(60));
  const testText = "This is a test sentence for Gemini embedding generation.";
  console.log(`Test text: "${testText}"`);
  
  try {
    const startTime = Date.now();
    const embedding = await generateGeminiEmbedding(testText);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Success! Generated embedding in ${duration}ms`);
    console.log(`   Dimension: ${embedding.length}`);
    console.log(`   Preview: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`   Type check: ${Array.isArray(embedding) ? '✅ Array' : '❌ Not array'}`);
    console.log(`   All numbers: ${embedding.every(v => typeof v === 'number') ? '✅ Yes' : '❌ No'}`);
  } catch (error) {
    console.error(`❌ Embedding generation failed: ${error.message}`);
  }
  console.log();

  // Test 5: Embedding with Retry Logic
  console.log('Test 5: Embedding with Retry Logic');
  console.log('-'.repeat(60));
  
  try {
    const startTime = Date.now();
    const embedding = await generateGeminiEmbeddingWithRetry(testText, 3);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Success! Generated embedding with retry in ${duration}ms`);
    console.log(`   Dimension: ${embedding.length}`);
  } catch (error) {
    console.error(`❌ Retry embedding failed: ${error.message}`);
  }
  console.log();

  // Test 6: Empty Text Handling
  console.log('Test 6: Empty Text Handling');
  console.log('-'.repeat(60));
  
  try {
    await generateGeminiEmbedding('');
    console.error('❌ Should have thrown error for empty text');
  } catch (error) {
    console.log(`✅ Correctly rejected empty text: ${error.message}`);
  }
  console.log();

  // Test 7: Batch Embedding Consistency
  console.log('Test 7: Batch Embedding Consistency');
  console.log('-'.repeat(60));
  
  try {
    const texts = [
      "First test sentence",
      "Second test sentence",
      "Third test sentence"
    ];
    
    const embeddings = await Promise.all(
      texts.map(text => generateGeminiEmbedding(text))
    );
    
    const dimensions = embeddings.map(e => e.length);
    const allSameDimension = dimensions.every(d => d === dimensions[0]);
    
    console.log(`✅ Generated ${embeddings.length} embeddings`);
    console.log(`   Dimensions: ${dimensions.join(', ')}`);
    console.log(`   Consistency: ${allSameDimension ? '✅ All same dimension' : '❌ Inconsistent dimensions'}`);
  } catch (error) {
    console.error(`❌ Batch embedding failed: ${error.message}`);
  }
  console.log();

  console.log('='.repeat(60));
  console.log('Test Suite Complete');
  console.log('='.repeat(60));
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
