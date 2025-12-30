# Implementation Plan

- [x] 1. Create database migration and schema
  - Create SQL migration file for prosearch_conversations table
  - Include indexes for performance (conversation_id, created_at, updated_at)
  - Add UUID generation support
  - _Requirements: 6.2, 6.5_

- [x] 2. Implement conversation state manager
- [x] 2.1 Create conversationStateManager.js service
  - Implement createConversation() function to insert new conversation records
  - Implement loadConversation() function to retrieve conversation by ID
  - Implement updateConversation() function to update current_result_ids and applied_filters
  - Use parameterized queries to prevent SQL injection
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 2.2 Write property test for conversation state round-trip
  - **Property 2: Conversation state round-trip**
  - **Validates: Requirements 1.2, 2.4**

- [x] 2.3 Write property test for conversation retrieval idempotence
  - **Property 3: Conversation retrieval idempotence**
  - **Validates: Requirements 3.1, 3.2, 3.5**

- [x] 2.4 Write property test for conversation update immutability
  - **Property 17: Conversation update immutability**
  - **Validates: Requirements 6.3**

- [x] 3. Implement filter extractor service
- [x] 3.1 Create filterExtractor.js service
  - Implement extractFilters() function with rule-based pattern matching
  - Create technology extraction logic using predefined list
  - Create business group extraction logic
  - Create theme extraction logic
  - Create year extraction logic (2021-2025 range)
  - Implement mode detection (ADD/REMOVE/REPLACE) based on control words
  - Return structured FilterExtractionResult object
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 4. Implement filter applicator service
- [x] 4.1 Create filterApplicator.js service
  - Implement applyFilters() function with AND logic
  - Build SQL query to filter ideas by technologies (using code_preference column)
  - Build SQL query to filter by business_group
  - Build SQL query to filter by theme
  - Build SQL query to filter by year (extract from created_at)
  - Combine filters using AND logic
  - Handle ADD, REMOVE, REPLACE modes
  - Preserve order from base_result_ids
  - _Requirements: 2.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 5. Implement result hydrator service
- [x] 5.1 Create resultHydrator.js service
  - Implement hydrateResults() function to fetch ideas by IDs
  - Use WHERE idea_id = ANY($1) for batch fetching
  - Parse code_preference column to extract technologies array
  - Extract year from created_at timestamp
  - Calculate matchScore based on position in base_result_ids
  - Preserve order from input idea IDs
  - Return complete IdeaCard objects with all required fields
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 6. Implement core ProSearch service
- [x] 6.1 Create prosearchService.js orchestration service
  - Implement processChat() main entry point
  - Implement createNewConversation() for initial searches
  - Generate embedding using embeddingService
  - Query ChromaDB using existing chroma.js client
  - Store conversation state using conversationStateManager
  - Implement processFollowUp() for existing conversations
  - Load conversation state
  - Extract filters using filterExtractor
  - Apply filters using filterApplicator
  - Update conversation state
  - Hydrate results using resultHydrator
  - Return ProSearchResponse with all required fields
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [x] 7. Implement API routes and validation




- [x] 7.1 Create prosearchRoutes.js API endpoint


  - Implement POST /api/prosearch/chat endpoint
  - Add request validation for conversationId (null or valid UUID)
  - Add request validation for message (non-empty string)
  - Call prosearchService.processChat()
  - Format response with conversationId, results, appliedFilters, isNewBaseSearch
  - Implement error handling with appropriate HTTP status codes
  - Add request logging with request ID
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 8. Update server.js route registration


  - Fix import path from './backend/routes/proSearchRoutes.js' to './backend/routes/prosearchRoutes.js'
  - Verify routes are mounted at /api/prosearch
  - Ensure middleware (auth, rate limiting, error handling) is applied
  - _Requirements: 8.1_

- [ ] 9. Write remaining property-based tests


- [x] 9.1 Write property test for filter extraction determinism









  - **Property 4: Filter extraction determinism**
  - **Validates: Requirements 2.2, 4.1**

- [ ] 9.2 Write property test for filter extraction structure
  - **Property 15: Filter extraction structure**
  - **Validates: Requirements 4.7**

- [ ] 9.3 Write property test for year range validation
  - **Property 16: Year range validation**
  - **Validates: Requirements 4.5**

- [ ] 9.4 Write property test for filter application correctness
  - **Property 5: Filter application correctness**
  - **Validates: Requirements 2.3, 5.1, 5.2, 5.3, 5.4, 5.5**

- [ ] 9.5 Write property test for filter monotonicity
  - **Property 6: Filter monotonicity**
  - **Validates: Requirements 2.3, 5.1**

- [ ] 9.6 Write property test for empty filter result
  - **Property 10: Empty filter result**
  - **Validates: Requirements 2.5, 5.6**

- [ ] 9.7 Write property test for result order preservation
  - **Property 7: Result order preservation**
  - **Validates: Requirements 3.4, 7.3**

- [ ] 9.8 Write property test for result completeness
  - **Property 8: Result completeness**
  - **Validates: Requirements 1.4, 7.1**

- [ ] 9.9 Write property test for match score ordering
  - **Property 14: Match score ordering**
  - **Validates: Requirements 7.4**

- [ ] 9.10 Write property test for result hydration correctness
  - **Property 20: Result hydration correctness**
  - **Validates: Requirements 3.3, 7.2**

- [ ] 9.11 Write property test for single search per conversation
  - **Property 1: Single search per conversation**
  - **Validates: Requirements 1.1, 9.5, 2.1, 9.2**

- [ ] 9.12 Write property test for follow-up operates on base results
  - **Property 9: Follow-up operates on base results**
  - **Validates: Requirements 9.4, 2.3**

- [ ] 9.13 Write property test for conversation isolation
  - **Property 11: Conversation isolation**
  - **Validates: Requirements 10.1, 10.2**

- [ ] 9.14 Write property test for UUID uniqueness
  - **Property 12: UUID uniqueness**
  - **Validates: Requirements 1.3, 10.4**

- [ ] 9.15 Write property test for embedding dimension consistency
  - **Property 18: Embedding dimension consistency**
  - **Validates: Requirements 1.5**

- [ ] 9.16 Write property test for response structure validity
  - **Property 13: Response structure validity**
  - **Validates: Requirements 8.3**

- [ ] 9.17 Write property test for invalid input rejection
  - **Property 19: Invalid input rejection**
  - **Validates: Requirements 8.5**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
