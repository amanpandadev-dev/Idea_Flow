# Implementation Plan

- [x] 1. Set up Gemini 1.5 Flash integration and embedding service




  - Create Gemini API client wrapper with error handling
  - Implement embedding generation function using text-embedding-004 model
  - Add fallback logic to Ollama when Gemini is unavailable
  - Configure retry logic with exponential backoff for rate limits
  - _Requirements: 5.1, 5.2, 5.6, 5.7, 5.8_

- [x] 1.1 Write property test for embedding dimension consistency






  - **Property 3: Embedding Dimension Consistency**
  - **Validates: Requirements 1.4**

- [x] 2. Enhance document processing service with AI-powered extraction





  - Update extractThemesWithAI to use Gemini 1.5 Flash with structured JSON output
  - Implement extraction of topics, techStack, industry, keywords, and suggestedQuestions
  - Add error handling for AI extraction failures with fallback to simple extraction
  - Update processDocument to return enhanced RAG data structure
  - _Requirements: 1.6, 1.7, 5.3, 5.4_

- [x] 2.1 Write property test for theme extraction structure






  - **Property 5: Theme Extraction Structure**
  - **Validates: Requirements 1.6**

- [x] 2.2 Write property test for question generation count






  - **Property 6: Question Generation Count**
  - **Validates: Requirements 1.7**

- [x] 3. Update embedding service to support Gemini provider




  - Add 'gemini' as a provider option alongside 'llama' and 'grok'
  - Implement generateGeminiEmbedding function
  - Update getEmbeddingVector to route to Gemini when selected
  - Add dimension validation for Gemini embeddings
  - _Requirements: 5.1, 5.2, 5.9_

- [x] 3.1 Write property test for storage round trip








  - **Property 4: Storage Round Trip**
  - **Validates: Requirements 1.5**

- [x] 4. Implement enhanced question generator service


  - Create generateQuestionsWithGemini function
  - Use Gemini 1.5 Flash to generate 5-8 contextual questions
  - Add JSON parsing and validation for question output
  - Implement fallback to template-based questions on failure
  - _Requirements: 1.7, 5.4_

- [x] 5. Update context routes to support Gemini and enhanced features



  - Modify /api/context/upload to use Gemini for embeddings and extraction
  - Update response to include keywords and suggestedQuestions
  - Add provider mismatch detection and automatic context reset
  - Enhance /api/context/status to return themes and keywords
  - _Requirements: 1.1-1.10, 6.6, 6.7, 6.9_

- [ ]* 5.1 Write property test for response structure completeness
  - **Property 7: Response Structure Completeness**
  - **Validates: Requirements 1.8**

- [ ] 6. Checkpoint - Ensure document upload workflow is functional


  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Enhance semantic search service with Gemini embeddings


  - Update searchSimilarIdeas to support 'gemini' provider
  - Ensure embedding generation uses consistent provider
  - Add similarity score normalization to 0-1 range
  - Implement result sorting by similarity score
  - _Requirements: 3.1, 3.2, 3.5, 3.6_

- [ ]* 7.1 Write property test for similarity score ordering
  - **Property 15: Similarity Score Ordering**
  - **Validates: Requirements 3.5**

- [ ]* 7.2 Write property test for similarity score range
  - **Property 16: Similarity Score Range**
  - **Validates: Requirements 3.6**

- [x] 8. Implement idea indexing in ChromaDB


  - Create indexIdea function to store ideas in ideas_collection
  - Generate embeddings from title + description
  - Store metadata (title, team, category, status)
  - Add retry logic for embedding failures
  - Implement graceful degradation if indexing fails
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

- [ ]* 8.1 Write property test for idea indexing round trip
  - **Property 19: Idea Indexing Round Trip**
  - **Validates: Requirements 4.3**

- [ ]* 8.2 Write property test for metadata preservation
  - **Property 20: Metadata Preservation**
  - **Validates: Requirements 4.4**

- [x] 9. Create idea indexing trigger for new submissions


  - Add indexing call to idea submission endpoint
  - Implement background indexing to avoid blocking submissions
  - Add logging for successful and failed indexing
  - Ensure ideas_collection is created on system startup
  - _Requirements: 4.3, 4.7, 4.8, 4.9_

- [x] 10. Update semantic search routes to use Gemini


  - Modify /api/ideas/semantic-search to support 'gemini' provider
  - Add result count limiting
  - Ensure proper error handling and user-friendly messages
  - Add metadata to search results
  - _Requirements: 3.1-3.10_

- [ ]* 10.1 Write property test for idea details completeness
  - **Property 17: Idea Details Completeness**
  - **Validates: Requirements 3.4**

- [ ] 11. Checkpoint - Ensure semantic search is functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Enhance agent service to use Gemini for synthesis


  - Update executeAgent to use Gemini 1.5 Flash for result synthesis
  - Improve prompt to generate structured citations
  - Ensure IDEA-XXX format for internal citations
  - Ensure URLs are included for external citations
  - _Requirements: 2.4, 2.5, 2.6, 2.7, 5.5_

- [ ]* 12.1 Write property test for citation format consistency
  - **Property 10: Citation Format Consistency**
  - **Validates: Requirements 2.5**

- [ ]* 12.2 Write property test for external citation URLs
  - **Property 11: External Citation URLs**
  - **Validates: Requirements 2.6**

- [ ]* 12.3 Write property test for response citation structure
  - **Property 12: Response Citation Structure**
  - **Validates: Requirements 2.7**


- [x] 13. Update internal RAG tool to include document context


  - Enhance searchEphemeralContext to properly retrieve and format context chunks
  - Ensure context is included when sessionId is available
  - Add relevance scoring for context chunks
  - Format combined results with clear source indicators
  - _Requirements: 2.3, 6.2_

- [ ]* 13.1 Write property test for context inclusion in search
  - **Property 9: Context Inclusion in Search**
  - **Validates: Requirements 2.3**

- [x] 14. Implement session management enhancements


  - Add contextProvider tracking to session state
  - Implement provider mismatch detection
  - Add automatic context reset on provider switch
  - Ensure session context is properly associated with sessionId
  - _Requirements: 6.1, 6.6, 6.7, 6.8_

- [ ]* 14.1 Write property test for session context association
  - **Property 21: Session Context Association**
  - **Validates: Requirements 6.1**

- [ ]* 14.2 Write property test for provider switch reset
  - **Property 25: Provider Switch Reset**
  - **Validates: Requirements 6.6**

- [ ]* 14.3 Write property test for context replacement
  - **Property 27: Context Replacement**
  - **Validates: Requirements 6.8**

- [x] 15. Update agent routes for improved session handling


  - Ensure jobId uniqueness for all sessions
  - Add proper status polling response structure
  - Implement session cancellation
  - Add session status transition tracking
  - _Requirements: 2.1, 2.8, 2.9, 2.10_

- [ ]* 15.1 Write property test for session creation uniqueness
  - **Property 8: Session Creation Uniqueness**
  - **Validates: Requirements 2.1**

- [ ]* 15.2 Write property test for session status transition
  - **Property 13: Session Status Transition**
  - **Validates: Requirements 2.8**

- [x] 16. Implement hybrid search for document-based idea matching


  - Create findIdeasFromDocumentKeywords function
  - Combine keyword matching with semantic similarity
  - Use extracted themes and keywords from document context
  - Return results with matched keywords metadata
  - _Requirements: 3.8, 3.9, 3.10_

- [ ]* 16.1 Write property test for hybrid search coverage
  - **Property 18: Hybrid Search Coverage**
  - **Validates: Requirements 3.9**

- [x] 17. Add /api/context/find-matching-ideas endpoint

  - Implement route to find ideas matching uploaded document
  - Use session context themes and keywords
  - Return structured response with keywords and matched ideas
  - Add proper error handling for missing context
  - _Requirements: 3.8, 3.9, 3.10_

- [ ] 18. Checkpoint - Ensure agent Q&A workflow is functional
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 19. Update frontend DocumentUpload component
  - Add display for extracted keywords
  - Implement suggested questions as clickable buttons
  - Show loading states during processing
  - Display context status with themes and keywords
  - Add error handling with user-friendly messages
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.10_

- [ ] 20. Update frontend AgentChat component
  - Add mode selector for Agent Q&A vs Semantic Search
  - Implement suggested questions integration
  - Add citation display with clickable IDEA links
  - Show similarity scores as percentages
  - Display processing status and progress
  - _Requirements: 9.6, 9.7, 9.8, 9.9_

- [x] 21. Implement comprehensive error handling

  - Add specific error messages for file validation failures
  - Implement retry logic with exponential backoff
  - Add graceful degradation for API failures
  - Create user-friendly error message mapping
  - Add error logging with sanitization
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

- [x] 22. Add performance optimizations

  - Implement batch processing for embeddings (batch size 10)
  - Add parallel execution for agent searches
  - Implement model instance caching
  - Configure database connection pooling
  - Add timeout configurations
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9_

- [x] 23. Implement monitoring and logging

  - Add structured logging for all operations
  - Implement performance tracking for key operations
  - Add API usage monitoring for Gemini
  - Create health check endpoints
  - Add error tracking and alerting
  - _Requirements: 8.10_

- [x] 24. Add security enhancements

  - Implement file upload validation
  - Add rate limiting for upload and search endpoints
  - Implement API key protection in error messages
  - Add session isolation validation
  - Configure CORS for production
  - _Requirements: 7.1, 7.10_

- [x] 25. Create migration script for existing ideas


  - Write script to index all existing ideas in ChromaDB
  - Use Gemini embeddings for consistency
  - Add progress tracking and error handling
  - Implement batch processing to avoid rate limits
  - _Requirements: 4.3, 4.8_

- [x] 26. Update environment configuration



  - Add API_KEY for Gemini to .env.example
  - Update EMBEDDING_PROVIDER default to 'gemini'
  - Add configuration documentation
  - Create production environment checklist
  - _Requirements: 5.1, 5.9_

- [x] 27. Final checkpoint - End-to-end testing





  - Test complete document upload workflow
  - Test agent Q&A with and without context
  - Test semantic search for ideas
  - Test idea indexing and retrieval
  - Test error scenarios and recovery
  - Verify all property tests pass
  - Ensure all tests pass, ask the user if questions arise.

