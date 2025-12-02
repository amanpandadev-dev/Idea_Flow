#!/usr/bin/env node

/**
 * Test script for embedding providers (Llama/Ollama and Grok/OpenRouter)
 * 
 * Usage:
 *   node scripts/test-embeddings.js
 * 
 * Exit codes:
 *   0 - All tests passed
 *   1 - One or more tests failed
 */

import 'dotenv/config';
import { getEmbeddingVector } from '../backend/services/embeddingProvider.js';

const SAMPLE_TEXT = "This is a test sentence for embedding generation.";
let exitCode = 0;

console.log('═'.repeat(80));
console.log('  EMBEDDING PROVIDER TEST SUITE');
console.log('═'.repeat(80));
console.log(`\nSample text: "${SAMPLE_TEXT}"\n`);

// --- Test Llama (Local) Provider ---
async function testLlamaProvider() {
    console.log('─'.repeat(80));
    console.log('TEST 1: Llama (Local/Ollama) Provider');
    console.log('─'.repeat(80));

    try {
        const startTime = Date.now();
        const embedding = await getEmbeddingVector(SAMPLE_TEXT, 'llama');
        const duration = Date.now() - startTime;

        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new Error("Received an empty or invalid embedding vector");
        }

        console.log(`✅ SUCCESS!`);
        console.log(`   - Vector dimension: ${embedding.length}`);
        console.log(`   - Processing time: ${duration}ms`);
        console.log(`   - Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
        console.log(`   - Vector norm: ${Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)).toFixed(4)}`);

        return true;
    } catch (error) {
        console.error(`❌ FAILED: ${error.message}`);
        console.error(`   Ensure your local Ollama instance is running at ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`);
        console.error(`   Model: ${process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'}`);
        console.error(`   Start Ollama with: ollama serve`);
        exitCode = 1;
        return false;
    }
}

// --- Test Grok (OpenRouter) Provider ---
async function testGrokProvider() {
    console.log('\n' + '─'.repeat(80));
    console.log('TEST 2: Grok (OpenRouter) Provider');
    console.log('─'.repeat(80));

    // Check if API key is set
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-api-key') {
        console.error(`❌ SKIPPED: OPENROUTER_API_KEY is not set in .env file`);
        console.error(`   Get a free API key from: https://openrouter.ai/keys`);
        console.error(`   Add to .env: OPENROUTER_API_KEY=your-actual-key-here`);
        exitCode = 1;
        return false;
    }

    try {
        const startTime = Date.now();
        const embedding = await getEmbeddingVector(SAMPLE_TEXT, 'grok');
        const duration = Date.now() - startTime;

        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new Error("Received an empty or invalid embedding vector");
        }

        console.log(`✅ SUCCESS!`);
        console.log(`   - Vector dimension: ${embedding.length}`);
        console.log(`   - Processing time: ${duration}ms`);
        console.log(`   - Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
        console.log(`   - Vector norm: ${Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)).toFixed(4)}`);
        console.log(`   - API Key: ${process.env.OPENROUTER_API_KEY.substring(0, 8)}...`);

        return true;
    } catch (error) {
        console.error(`❌ FAILED: ${error.message}`);
        console.error(`   Verify your OPENROUTER_API_KEY is valid`);
        console.error(`   Check your API key at: https://openrouter.ai/keys`);
        exitCode = 1;
        return false;
    }
}

// --- Run Tests ---
async function runTests() {
    const llamaResult = await testLlamaProvider();
    const grokResult = await testGrokProvider();

    console.log('\n' + '═'.repeat(80));
    console.log('  TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log(`  Llama Provider:  ${llamaResult ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Grok Provider:   ${grokResult ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('═'.repeat(80));

    if (llamaResult && grokResult) {
        console.log('\n🎉 All tests passed! Both embedding providers are working correctly.\n');
    } else {
        console.log('\n⚠️  Some tests failed. Please review the errors above.\n');
    }

    process.exit(exitCode);
}

runTests();
