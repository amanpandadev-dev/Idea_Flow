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

## Hybrid Search Enhancement Tasks

- [ ] 11. Create full-text search database migration
  - Create migration file add_fulltext_search_indexes.sql
  - Add search_vector tsvector column to ideas table
  - Create trigger function to auto-update search_vector on insert/update
  - Create GIN index on search_vector for fast full-text search
  - Populate search_vector for existing rows
  - Weight title (A), summary (B), and code_preference (C) fields
  - _Requirements: 14.1, 14.2, 14.3_

- [ ] 12. Implement keyword extractor service
- [ ] 12.1 Create keywordExtractor.js service
  - Implement extractKeywords() function
  - Remove stop words from query (show, me, the, in, from, etc.)
  - Remove filter terms already extracted (technologies, business groups, years, themes)
  - Normalize keywords to lowercase
  - Remove duplicates and trim whitespace
  - Filter out keywords shorter than 2 characters
  - Limit to maximum 10 keywords
  - Return array of extracted keywords
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 12.2 Write unit tests for keyword extraction
  - Test stop word removal
  - Test filter term removal
  - Test normalization and deduplication
  - Test edge cases (empty query, all stop words, no keywords)
  - _Requirements: 13.1, 13.2, 13.3_

- [ ] 13. Implement keyword search service
- [ ] 13.1 Create keywordSearchService.js service
  - Implement searchByKeywords() function
  - Build PostgreSQL full-text search query using to_tsquery
  - Search across search_vector column (title, summary, technologies)
  - Use ts_rank for relevance scoring
  - Apply OR logic for multiple keywords
  - Limit results to configurable maximum (default 300)
  - Return array of {idea_id, keyword_score}
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 13.2 Write unit tests for keyword search
  - Test single keyword search
  - Test multiple keyword search with OR logic
  - Test fuzzy matching (stemming)
  - Test empty keyword array handling
  - Test result limiting
  - _Requirements: 14.1, 14.2, 14.4_

- [ ] 14. Implement hybrid search service
- [ ] 14.1 Create hybridSearchService.js service
  - Implement performHybridSearch() function
  - Execute semantic and keyword searches in parallel using Promise.all()
  - Implement mergeAndScoreResults() function
  - Normalize semantic scores: 1 - (rank / total_results)
  - Normalize keyword scores from PostgreSQL ts_rank
  - Calculate final score: (0.6 × semantic_score) + (0.4 × keyword_score)
  - Classify match type: "hybrid", "semantic", or "keyword"
  - Deduplicate results appearing in both searches
  - Sort by final_score descending
  - Return HybridSearchResult with scores map
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3_

- [ ] 14.2 Write unit tests for hybrid search
  - Test score normalization for semantic results
  - Test score normalization for keyword results
  - Test weighted score calculation
  - Test match type classification
  - Test deduplication logic
  - Test sorting by final score
  - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ] 15. Update ProSearch service for hybrid search
- [ ] 15.1 Modify prosearchService.js createNewConversation()
  - Extract keywords using keywordExtractor before search
  - Call hybridSearchService.performHybridSearch() instead of direct ChromaDB query
  - Store hybrid search results (with scores) in conversation state
  - Pass scores to resultHydrator for matchType classification
  - Update response to include matchType, semanticScore, keywordScore
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 11.1, 11.2, 13.1, 13.2, 13.3_

- [ ] 15.2 Add parallel search timeout handling
  - Wrap Promise.all() with timeout (5000ms default)
  - Log warning if search exceeds 1000ms
  - Handle partial failures gracefully
  - _Requirements: 15.1, 15.5_

- [ ] 16. Update result hydrator for match metadata
- [ ] 16.1 Modify resultHydrator.js hydrateResults()
  - Accept scores map parameter with matchType and score data
  - Add matchType field to each IdeaCard
  - Add semanticScore field to each IdeaCard
  - Add keywordScore field to each IdeaCard
  - Update matchScore to use final hybrid score
  - Preserve all existing functionality
  - _Requirements: 12.4, 12.5, 7.1_

- [ ] 16.2 Write unit tests for updated result hydrator
  - Test matchType field inclusion
  - Test score field inclusion
  - Test backward compatibility with non-hybrid results
  - _Requirements: 12.4, 12.5_

- [ ] 17. Update conversation state manager for hybrid data
- [ ] 17.1 Modify conversationStateManager.js (if needed)
  - Verify base_result_ids can store hybrid search results
  - Ensure applied_filters JSONB structure supports hybrid metadata
  - No schema changes should be needed
  - _Requirements: 6.2, 6.3_

- [ ] 18. Add configuration for hybrid search
- [ ] 18.1 Create or update config/prosearch.js
  - Add HYBRID_SEARCH configuration object
  - Set SEMANTIC_WEIGHT: 0.6
  - Set KEYWORD_WEIGHT: 0.4
  - Set SEMANTIC_MAX_RESULTS: 300
  - Set KEYWORD_MAX_RESULTS: 300
  - Set PARALLEL_TIMEOUT: 5000
  - Add KEYWORD_EXTRACTION configuration
  - Define STOP_WORDS array
  - Set MIN_KEYWORD_LENGTH: 2
  - Set MAX_KEYWORDS: 10
  - _Requirements: 11.2, 13.1, 15.3, 15.4_

- [ ] 19. Write property-based tests for hybrid search
- [ ] 19.1 Write property test for keyword extraction determinism
  - **Property: Keyword extraction determinism**
  - For any query, extracting keywords multiple times should return identical results
  - **Validates: Requirements 13.1, 13.2, 13.3**

- [ ] 19.2 Write property test for hybrid score bounds
  - **Property: Hybrid score bounds**
  - For any hybrid search result, final_score should be between 0 and 1
  - **Validates: Requirements 11.2, 11.3, 11.4**

- [ ] 19.3 Write property test for match type consistency
  - **Property: Match type consistency**
  - For any result, matchType should match presence in semantic/keyword results
  - **Validates: Requirements 12.1, 12.2, 12.3**

- [ ] 19.4 Write property test for score monotonicity
  - **Property: Score monotonicity**
  - For any result list, scores should be in descending order
  - **Validates: Requirements 11.6**

- [ ] 19.5 Write property test for deduplication correctness
  - **Property: Deduplication correctness**
  - For any merged results, no idea_id should appear more than once
  - **Validates: Requirements 11.5**

- [ ] 20. Integration testing for hybrid search
- [ ] 20.1 Write integration test for end-to-end hybrid search
  - Test new conversation with hybrid search
  - Verify both semantic and keyword results appear
  - Verify matchType classification
  - Verify score fields present
  - Test query with only keywords (no semantic matches)
  - Test query with only semantic matches (no keywords)
  - Test query with both types of matches
  - _Requirements: 1.1, 1.2, 11.1, 11.2, 12.4, 12.5_

- [ ] 20.2 Write integration test for parallel search performance
  - Measure total hybrid search time
  - Verify semantic and keyword searches run in parallel
  - Verify total time < 800ms for typical queries
  - _Requirements: 15.1, 15.2, 15.3_

- [ ] 21. Update API response format
- [ ] 21.1 Verify prosearchRoutes.js returns new fields
  - Ensure matchType is included in response
  - Ensure semanticScore is included in response
  - Ensure keywordScore is included in response
  - Verify backward compatibility (existing fields unchanged)
  - _Requirements: 8.3, 12.4, 12.5_

- [ ] 22. Run database migration
- [ ] 22.1 Execute full-text search migration
  - Run add_fulltext_search_indexes.sql migration
  - Verify search_vector column created
  - Verify GIN index created
  - Verify trigger function working
  - Test full-text search on sample data
  - _Requirements: 14.1, 14.2_

- [ ] 23. Final checkpoint - Hybrid search complete
  - Run all tests (unit, property, integration)
  - Verify hybrid search returns both keyword and semantic matches
  - Test example: "KYC in Banking" returns both exact and related ideas
  - Verify matchType classification working
  - Verify scores are reasonable and ordered correctly
  - Check performance benchmarks met
  - Ensure all tests pass, ask the user if questions arise.
