/**
 * Property-Based Test for Theme Extraction Structure
 * Feature: semantic-agent-integration, Property 5: Theme Extraction Structure
 * Validates: Requirements 1.6
 * 
 * Property: For any processed document, the extracted RAG data should contain
 * all required fields (themes, keywords, suggestedQuestions, topics, techStack, industry)
 * with non-empty arrays for valid documents.
 */

import 'dotenv/config';
import fc from 'fast-check';
import { extractThemesWithAI, extractThemesSimple } from '../services/documentService.js';

describe('Property 5: Theme Extraction Structure', () => {
  
  test('extractThemesWithAI should return complete RAG data structure for any valid text', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random document-like text with various characteristics
        fc.record({
          topics: fc.array(fc.constantFrom(
            'cloud computing', 'machine learning', 'artificial intelligence',
            'blockchain', 'cybersecurity', 'data science', 'IoT', 'DevOps',
            'microservices', 'serverless', 'edge computing', 'quantum computing'
          ), { minLength: 1, maxLength: 5 }),
          technologies: fc.array(fc.constantFrom(
            'Docker', 'Kubernetes', 'AWS', 'Azure', 'React', 'Node.js',
            'Python', 'TensorFlow', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka'
          ), { minLength: 0, maxLength: 5 }),
          industries: fc.array(fc.constantFrom(
            'healthcare', 'finance', 'retail', 'manufacturing', 'education',
            'telecommunications', 'automotive', 'energy'
          ), { minLength: 0, maxLength: 3 }),
          sentences: fc.array(
            fc.string({ minLength: 20, maxLength: 100 }),
            { minLength: 5, maxLength: 20 }
          )
        }).map(({ topics, technologies, industries, sentences }) => {
          // Construct a realistic document text
          const topicText = topics.join(', ');
          const techText = technologies.length > 0 ? `Technologies include ${technologies.join(', ')}.` : '';
          const industryText = industries.length > 0 ? `This is relevant for ${industries.join(', ')} industries.` : '';
          const bodyText = sentences.join(' ');
          
          return `This document discusses ${topicText}. ${techText} ${industryText} ${bodyText}`;
        }),
        async (documentText) => {
          // Extract themes using AI (with fallback to simple extraction)
          const result = await extractThemesWithAI(documentText);
          
          // Verify all required fields exist
          expect(result).toBeDefined();
          expect(result).toHaveProperty('themes');
          expect(result).toHaveProperty('keywords');
          expect(result).toHaveProperty('suggestedQuestions');
          expect(result).toHaveProperty('topics');
          expect(result).toHaveProperty('techStack');
          expect(result).toHaveProperty('industry');
          
          // Verify all fields are arrays
          expect(Array.isArray(result.themes)).toBe(true);
          expect(Array.isArray(result.keywords)).toBe(true);
          expect(Array.isArray(result.suggestedQuestions)).toBe(true);
          expect(Array.isArray(result.topics)).toBe(true);
          expect(Array.isArray(result.techStack)).toBe(true);
          expect(Array.isArray(result.industry)).toBe(true);
          
          // For valid documents with content, arrays should be non-empty
          // At minimum, we should have themes and keywords
          expect(result.themes.length).toBeGreaterThan(0);
          expect(result.keywords.length).toBeGreaterThan(0);
          
          // Suggested questions should have at least 5 items (as per requirement 1.7)
          expect(result.suggestedQuestions.length).toBeGreaterThanOrEqual(5);
          
          // Verify data types of array elements
          result.themes.forEach(theme => {
            expect(typeof theme).toBe('string');
            expect(theme.length).toBeGreaterThan(0);
          });
          
          result.keywords.forEach(keyword => {
            expect(typeof keyword).toBe('string');
            expect(keyword.length).toBeGreaterThan(0);
          });
          
          result.suggestedQuestions.forEach(question => {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
          });
          
          // Topics, techStack, and industry can be empty but must be arrays
          result.topics.forEach(topic => {
            expect(typeof topic).toBe('string');
          });
          
          result.techStack.forEach(tech => {
            expect(typeof tech).toBe('string');
          });
          
          result.industry.forEach(ind => {
            expect(typeof ind).toBe('string');
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 180000); // 3 minute timeout for API calls with 100 runs

  test('extractThemesSimple should return complete RAG data structure for any valid text', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random text with words
        fc.array(
          fc.string({ minLength: 3, maxLength: 15 }),
          { minLength: 50, maxLength: 200 }
        ).map(words => words.join(' ')),
        async (documentText) => {
          // Extract themes using simple extraction
          const result = extractThemesSimple(documentText);
          
          // Verify all required fields exist
          expect(result).toBeDefined();
          expect(result).toHaveProperty('themes');
          expect(result).toHaveProperty('keywords');
          expect(result).toHaveProperty('suggestedQuestions');
          expect(result).toHaveProperty('topics');
          expect(result).toHaveProperty('techStack');
          expect(result).toHaveProperty('industry');
          
          // Verify all fields are arrays
          expect(Array.isArray(result.themes)).toBe(true);
          expect(Array.isArray(result.keywords)).toBe(true);
          expect(Array.isArray(result.suggestedQuestions)).toBe(true);
          expect(Array.isArray(result.topics)).toBe(true);
          expect(Array.isArray(result.techStack)).toBe(true);
          expect(Array.isArray(result.industry)).toBe(true);
          
          // Simple extraction should always return 5 suggested questions
          expect(result.suggestedQuestions.length).toBe(5);
          
          // Verify data types
          result.themes.forEach(theme => {
            expect(typeof theme).toBe('string');
          });
          
          result.keywords.forEach(keyword => {
            expect(typeof keyword).toBe('string');
          });
          
          result.suggestedQuestions.forEach(question => {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 1 minute timeout

  test('extractThemesSimple should handle empty text gracefully', () => {
    const result = extractThemesSimple('');
    
    // Verify structure exists even for empty input
    expect(result).toBeDefined();
    expect(result).toHaveProperty('themes');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('suggestedQuestions');
    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('techStack');
    expect(result).toHaveProperty('industry');
    
    // All should be arrays
    expect(Array.isArray(result.themes)).toBe(true);
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(Array.isArray(result.suggestedQuestions)).toBe(true);
    expect(Array.isArray(result.topics)).toBe(true);
    expect(Array.isArray(result.techStack)).toBe(true);
    expect(Array.isArray(result.industry)).toBe(true);
    
    // For empty text, arrays should be empty
    expect(result.themes).toEqual([]);
    expect(result.keywords).toEqual([]);
    expect(result.suggestedQuestions).toEqual([]);
    expect(result.topics).toEqual([]);
    expect(result.techStack).toEqual([]);
    expect(result.industry).toEqual([]);
  });

  test('extractThemesWithAI should handle empty text gracefully', async () => {
    const result = await extractThemesWithAI('');
    
    // Verify structure exists even for empty input
    expect(result).toBeDefined();
    expect(result).toHaveProperty('themes');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('suggestedQuestions');
    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('techStack');
    expect(result).toHaveProperty('industry');
    
    // All should be arrays
    expect(Array.isArray(result.themes)).toBe(true);
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(Array.isArray(result.suggestedQuestions)).toBe(true);
    expect(Array.isArray(result.topics)).toBe(true);
    expect(Array.isArray(result.techStack)).toBe(true);
    expect(Array.isArray(result.industry)).toBe(true);
  }, 15000);
});
