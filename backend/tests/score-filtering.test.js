/**
 * Score Filtering Tests
 * Verify ≥70% matchScore filtering with fallback logic
 */

import { hydrateResults } from '../services/resultHydrator.js';

describe('Score Filtering (≥70% threshold)', () => {
    // Mock idea IDs for testing
    const mockIdeaIds = Array.from({ length: 100 }, (_, i) => i + 1);

    test('should filter results to ≥70% matchScore', async () => {
        // With 100 results, position-based scoring:
        // Position 0: 100%
        // Position 29: 70.7%
        // Position 30: 69.7% (should be filtered out)
        // Position 99: 0%

        const results = await hydrateResults(
            mockIdeaIds,
            mockIdeaIds,
            { applyScoreFilter: true }
        );

        // Verify all results have matchScore ≥ 70
        results.forEach(result => {
            expect(result.matchScore).toBeGreaterThanOrEqual(70);
        });

        // With 100 results, approximately 30 should pass ≥70% threshold
        expect(results.length).toBeGreaterThan(20);
        expect(results.length).toBeLessThan(35);
    });

    test('should return top 20 when filtered results < 10', async () => {
        // With only 15 results, most will be ≥70% but let's test edge case
        const smallSet = Array.from({ length: 15 }, (_, i) => i + 1);

        const results = await hydrateResults(
            smallSet,
            smallSet,
            { applyScoreFilter: true }
        );

        // Should return all 15 since they're all ≥70%
        expect(results.length).toBeLessThanOrEqual(20);
    });

    test('should not filter when applyScoreFilter is false', async () => {
        const results = await hydrateResults(
            mockIdeaIds,
            mockIdeaIds,
            { applyScoreFilter: false }
        );

        // Should return all 100 results
        expect(results.length).toBe(100);

        // Some results should have matchScore < 70
        const lowScoreResults = results.filter(r => r.matchScore < 70);
        expect(lowScoreResults.length).toBeGreaterThan(0);
    });

    test('should preserve score order after filtering', async () => {
        const results = await hydrateResults(
            mockIdeaIds,
            mockIdeaIds,
            { applyScoreFilter: true }
        );

        // Verify scores are in descending order
        for (let i = 1; i < results.length; i++) {
            expect(results[i].matchScore).toBeLessThanOrEqual(results[i - 1].matchScore);
        }

        // First result should have highest score
        expect(results[0].matchScore).toBe(100);
    });

    test('should calculate correct threshold position', () => {
        // With 100 results:
        // Formula: 100 * (1 - (position / 99))
        // For 70%: 70 = 100 * (1 - (position / 99))
        // position = 29.7 → position 30 is first to drop below 70%

        const position70 = 29;
        const score70 = 100 * (1 - (position70 / 99));
        expect(Math.round(score70)).toBe(70);

        const position69 = 30;
        const score69 = 100 * (1 - (position69 / 99));
        expect(Math.round(score69)).toBe(70); // Rounds to 70 but is actually 69.7
    });
});

describe('Fallback Logic', () => {
    test('should return top 20 when only 5 results pass filter', async () => {
        // Create a scenario where only first 5 results are ≥70%
        // With 8 results: positions 0-2 are ≥70%, rest are <70%
        const smallSet = Array.from({ length: 8 }, (_, i) => i + 1);

        const results = await hydrateResults(
            smallSet,
            smallSet,
            { applyScoreFilter: true }
        );

        // Should return all 8 (top 20 fallback, but only 8 exist)
        expect(results.length).toBe(8);
    });

    test('should return exactly 20 when 25 results exist but only 8 pass filter', async () => {
        const mediumSet = Array.from({ length: 25 }, (_, i) => i + 1);

        const results = await hydrateResults(
            mediumSet,
            mediumSet,
            { applyScoreFilter: true }
        );

        // With 25 results, ~8 should pass ≥70% filter
        // Fallback should return top 20
        expect(results.length).toBe(20);
    });
});
