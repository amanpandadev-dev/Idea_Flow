/**
 * ProSearch Service Integration Tests
 * Tests the core orchestration logic
 */

import { jest } from '@jest/globals';

// Mock dependencies before importing the service
const mockGenerateEmbeddingWithRetry = jest.fn();
const mockGetChromaClient = jest.fn();
const mockCreateConversation = jest.fn();
const mockLoadConversation = jest.fn();
const mockUpdateConversation = jest.fn();
const mockExtractFilters = jest.fn();
const mockApplyFilters = jest.fn();
const mockGetEffectiveFilters = jest.fn();
const mockHydrateResults = jest.fn();

jest.unstable_mockModule('../services/embeddingService.js', () => ({
    generateEmbeddingWithRetry: mockGenerateEmbeddingWithRetry
}));

jest.unstable_mockModule('../config/chroma.js', () => ({
    getChromaClient: mockGetChromaClient
}));

jest.unstable_mockModule('../services/conversationStateManager.js', () => ({
    createConversation: mockCreateConversation,
    loadConversation: mockLoadConversation,
    updateConversation: mockUpdateConversation
}));

jest.unstable_mockModule('../services/filterExtractor.js', () => ({
    extractFilters: mockExtractFilters
}));

jest.unstable_mockModule('../services/filterApplicator.js', () => ({
    applyFilters: mockApplyFilters,
    getEffectiveFilters: mockGetEffectiveFilters
}));

jest.unstable_mockModule('../services/resultHydrator.js', () => ({
    hydrateResults: mockHydrateResults
}));

const { processChat, createNewConversation, processFollowUp } = await import('../services/prosearchService.js');

describe('ProSearch Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('processChat', () => {
        it('should route to createNewConversation when conversationId is null', async () => {
            // Setup mocks
            const mockEmbedding = new Array(768).fill(0.1);
            const mockCollection = {
                query: jest.fn().mockResolvedValue({
                    ids: [['idea_1', 'idea_2']],
                    metadatas: [[{ idea_id: 1 }, { idea_id: 2 }]]
                })
            };

            mockGenerateEmbeddingWithRetry.mockResolvedValue(mockEmbedding);
            mockGetChromaClient.mockReturnValue({
                getOrCreateCollection: jest.fn().mockResolvedValue(mockCollection)
            });
            mockCreateConversation.mockResolvedValue('test-uuid-123');
            mockHydrateResults.mockResolvedValue([
                { idea_id: 1, title: 'Test 1', matchScore: 1.0 },
                { idea_id: 2, title: 'Test 2', matchScore: 0.9 }
            ]);

            // Execute
            const result = await processChat(null, 'test query');

            // Verify
            expect(result.isNewBaseSearch).toBe(true);
            expect(result.conversationId).toBe('test-uuid-123');
            expect(result.results).toHaveLength(2);
            expect(mockGenerateEmbeddingWithRetry).toHaveBeenCalledWith('test query', expect.any(String));
        });

        it('should route to processFollowUp when conversationId is provided', async () => {
            // Setup mocks
            mockLoadConversation.mockResolvedValue({
                conversation_id: 'test-uuid-123',
                base_query: 'original query',
                base_result_ids: [1, 2, 3],
                current_result_ids: [1, 2, 3],
                applied_filters: {
                    technologies: [],
                    businessGroups: [],
                    themes: [],
                    years: []
                }
            });

            mockExtractFilters.mockReturnValue({
                technologies: ['Datadog'],
                businessGroups: [],
                themes: [],
                years: [],
                mode: 'ADD'
            });

            mockApplyFilters.mockResolvedValue([1, 2]);
            mockGetEffectiveFilters.mockReturnValue({
                technologies: ['Datadog'],
                businessGroups: [],
                themes: [],
                years: []
            });

            mockHydrateResults.mockResolvedValue([
                { idea_id: 1, title: 'Test 1', matchScore: 1.0 },
                { idea_id: 2, title: 'Test 2', matchScore: 0.9 }
            ]);

            // Execute
            const result = await processChat('test-uuid-123', 'show me Datadog projects');

            // Verify
            expect(result.isNewBaseSearch).toBe(false);
            expect(result.conversationId).toBe('test-uuid-123');
            expect(result.appliedFilters.technologies).toContain('Datadog');
            expect(mockLoadConversation).toHaveBeenCalledWith('test-uuid-123');
        });

        it('should throw error for empty message', async () => {
            await expect(processChat(null, '')).rejects.toThrow('message must be a non-empty string');
        });
    });

    describe('createNewConversation', () => {
        it('should perform semantic search and store conversation', async () => {
            // Setup mocks
            const mockEmbedding = new Array(768).fill(0.1);
            const mockCollection = {
                query: jest.fn().mockResolvedValue({
                    ids: [['idea_1', 'idea_2', 'idea_3']],
                    metadatas: [[{ idea_id: 1 }, { idea_id: 2 }, { idea_id: 3 }]]
                })
            };

            mockGenerateEmbeddingWithRetry.mockResolvedValue(mockEmbedding);
            mockGetChromaClient.mockReturnValue({
                getOrCreateCollection: jest.fn().mockResolvedValue(mockCollection)
            });
            mockCreateConversation.mockResolvedValue('new-uuid-456');
            mockHydrateResults.mockResolvedValue([
                { idea_id: 1, title: 'Idea 1', matchScore: 1.0 },
                { idea_id: 2, title: 'Idea 2', matchScore: 0.95 },
                { idea_id: 3, title: 'Idea 3', matchScore: 0.9 }
            ]);

            // Execute
            const result = await createNewConversation('AI projects');

            // Verify
            expect(mockGenerateEmbeddingWithRetry).toHaveBeenCalledTimes(1);
            expect(mockCreateConversation).toHaveBeenCalledWith('AI projects', [1, 2, 3]);
            expect(mockHydrateResults).toHaveBeenCalledWith([1, 2, 3], [1, 2, 3]);
            expect(result.conversationId).toBe('new-uuid-456');
            expect(result.isNewBaseSearch).toBe(true);
            expect(result.results).toHaveLength(3);
        });
    });

    describe('processFollowUp', () => {
        it('should load conversation, extract filters, and apply them', async () => {
            // Setup mocks
            const mockConversation = {
                conversation_id: 'existing-uuid',
                base_query: 'AI projects',
                base_result_ids: [1, 2, 3, 4, 5],
                current_result_ids: [1, 2, 3, 4, 5],
                applied_filters: {
                    technologies: [],
                    businessGroups: [],
                    themes: [],
                    years: []
                }
            };

            mockLoadConversation.mockResolvedValue(mockConversation);
            mockExtractFilters.mockReturnValue({
                technologies: ['Kubernetes'],
                businessGroups: ['Healthcare'],
                themes: [],
                years: [],
                mode: 'ADD'
            });

            mockApplyFilters.mockResolvedValue([2, 4]);
            mockGetEffectiveFilters.mockReturnValue({
                technologies: ['Kubernetes'],
                businessGroups: ['Healthcare'],
                themes: [],
                years: []
            });

            mockHydrateResults.mockResolvedValue([
                { idea_id: 2, title: 'Idea 2', matchScore: 0.95 },
                { idea_id: 4, title: 'Idea 4', matchScore: 0.85 }
            ]);

            // Execute
            const result = await processFollowUp('existing-uuid', 'Kubernetes in Healthcare');

            // Verify
            expect(mockLoadConversation).toHaveBeenCalledWith('existing-uuid');
            expect(mockExtractFilters).toHaveBeenCalledWith('Kubernetes in Healthcare');
            expect(mockApplyFilters).toHaveBeenCalledWith(
                [1, 2, 3, 4, 5],
                expect.objectContaining({ technologies: ['Kubernetes'] }),
                mockConversation.applied_filters,
                'ADD'
            );
            expect(mockUpdateConversation).toHaveBeenCalledWith(
                'existing-uuid',
                [2, 4],
                expect.objectContaining({ technologies: ['Kubernetes'] })
            );
            expect(result.isNewBaseSearch).toBe(false);
            expect(result.results).toHaveLength(2);
        });

        it('should throw error for non-existent conversation', async () => {
            mockLoadConversation.mockResolvedValue(null);

            await expect(processFollowUp('non-existent-uuid', 'test message'))
                .rejects.toThrow('Conversation not found');
        });
    });
});
