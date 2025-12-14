// Ollama-only embedding provider
// All embeddings now use local Llama models via Ollama

import 'dotenv/config';
import { generateOllamaEmbeddingWithRetry } from '../config/ollama.js';

/**
 * Get embedding vector using Ollama/Llama (768-dimensional)
 * This is now the ONLY embedding provider - Gemini and Grok have been removed
 * 
 * @param {string} text - The text to embed
 * @param {string} provider - Provider argument (ignored, always uses Llama)
 * @returns {Promise<number[]>} The 768-dimensional embedding vector
 */
export async function getEmbeddingVector(text, provider) {
  // Force Llama regardless of provider argument
  console.log(`\t-> Generating embedding using [llama/Ollama]...`);

  try {
    // Use Ollama with retry logic
    const embedding = await generateOllamaEmbeddingWithRetry(text, 3);

    // Validate dimension (should be 768 for nomic-embed-text)
    if (embedding.length !== 768) {
      console.warn(`⚠️  Warning: Embedding dimension is ${embedding.length}, expected 768`);
    }

    return embedding;
  } catch (error) {
    console.error('❌ Ollama embedding generation failed:', error.message);

    // Provide helpful error message
    if (error.message.includes('Cannot connect') || error.message.includes('ECONNREFUSED')) {
      throw new Error(
        'Cannot connect to Ollama. Please ensure Ollama is running:\n' +
        '  1. Install Ollama from https://ollama.ai/\n' +
        '  2. Run: ollama serve\n' +
        '  3. Pull model: ollama pull nomic-embed-text'
      );
    }

    throw error;
  }
}
