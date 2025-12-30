/**
 * Integration test for resultHydrator service
 * Tests with real database connection
 */

import { hydrateResults } from '../services/resultHydrator.js';
import pg from 'pg';
const { Pool } = pg;

describe('resultHydrator integration tests', () => {
    let pool;
    let testIdeaIds = [];

    beforeAll(async () => {
        // Set up database connection
        pool = new Pool({
            connectionString: process.env.DATABASE_URL
        });

        // Get some real idea IDs from the database
        const result = await pool.query('SELECT idea_id FROM ideas LIMIT 5');
        testIdeaIds = result.rows.map(row => row.idea_id);
    });

    afterAll(async () => {
        await pool.end();
    });

    test('should hydrate results with complete metadata', async () => {
        if (testIdeaIds.length === 0) {
            console.log('No ideas in database, skipping test');
            return;
        }

        const results = await hydrateResults(testIdeaIds);

        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(testIdeaIds.length);

        // Verify each result has all required fields
        results.forEach(idea => {
            expect(idea).toHaveProperty('idea_id');
            expect(idea).toHaveProperty('title');
            expect(idea).toHaveProperty('summary');
            expect(idea).toHaveProperty('theme');
            expect(idea).toHaveProperty('business_group');
            expect(idea).toHaveProperty('technologies');
            expect(idea).toHaveProperty('year');
            expect(idea).toHaveProperty('matchScore');

            // Verify technologies is an array
            expect(Array.isArray(idea.technologies)).toBe(true);

            // Verify year is a valid number
            expect(typeof idea.year).toBe('number');
            expect(idea.year).toBeGreaterThan(2000);
            expect(idea.year).toBeLessThan(2100);

            // Verify matchScore is between 0 and 1
            expect(idea.matchScore).toBeGreaterThanOrEqual(0);
            expect(idea.matchScore).toBeLessThanOrEqual(1);
        });
    });

    test('should preserve order from ideaIds', async () => {
        if (testIdeaIds.length < 2) {
            console.log('Not enough ideas in database, skipping test');
            return;
        }

        // Reverse the order
        const reversedIds = [...testIdeaIds].reverse();
        const results = await hydrateResults(reversedIds);

        // Verify order is preserved
        results.forEach((idea, index) => {
            expect(idea.idea_id).toBe(reversedIds[index]);
        });
    });

    test('should calculate matchScore correctly based on position', async () => {
        if (testIdeaIds.length < 3) {
            console.log('Not enough ideas in database, skipping test');
            return;
        }

        const results = await hydrateResults(testIdeaIds);

        // First result should have highest score
        expect(results[0].matchScore).toBe(1.0);

        // Last result should have lowest score
        if (results.length > 1) {
            expect(results[results.length - 1].matchScore).toBeLessThan(results[0].matchScore);
        }

        // Scores should be in descending order
        for (let i = 1; i < results.length; i++) {
            expect(results[i].matchScore).toBeLessThanOrEqual(results[i - 1].matchScore);
        }
    });

    test('should handle missing ideas gracefully', async () => {
        // Mix real IDs with non-existent ones
        const mixedIds = [999999, ...testIdeaIds.slice(0, 2), 888888];
        const results = await hydrateResults(mixedIds);

        // Should only return existing ideas
        expect(results.length).toBeLessThanOrEqual(mixedIds.length);
        
        // All returned IDs should be from the input list
        results.forEach(idea => {
            expect(mixedIds).toContain(idea.idea_id);
        });
    });

    test('should parse technologies correctly', async () => {
        if (testIdeaIds.length === 0) {
            console.log('No ideas in database, skipping test');
            return;
        }

        const results = await hydrateResults(testIdeaIds);

        // Find an idea with technologies
        const ideaWithTech = results.find(idea => idea.technologies.length > 0);
        
        if (ideaWithTech) {
            // Verify technologies are strings
            ideaWithTech.technologies.forEach(tech => {
                expect(typeof tech).toBe('string');
                expect(tech.length).toBeGreaterThan(0);
            });
        }
    });
});
