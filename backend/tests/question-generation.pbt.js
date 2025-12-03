/**
 * Property-Based Test for Question Generation Count
 * Feature: semantic-agent-integration, Property 6: Question Generation Count
 * Validates: Requirements 1.7
 * 
 * Property: For any document with extracted themes, the number of generated
 * suggested questions should be between 5 and 8, and all questions should
 * end with a question mark.
 */

import 'dotenv/config';
import fc from 'fast-check';
import { extractThemesWithAI, extractThemesSimple } from '../services/documentService.js';

describe('Property 6: Question Generation Count', () => {
  
  test('extractThemesWithAI should generate 5-8 questions for any valid document', async () => {
    // Skip if API key is not configured
    if (!process.env.API_KEY || process.env.API_KEY === 'your-google-genai-api-key-here') {
      console.warn('⚠️  Skipping Gemini test: API_KEY not configured');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate random document-like text with various characteristics
        fc.record({
          topics: fc.array(fc.constantFrom(
            'cloud computing', 'machine learning', 'artificial intelligence',
            'blockchain', 'cybersecurity', 'data science', 'IoT', 'DevOps',
            'microservices', 'serverless', 'edge computing', 'quantum computing',
            'digital transformation', 'automation', 'analytics', 'innovation'
          ), { minLength: 1, maxLength: 5 }),
          technologies: fc.array(fc.constantFrom(
            'Docker', 'Kubernetes', 'AWS', 'Azure', 'React', 'Node.js',
            'Python', 'TensorFlow', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka',
            'Jenkins', 'Git', 'Terraform', 'Ansible'
          ), { minLength: 0, maxLength: 5 }),
          industries: fc.array(fc.constantFrom(
            'healthcare', 'finance', 'retail', 'manufacturing', 'education',
            'telecommunications', 'automotive', 'energy', 'logistics', 'media'
          ), { minLength: 0, maxLength: 3 }),
          sentences: fc.array(
            fc.string({ minLength: 20, maxLength: 100 }),
            { minLength: 10, maxLength: 30 }
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
          // Extract themes using AI
          const result = await extractThemesWithAI(documentText);
          
          // Verify suggestedQuestions exists and is an array
          expect(result).toBeDefined();
          expect(result).toHaveProperty('suggestedQuestions');
          expect(Array.isArray(result.suggestedQuestions)).toBe(true);
          
          // Property 6: Number of questions should be between 5 and 8
          expect(result.suggestedQuestions.length).toBeGreaterThanOrEqual(5);
          expect(result.suggestedQuestions.length).toBeLessThanOrEqual(8);
          
          // All questions should be non-empty strings
          result.suggestedQuestions.forEach(question => {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
            
            // All questions should end with a question mark
            expect(question.trim().endsWith('?')).toBe(true);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 180000); // 3 minute timeout for API calls with 100 runs

  test('extractThemesSimple should generate exactly 5 questions', async () => {
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
          
          // Verify suggestedQuestions exists and is an array
          expect(result).toBeDefined();
          expect(result).toHaveProperty('suggestedQuestions');
          expect(Array.isArray(result.suggestedQuestions)).toBe(true);
          
          // Simple extraction should always return exactly 5 questions
          expect(result.suggestedQuestions.length).toBe(5);
          
          // All questions should be non-empty strings ending with question mark
          result.suggestedQuestions.forEach(question => {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
            expect(question.trim().endsWith('?')).toBe(true);
          });
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 1 minute timeout

  test('extractThemesWithAI should handle edge case: very short text', async () => {
    // Skip if API key is not configured
    if (!process.env.API_KEY || process.env.API_KEY === 'your-google-genai-api-key-here') {
      console.warn('⚠️  Skipping Gemini test: API_KEY not configured');
      return;
    }

    const shortText = 'Innovation in technology.';
    const result = await extractThemesWithAI(shortText);
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('suggestedQuestions');
    expect(Array.isArray(result.suggestedQuestions)).toBe(true);
    
    // Even for short text, should generate 5-8 questions
    expect(result.suggestedQuestions.length).toBeGreaterThanOrEqual(5);
    expect(result.suggestedQuestions.length).toBeLessThanOrEqual(8);
    
    result.suggestedQuestions.forEach(question => {
      expect(typeof question).toBe('string');
      expect(question.length).toBeGreaterThan(0);
      expect(question.trim().endsWith('?')).toBe(true);
    });
  }, 15000);

  test('extractThemesSimple should handle empty text gracefully', () => {
    const result = extractThemesSimple('');
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('suggestedQuestions');
    expect(Array.isArray(result.suggestedQuestions)).toBe(true);
    
    // For empty text, should return empty array
    expect(result.suggestedQuestions).toEqual([]);
  });
});
