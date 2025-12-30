/**
 * Unit tests for resultHydrator service
 * Tests: 7.1, 7.2, 7.3, 7.4
 */

import { hydrateResults } from '../services/resultHydrator.js';

describe('resultHydrator', () => {
    describe('hydrateResults', () => {
        test('should throw error if ideaIds is not an array', async () => {
            await expect(hydrateResults(null)).rejects.toThrow('ideaIds must be an array');
            await expect(hydrateResults('123')).rejects.toThrow('ideaIds must be an array');
            await expect(hydrateResults(123)).rejects.toThrow('ideaIds must be an array');
        });

        test('should return empty array for empty ideaIds', async () => {
            const result = await hydrateResults([]);
            expect(result).toEqual([]);
        });

        test('should fetch and hydrate ideas with all required fields', async () => {
            // This test requires a real database connection
            // Skip if DATABASE_URL is not set
            if (!process.env.DATABASE_URL) {
                console.log('Skipping test: DATABASE_URL not set');
                return;
            }

            // Use a small set of IDs that likely exist
            const ideaIds = [1, 2, 3];
            const result = await hydrateResults(ideaIds);

            // Verify structure of returned objects
            result.forEach(idea => {
                expect(idea).toHaveProperty('idea_id');
                expect(idea).toHaveProperty('title');
                expect(idea).toHaveProperty('summary');
                expect(idea).toHaveProperty('theme');
                expect(idea).toHaveProperty('business_group');
                expect(idea).toHaveProperty('technologies');
                expect(idea).toHaveProperty('year');
                expect(idea).toHaveProperty('matchScore');

                // Verify types
                expect(typeof idea.idea_id).toBe('number');
                expect(typeof idea.title).toBe('string');
                expect(typeof idea.summary).toBe('string');
                expect(typeof idea.theme).toBe('string');
                expect(typeof idea.business_group).toBe('string');
                expect(Array.isArray(idea.technologies)).toBe(true);
                expect(typeof idea.year).toBe('number');
                expect(typeof idea.matchScore).toBe('number');

                // Verify matchScore range
                expect(idea.matchScore).toBeGreaterThanOrEqual(0);
                expect(idea.matchScore).toBeLessThanOrEqual(1);
            });
        });

        test('should preserve order from input ideaIds', async () => {
            if (!process.env.DATABASE_URL) {
                console.log('Skipping test: DATABASE_URL not set');
                return;
            }

            const ideaIds = [3, 1, 2];
            const result = await hydrateResults(ideaIds);

            // Verify order is preserved
            const resultIds = result.map(idea => idea.idea_id);
            expect(resultIds).toEqual(ideaIds.filter(id => resultIds.includes(id)));
        });

        test('should calculate matchScore based on position in baseResultIds', async () => {
            if (!process.env.DATABASE_URL) {
                console.log('Skipping test: DATABASE_URL not set');
                return;
            }

            const ideaIds = [1, 2, 3];
            const baseResultIds = [1, 2, 3, 4, 5];
            const result = await hydrateResults(ideaIds, baseResultIds);

            // First idea should have highest score
            if (result.length > 1) {
                expect(result[0].matchScore).toBeGreaterThanOrEqual(result[1].matchScore);
            }
        });
    });
});
