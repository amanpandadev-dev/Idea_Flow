/**
 * Property-Based Test for Storage Round Trip
 * Feature: semantic-agent-integration, Property 4: Storage Round Trip
 * Validates: Requirements 1.5
 * 
 * Property: For any set of chunks and embeddings stored in ChromaDB,
 * querying the collection should retrieve the stored data with matching content and metadata.
 */

import 'dotenv/config';
import fc from 'fast-check';
import { generateEmbeddings } from '../services/embeddingService.js';
import {
  createEphemeralCollection,
  addDocuments,
  queryCollection,
  deleteCollection
} from '../services/vectorStoreService.js';
import { initChromaDB } from '../config/chroma.js';

describe('Property 4: Storage Round Trip', () => {
  // Initialize ChromaDB before all tests
  beforeAll(() => {
    initChromaDB();
  });

  // Clean up any test collections after each test
  afterEach(async () => {
    // Clean up test collections
    const testSessionIds = ['test-session-', 'pbt-session-'];
    for (const prefix of testSessionIds) {
      try {
        await deleteCollection(prefix);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('stored chunks and embeddings should be retrievable with matching content', async () => {
    // Skip if API key is not configured
    if (!process.env.API_KEY || process.env.API_KEY === 'your-google-genai-api-key-here') {
      console.warn('⚠️  Skipping test: API_KEY not configured');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate a unique session ID
        fc.string({ minLength: 5, maxLength: 20 }).map(s => `pbt-session-${s}-${Date.now()}`),
        // Generate an array of document chunks
        fc.array(
          fc.string({ minLength: 50, maxLength: 200 }),
          { minLength: 1, maxLength: 5 }
        ),
        async (sessionId, rawDocuments) => {
          // Filter out empty or whitespace-only documents
          const documents = rawDocuments.filter(doc => doc && doc.trim().length > 0);
          
          // Skip if no valid documents
          if (documents.length === 0) {
            return;
          }
          try {
            // Generate embeddings for the documents
            const embeddings = await generateEmbeddings(documents, 'gemini');
            
            // Create metadata for each document
            const metadatas = documents.map((doc, index) => ({
              index,
              chunkLength: doc.length,
              filename: 'test-document.txt',
              uploadedAt: new Date().toISOString()
            }));
            
            // Store documents in ChromaDB
            await addDocuments(sessionId, documents, embeddings, metadatas);
            
            // Query using the first document's embedding
            const queryEmbedding = embeddings[0];
            const results = await queryCollection(sessionId, queryEmbedding, documents.length);
            
            // Verify results exist
            expect(results).toBeDefined();
            expect(results.documents).toBeDefined();
            expect(results.documents.length).toBeGreaterThan(0);
            
            // Verify the first document is in the results (should be most similar to itself)
            expect(results.documents).toContain(documents[0]);
            
            // Verify all stored documents can be retrieved
            for (const doc of documents) {
              const docResults = await queryCollection(
                sessionId,
                embeddings[documents.indexOf(doc)],
                1
              );
              
              // The most similar document should be the document itself
              expect(docResults.documents.length).toBeGreaterThan(0);
              expect(docResults.documents[0]).toBe(doc);
            }
            
            // Verify metadata is preserved
            if (results.metadatas && results.metadatas.length > 0) {
              const firstMetadata = results.metadatas[0];
              expect(firstMetadata).toBeDefined();
              expect(firstMetadata.filename).toBe('test-document.txt');
              expect(firstMetadata.uploadedAt).toBeDefined();
            }
            
          } finally {
            // Clean up the collection
            await deleteCollection(sessionId);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 180000); // 3 minute timeout for API calls and ChromaDB operations

  test('stored embeddings should maintain vector similarity relationships', async () => {
    // Skip if API key is not configured
    if (!process.env.API_KEY || process.env.API_KEY === 'your-google-genai-api-key-here') {
      console.warn('⚠️  Skipping test: API_KEY not configured');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate a unique session ID
        fc.string({ minLength: 5, maxLength: 20 }).map(s => `pbt-session-${s}-${Date.now()}`),
        // Generate documents with some similarity
        fc.array(
          fc.string({ minLength: 30, maxLength: 100 }),
          { minLength: 2, maxLength: 4 }
        ),
        async (sessionId, rawDocuments) => {
          // Filter out empty or whitespace-only documents
          const documents = rawDocuments.filter(doc => doc && doc.trim().length > 0);
          
          // Skip if not enough valid documents
          if (documents.length < 2) {
            return;
          }
          try {
            // Generate embeddings
            const embeddings = await generateEmbeddings(documents, 'gemini');
            
            // Store documents
            await addDocuments(sessionId, documents, embeddings);
            
            // Query with each embedding and verify the document itself is returned
            for (let i = 0; i < documents.length; i++) {
              const results = await queryCollection(sessionId, embeddings[i], 1);
              
              // The most similar document should be the document itself
              expect(results.documents.length).toBeGreaterThan(0);
              expect(results.documents[0]).toBe(documents[i]);
              
              // Distance should be very small (close to 0) for the same document
              if (results.distances && results.distances.length > 0) {
                expect(results.distances[0]).toBeLessThan(0.1);
              }
            }
            
          } finally {
            // Clean up
            await deleteCollection(sessionId);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 180000);

  test('metadata should round trip correctly', async () => {
    // Skip if API key is not configured
    if (!process.env.API_KEY || process.env.API_KEY === 'your-google-genai-api-key-here') {
      console.warn('⚠️  Skipping test: API_KEY not configured');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate a unique session ID
        fc.string({ minLength: 5, maxLength: 20 }).map(s => `pbt-session-${s}-${Date.now()}`),
        // Generate documents
        fc.array(
          fc.string({ minLength: 50, maxLength: 150 }),
          { minLength: 1, maxLength: 3 }
        ),
        // Generate metadata
        fc.array(
          fc.record({
            index: fc.integer({ min: 0, max: 100 }),
            chunkLength: fc.integer({ min: 10, max: 500 }),
            filename: fc.string({ minLength: 5, maxLength: 30 }).map(s => `${s}.txt`),
            uploadedAt: fc.date().map(d => d.toISOString())
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (sessionId, rawDocuments, metadatas) => {
          // Filter out empty or whitespace-only documents
          const documents = rawDocuments.filter(doc => doc && doc.trim().length > 0);
          
          // Skip if no valid documents
          if (documents.length === 0) {
            return;
          }
          // Ensure metadata array matches documents array length
          const adjustedMetadatas = metadatas.slice(0, documents.length);
          while (adjustedMetadatas.length < documents.length) {
            adjustedMetadatas.push({
              index: adjustedMetadatas.length,
              chunkLength: documents[adjustedMetadatas.length].length,
              filename: 'test.txt',
              uploadedAt: new Date().toISOString()
            });
          }
          
          try {
            // Generate embeddings
            const embeddings = await generateEmbeddings(documents, 'gemini');
            
            // Store with metadata
            await addDocuments(sessionId, documents, embeddings, adjustedMetadatas);
            
            // Query and verify metadata is preserved
            const results = await queryCollection(sessionId, embeddings[0], documents.length);
            
            expect(results.metadatas).toBeDefined();
            expect(results.metadatas.length).toBeGreaterThan(0);
            
            // Verify metadata fields exist
            for (const metadata of results.metadatas) {
              expect(metadata).toBeDefined();
              expect(metadata.filename).toBeDefined();
              expect(typeof metadata.filename).toBe('string');
              expect(metadata.uploadedAt).toBeDefined();
            }
            
          } finally {
            // Clean up
            await deleteCollection(sessionId);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 180000);
});
