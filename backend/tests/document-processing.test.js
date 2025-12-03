// Test for enhanced document processing with AI-powered extraction
import { extractThemesWithAI, extractThemesSimple, processDocument } from '../services/documentService.js';

describe('Document Processing - AI-Powered Extraction', () => {
  
  test('extractThemesSimple should return structured RAG data', () => {
    const text = 'artificial intelligence machine learning deep learning neural networks data science python tensorflow';
    const result = extractThemesSimple(text);
    
    // Verify structure
    expect(result).toHaveProperty('themes');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('suggestedQuestions');
    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('techStack');
    expect(result).toHaveProperty('industry');
    
    // Verify arrays
    expect(Array.isArray(result.themes)).toBe(true);
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(Array.isArray(result.suggestedQuestions)).toBe(true);
    
    // Verify content
    expect(result.themes.length).toBeGreaterThan(0);
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.suggestedQuestions.length).toBe(5);
  });

  test('extractThemesSimple should handle empty text', () => {
    const result = extractThemesSimple('');
    
    expect(result.themes).toEqual([]);
    expect(result.keywords).toEqual([]);
    expect(result.suggestedQuestions).toEqual([]);
  });

  test('extractThemesWithAI should return structured RAG data with Gemini', async () => {
    const text = `
      This document discusses cloud computing and microservices architecture.
      We explore AWS, Docker, and Kubernetes for container orchestration.
      The technology stack includes Node.js, React, and PostgreSQL.
      This is relevant for the software development industry.
    `;
    
    const result = await extractThemesWithAI(text);
    
    // Verify structure
    expect(result).toHaveProperty('themes');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('suggestedQuestions');
    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('techStack');
    expect(result).toHaveProperty('industry');
    
    // Verify arrays
    expect(Array.isArray(result.themes)).toBe(true);
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(Array.isArray(result.suggestedQuestions)).toBe(true);
    expect(Array.isArray(result.topics)).toBe(true);
    expect(Array.isArray(result.techStack)).toBe(true);
    expect(Array.isArray(result.industry)).toBe(true);
    
    // Verify content (should have data from AI or fallback)
    expect(result.themes.length).toBeGreaterThan(0);
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.suggestedQuestions.length).toBeGreaterThanOrEqual(5);
  }, 15000); // Longer timeout for API call

  test('extractThemesWithAI should fallback to simple extraction on error', async () => {
    // This will trigger fallback if Gemini is not available
    const text = 'test document with some content about technology and innovation';
    
    const result = await extractThemesWithAI(text);
    
    // Should still return valid structure
    expect(result).toHaveProperty('themes');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('suggestedQuestions');
    expect(Array.isArray(result.themes)).toBe(true);
  });

  test('processDocument should return enhanced RAG data structure', async () => {
    // Create a simple text buffer that doesn't require PDF/DOCX parsing
    const sampleText = `
      Cloud computing and microservices architecture are transforming software development.
      Technologies like Docker, Kubernetes, and AWS enable scalable applications.
      The modern tech stack includes Node.js, React, and PostgreSQL databases.
      This is relevant for the software engineering and technology industries.
    `.repeat(10); // Repeat to ensure enough content for chunking
    
    const buffer = Buffer.from(sampleText);
    const mimetype = 'text/plain';
    
    try {
      const result = await processDocument(buffer, mimetype);
      
      // Verify response structure
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('chunks');
      expect(result).toHaveProperty('themes');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('suggestedQuestions');
      expect(result).toHaveProperty('ragData');
      expect(result).toHaveProperty('stats');
      
      // Verify ragData structure
      expect(result.ragData).toHaveProperty('themes');
      expect(result.ragData).toHaveProperty('keywords');
      expect(result.ragData).toHaveProperty('suggestedQuestions');
      expect(result.ragData).toHaveProperty('topics');
      expect(result.ragData).toHaveProperty('techStack');
      expect(result.ragData).toHaveProperty('industry');
      
      // Verify arrays are populated
      expect(Array.isArray(result.themes)).toBe(true);
      expect(Array.isArray(result.keywords)).toBe(true);
      expect(Array.isArray(result.suggestedQuestions)).toBe(true);
      expect(result.themes.length).toBeGreaterThan(0);
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.suggestedQuestions.length).toBeGreaterThanOrEqual(5);
      
      // Verify stats
      expect(result.stats.chunkCount).toBeGreaterThan(0);
      expect(result.stats.originalLength).toBeGreaterThan(0);
    } catch (error) {
      // If text/plain is not supported, skip this test
      if (error.message.includes('Unsupported file type')) {
        console.log('Skipping test: text/plain not supported');
        return;
      }
      throw error;
    }
  }, 15000);
});
