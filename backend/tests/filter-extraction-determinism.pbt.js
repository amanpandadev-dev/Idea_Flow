/**
 * Property-Based Tests for Filter Extraction Determinism
 * Feature: prosearch-rebuild
 * Tests that filter extraction is deterministic and produces consistent results
 */

import fc from 'fast-check';
import { extractFilters } from '../services/filterExtractor.js';

describe('Filter Extraction Determinism Property Tests', () => {
  /**
   * Feature: prosearch-rebuild, Property 4: Filter extraction determinism
   * Validates: Requirements 2.2, 4.1
   * 
   * Property: For any user message, running filter extraction multiple times
   * should produce identical results (same technologies, business groups, themes,
   * years, and mode).
   */
  test('Property 4: Filter extraction determinism', async () => {
    await fc.assert(
      fc.property(
        // Generate various user messages
        fc.oneof(
          // Simple messages
          fc.string({ minLength: 1, maxLength: 200 }),
          // Messages with known technologies
          fc.constantFrom(
            'show me Datadog projects',
            'I want to see Kubernetes ideas',
            'find Python and JavaScript projects',
            'show AI/ML projects',
            'Docker and AWS ideas'
          ),
          // Messages with business groups
          fc.constantFrom(
            'Healthcare projects only',
            'show Banking ideas',
            'ideas from Manufacturing',
            'Hi-Tech and Healthcare projects'
          ),
          // Messages with themes
          fc.constantFrom(
            'AI for Organization projects',
            'show FinOps ideas',
            'DevOps and MLOps projects',
            'Edge AI ideas'
          ),
          // Messages with years
          fc.constantFrom(
            'projects from 2024',
            'show 2023 ideas',
            'latest projects',
            '2021 to 2023 ideas',
            'ideas from 2022-2024'
          ),
          // Messages with modes
          fc.constantFrom(
            'only Healthcare projects',
            'exclude 2021 ideas',
            'remove Python projects',
            'add Kubernetes to the list',
            'also show Banking ideas'
          ),
          // Complex messages
          fc.constantFrom(
            'show me Kubernetes projects in Healthcare from 2024',
            'only Banking ideas with AI/ML from 2023',
            'exclude Python projects from Manufacturing',
            'add Datadog and Docker projects from latest year'
          )
        ),
        (message) => {
          // Extract filters multiple times
          const result1 = extractFilters(message);
          const result2 = extractFilters(message);
          const result3 = extractFilters(message);
          
          // Verify all extractions are identical
          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);
          
          // Verify structure is consistent
          expect(result1.technologies).toEqual(result2.technologies);
          expect(result1.businessGroups).toEqual(result2.businessGroups);
          expect(result1.themes).toEqual(result2.themes);
          expect(result1.years).toEqual(result2.years);
          expect(result1.mode).toBe(result2.mode);
          
          // Verify all fields are present
          expect(result1).toHaveProperty('technologies');
          expect(result1).toHaveProperty('businessGroups');
          expect(result1).toHaveProperty('themes');
          expect(result1).toHaveProperty('years');
          expect(result1).toHaveProperty('mode');
          
          // Verify types are correct
          expect(Array.isArray(result1.technologies)).toBe(true);
          expect(Array.isArray(result1.businessGroups)).toBe(true);
          expect(Array.isArray(result1.themes)).toBe(true);
          expect(Array.isArray(result1.years)).toBe(true);
          expect(typeof result1.mode).toBe('string');
          
          // Verify mode is one of the valid values
          expect(['ADD', 'REMOVE', 'REPLACE']).toContain(result1.mode);
        }
      ),
      { numRuns: 100 }
    );
  });
});
