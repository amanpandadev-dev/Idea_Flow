/**
 * Property-Based Test for Embedding Dimension Consistency
 * Feature: semantic-agent-integration, Property 3: Embedding Dimension Consistency
 * Validates: Requirements 1.4
 * 
 * Property: For any set of text chunks processed with the same embedding provider,
 * all generated embeddings should have identical dimensions.
 */

import 'dotenv/config';
import fc from 'fast-check';
import { generateEmbeddings } from '../services/embeddingService.js';

describe('Property 3: Embedding Dimension Consistency', () => {
  // Test with Gemini provider
  test('embeddings should have consistent dimensions for Gemini provider', async () => {
    // Skip if API key is not configured
    if (!process.env.API_KEY || process.env.API_KEY === 'your-google-genai-api-key-here') {
      console.warn('⚠️  Skipping Gemini test: API_KEY not configured');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 10, maxLength: 100 }),
          { minLength: 2, maxLength: 5 }
        ),
        async (texts) => {
          // Generate embeddings for all texts
          const embeddings = await generateEmbeddings(texts, 'gemini');
          
          // All embeddings should exist
          expect(embeddings).toBeDefined();
          expect(embeddings.length).toBe(texts.length);
          
          // Get the dimension of the first embedding
          const firstDimension = embeddings[0].length;
          expect(firstDimension).toBeGreaterThan(0);
          
          // All embeddings should have the same dimension
          embeddings.forEach((embedding, index) => {
            expect(embedding).toBeDefined();
            expect(Array.isArray(embedding)).toBe(true);
            expect(embedding.length).toBe(firstDimension);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000); // 2 minute timeout for API calls

  // Test with Llama provider (local Ollama)
  test('embeddings should have consistent dimensions for Llama provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 10, maxLength: 100 }),
          { minLength: 2, maxLength: 5 }
        ),
        async (texts) => {
          try {
            // Generate embeddings for all texts
            const embeddings = await generateEmbeddings(texts, 'llama');
            
            // All embeddings should exist
            expect(embeddings).toBeDefined();
            expect(embeddings.length).toBe(texts.length);
            
            // Get the dimension of the first embedding
            const firstDimension = embeddings[0].length;
            expect(firstDimension).toBeGreaterThan(0);
            
            // All embeddings should have the same dimension
            embeddings.forEach((embedding, index) => {
              expect(embedding).toBeDefined();
              expect(Array.isArray(embedding)).toBe(true);
              expect(embedding.length).toBe(firstDimension);
            });
          } catch (error) {
            // If Ollama is not running, skip this test
            if (error.message.includes('ECONNREFUSED') || error.message.includes('Ollama')) {
              console.warn('⚠️  Skipping Llama test: Ollama not available');
              return;
            }
            throw error;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);

  // Test with Grok provider (OpenRouter)
  test('embeddings should have consistent dimensions for Grok provider', async () => {
    // Skip if API key is not configured
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-api-key') {
      console.warn('⚠️  Skipping Grok test: OPENROUTER_API_KEY not configured');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 10, maxLength: 100 }),
          { minLength: 2, maxLength: 5 }
        ),
        async (texts) => {
          // Generate embeddings for all texts
          const embeddings = await generateEmbeddings(texts, 'grok');
          
          // All embeddings should exist
          expect(embeddings).toBeDefined();
          expect(embeddings.length).toBe(texts.length);
          
          // Get the dimension of the first embedding
          const firstDimension = embeddings[0].length;
          expect(firstDimension).toBeGreaterThan(0);
          
          // All embeddings should have the same dimension
          embeddings.forEach((embedding, index) => {
            expect(embedding).toBeDefined();
            expect(Array.isArray(embedding)).toBe(true);
            expect(embedding.length).toBe(firstDimension);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
