/**
 * ProSearch Routes Tests
 * Tests for the ProSearch API endpoint
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { jest } from '@jest/globals';

// Mock dependencies before importing the router
const mockProcessChat = jest.fn();
jest.unstable_mockModule('../services/prosearchService.js', () => ({
    processChat: mockProcessChat
}));

const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
};
jest.unstable_mockModule('../utils/logger.js', () => ({
    default: mockLogger
}));

// Import after mocking
const { default: router } = await import('../routes/prosearchRoutes.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const express = await import('express');

describe('ProSearch Routes', () => {
    let app;
    let request;

    beforeEach(async () => {
        // Create express app for testing
        app = express.default();
        app.use(express.json());
        app.use('/api/prosearch', router);
        
        // Add error handler middleware
        app.use(errorHandler);

        // Clear all mocks
        jest.clearAllMocks();

        // Dynamic import of supertest
        const supertest = await import('supertest');
        request = supertest.default(app);
    });

    describe('POST /api/prosearch/chat', () => {
        test('should accept valid new conversation request', async () => {
            const mockResponse = {
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                results: [],
                appliedFilters: {
                    technologies: [],
                    businessGroups: [],
                    themes: [],
                    years: []
                },
                isNewBaseSearch: true
            };

            mockProcessChat.mockResolvedValue(mockResponse);

            const response = await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId: null,
                    message: 'Find AI projects'
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockResponse);
            expect(mockProcessChat).toHaveBeenCalledWith(null, 'Find AI projects');
        });

        test('should accept valid follow-up request with UUID', async () => {
            const conversationId = '123e4567-e89b-12d3-a456-426614174000';
            const mockResponse = {
                conversationId,
                results: [],
                appliedFilters: {
                    technologies: ['Kubernetes'],
                    businessGroups: [],
                    themes: [],
                    years: []
                },
                isNewBaseSearch: false
            };

            mockProcessChat.mockResolvedValue(mockResponse);

            const response = await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId,
                    message: 'Show Kubernetes projects'
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockResponse);
            expect(mockProcessChat).toHaveBeenCalledWith(conversationId, 'Show Kubernetes projects');
        });

        test('should reject empty message', async () => {
            const response = await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId: null,
                    message: ''
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe(true);
            expect(response.body.message).toContain('non-empty string');
        });

        test('should reject missing message', async () => {
            const response = await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId: null
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe(true);
        });

        test('should reject invalid UUID format', async () => {
            const response = await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId: 'invalid-uuid',
                    message: 'Find projects'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe(true);
            expect(response.body.message).toContain('valid UUID');
        });

        test('should reject message that is too long', async () => {
            const longMessage = 'a'.repeat(1001);
            const response = await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId: null,
                    message: longMessage
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe(true);
            expect(response.body.message).toContain('too long');
        });

        test('should return 404 when conversation not found', async () => {
            mockProcessChat.mockRejectedValue(new Error('Conversation not found: 123'));

            const response = await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId: '123e4567-e89b-12d3-a456-426614174000',
                    message: 'Find projects'
                });

            expect(response.status).toBe(404);
            expect(response.body.error).toBe(true);
        });

        test('should return 503 when ChromaDB is unavailable', async () => {
            mockProcessChat.mockRejectedValue(new Error('ChromaDB connection failed'));

            const response = await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId: null,
                    message: 'Find projects'
                });

            expect(response.status).toBe(503);
            expect(response.body.error).toBe(true);
        });

        test('should trim whitespace from message', async () => {
            const mockResponse = {
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                results: [],
                appliedFilters: {
                    technologies: [],
                    businessGroups: [],
                    themes: [],
                    years: []
                },
                isNewBaseSearch: true
            };

            mockProcessChat.mockResolvedValue(mockResponse);

            await request
                .post('/api/prosearch/chat')
                .send({
                    conversationId: null,
                    message: '  Find AI projects  '
                });

            expect(mockProcessChat).toHaveBeenCalledWith(null, 'Find AI projects');
        });
    });

    describe('GET /api/prosearch/health', () => {
        test('should return health status', async () => {
            const response = await request.get('/api/prosearch/health');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
            expect(response.body.service).toBe('prosearch');
            expect(response.body.timestamp).toBeDefined();
        });
    });
});
