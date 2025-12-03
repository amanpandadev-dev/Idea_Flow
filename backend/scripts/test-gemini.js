#!/usr/bin/env node

/**
 * Test script to verify Gemini API key and model configuration
 * Run: node backend/scripts/test-gemini.js
 */

import gemini from '../config/gemini.js';

(async () => {
  console.log('\n🧪 Testing Gemini Configuration...\n');

  try {
    // Check if Gemini is available
    if (!gemini.isGeminiAvailable()) {
      console.error('❌ Gemini not initialized. Check API_KEY env var.');
      console.error('   Set API_KEY in your .env file or environment variables.');
      process.exit(1);
    }

    // Get model names
    const models = gemini.getModelNames();
    console.log('📋 Configured Models:');
    console.log(`   - Generation: ${models.generation}`);
    console.log(`   - Embedding: ${models.embedding}\n`);

    // Test text generation
    console.log('🔄 Testing text generation...');
    const testPrompt = 'Write a 2-line test message confirming Gemini 2.5 Flash-Lite access.';
    const output = await gemini.generateText(testPrompt, { 
      maxOutputTokens: 100,
      temperature: 0.7
    });

    console.log('\n✅ SUCCESS! Gemini is working correctly.\n');
    console.log('📝 Generated Output:');
    console.log('─'.repeat(50));
    console.log(output);
    console.log('─'.repeat(50));

    // Test embedding generation
    console.log('\n🔄 Testing embedding generation...');
    const embedding = await gemini.generateGeminiEmbedding('test embedding');
    console.log(`✅ Embedding generated successfully (${embedding.length} dimensions)\n`);

    console.log('🎉 All tests passed! Gemini is configured correctly.\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error?.message || error);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check your API_KEY in .env file');
    console.error('   2. Verify the model name is correct');
    console.error('   3. Ensure you have internet connection');
    console.error('   4. Check API key permissions at https://aistudio.google.com/\n');
    process.exit(1);
  }
})();
