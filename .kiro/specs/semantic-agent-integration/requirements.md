# Requirements Document

## Introduction

This specification defines the requirements for enhancing and integrating the semantic search, AI agent Q&A, and document-based idea retrieval workflows in the IdeaFlow innovation management platform. The system currently has partial implementations that need to be unified, optimized, and made production-ready with Google Gemini 1.5 Flash as the primary AI model for embeddings, query processing, and intelligent features.

## Glossary

- **System**: The IdeaFlow innovation management platform
- **Agent**: The AI-powered question-answering system that combines internal RAG and external Tavily search
- **ChromaDB**: The vector database used for storing and querying embeddings
- **Embedding**: A numerical vector representation of text used for semantic similarity
- **RAG**: Retrieval Augmented Generation - combining retrieved context with LLM responses
- **Session**: An HTTP session that maintains ephemeral document context for a user
- **Chunk**: A segment of text extracted from a document (approximately 500 tokens)
- **Gemini 1.5 Flash**: Google's fast, efficient AI model used for embeddings and text generation
- **Tavily**: External web search API for retrieving current information
- **Semantic Search**: Vector-based similarity search using embeddings
- **Idea Submission**: A user-submitted innovation idea stored in the PostgreSQL database
- **Document Upload**: User-provided PDF/DOCX/TXT files for contextual analysis
- **Suggested Query**: AI-generated question based on uploaded document content

## Requirements

### Requirement 1: Document Upload and Processing

**User Story:** As a user, I want to upload documents (PDF, DOCX, TXT) to provide context for my queries, so that the AI agent can give me more relevant and specific answers.

#### Acceptance Criteria

1. WHEN a user uploads a PDF, DOCX, or TXT file THEN the System SHALL extract all text content from the document
2. WHEN text extraction is complete THEN the System SHALL clean and normalize the extracted text by removing excessive whitespace and special characters
3. WHEN text is cleaned THEN the System SHALL split the text into chunks of approximately 500 tokens with 50-token overlap between consecutive chunks
4. WHEN chunks are created THEN the System SHALL generate embeddings for each chunk using Gemini 1.5 Flash embedding model
5. WHEN embeddings are generated THEN the System SHALL store the chunks and embeddings in ChromaDB namespaced by the user's sessionId
6. WHEN the document is processed THEN the System SHALL extract key themes, topics, technologies, and industry keywords using Gemini 1.5 Flash
7. WHEN keywords are extracted THEN the System SHALL generate 5-8 high-quality suggested queries that users can ask about the document content
8. WHEN processing is complete THEN the System SHALL return success status with chunk count, themes, keywords, and suggested questions to the client
9. IF the uploaded file exceeds 10MB THEN the System SHALL reject the upload with an appropriate error message
10. IF the uploaded file is not PDF, DOCX, or TXT THEN the System SHALL reject the upload with an appropriate error message

### Requirement 2: AI Agent Q&A with Multi-Source Integration

**User Story:** As a user, I want to ask questions and receive comprehensive answers that combine information from uploaded documents, internal idea repository, and external web sources, so that I can make informed decisions.

#### Acceptance Criteria

1. WHEN a user submits a query THEN the System SHALL create an asynchronous agent session and return a unique jobId immediately
2. WHEN an agent session starts THEN the System SHALL execute internal RAG search and Tavily web search in parallel
3. WHEN the user has uploaded a document THEN the System SHALL include relevant chunks from the document context in the internal search results
4. WHEN both searches complete THEN the System SHALL synthesize results using Gemini 1.5 Flash to generate a comprehensive answer
5. WHEN generating the answer THEN the System SHALL cite specific idea identifiers (IDEA-XXX) for internal sources
6. WHEN generating the answer THEN the System SHALL include URLs for external web sources
7. WHEN the answer is complete THEN the System SHALL format the response with structured citations for internal and external sources
8. WHEN the agent completes THEN the System SHALL update the session status to 'completed' and store the result
9. WHEN a user polls the session status THEN the System SHALL return the current status, progress history, and result if available
10. IF the user cancels the session THEN the System SHALL stop processing and mark the session as 'cancelled'

### Requirement 3: Semantic Search for Similar Ideas

**User Story:** As a user, I want to search for ideas similar to my query or uploaded document, so that I can discover related innovations and avoid duplicating work.

#### Acceptance Criteria

1. WHEN a user enters a search query THEN the System SHALL generate an embedding for the query using Gemini 1.5 Flash
2. WHEN the query embedding is generated THEN the System SHALL perform vector similarity search in the ideas_collection in ChromaDB
3. WHEN similarity search completes THEN the System SHALL retrieve the top 10 most similar ideas with their similarity scores
4. WHEN similar ideas are found THEN the System SHALL fetch full idea details from PostgreSQL including title, description, team, tags, and creation date
5. WHEN idea details are retrieved THEN the System SHALL return results sorted by similarity score in descending order
6. WHEN displaying results THEN the System SHALL show similarity as a percentage (0-100%)
7. IF no similar ideas are found THEN the System SHALL return an empty results array with appropriate messaging
8. WHEN a user has uploaded a document THEN the System SHALL enable finding similar ideas based on extracted keywords and themes
9. WHEN finding ideas from document keywords THEN the System SHALL combine keyword matching with semantic similarity for better results
10. WHEN results are returned THEN the System SHALL include metadata such as category, status, and matched keywords

### Requirement 4: Idea Submission Indexing

**User Story:** As a system administrator, I want all idea submissions to be automatically indexed in the vector database, so that they can be discovered through semantic search.

#### Acceptance Criteria

1. WHEN a new idea is submitted THEN the System SHALL create a text representation combining the title and description
2. WHEN the text representation is created THEN the System SHALL generate an embedding using Gemini 1.5 Flash
3. WHEN the embedding is generated THEN the System SHALL store the idea in the ideas_collection in ChromaDB with the idea ID as the document ID
4. WHEN storing in ChromaDB THEN the System SHALL include metadata such as title, team, category, and status
5. WHEN an idea is updated THEN the System SHALL update the corresponding entry in ChromaDB
6. IF embedding generation fails THEN the System SHALL retry up to 3 times with exponential backoff
7. IF all retries fail THEN the System SHALL log the error and continue without blocking the idea submission
8. WHEN the system starts THEN the System SHALL verify the ideas_collection exists and create it if necessary
9. WHEN indexing completes THEN the System SHALL log the success with the idea ID
10. WHEN querying ideas THEN the System SHALL use the same embedding provider for consistency

### Requirement 5: Gemini 1.5 Flash Integration

**User Story:** As a developer, I want to use Google Gemini 1.5 Flash as the primary AI model for all embedding and generation tasks, so that the system is cost-effective and performant.

#### Acceptance Criteria

1. WHEN the System initializes THEN the System SHALL configure the Google Generative AI client with the API_KEY from environment variables
2. WHEN generating embeddings THEN the System SHALL use the Gemini 1.5 Flash model for text-to-vector conversion
3. WHEN extracting themes and keywords THEN the System SHALL use Gemini 1.5 Flash with structured JSON output
4. WHEN generating suggested questions THEN the System SHALL use Gemini 1.5 Flash with appropriate prompts
5. WHEN synthesizing agent responses THEN the System SHALL use Gemini 1.5 Flash for combining search results
6. WHEN the API key is missing THEN the System SHALL log a warning and fall back to local Ollama models
7. WHEN API rate limits are reached THEN the System SHALL implement exponential backoff retry logic
8. WHEN API calls fail THEN the System SHALL log detailed error messages including status codes
9. WHEN using Gemini 1.5 Flash THEN the System SHALL configure appropriate token limits to stay within free tier constraints
10. WHEN processing requests THEN the System SHALL track API usage to monitor quota consumption

### Requirement 6: Session Management and Context Persistence

**User Story:** As a user, I want my uploaded document context to persist across multiple queries in the same session, so that I don't have to re-upload documents repeatedly.

#### Acceptance Criteria

1. WHEN a user uploads a document THEN the System SHALL associate the document context with the user's HTTP session ID
2. WHEN the user submits subsequent queries THEN the System SHALL automatically include the session context in RAG searches
3. WHEN the user resets context THEN the System SHALL delete the session-specific collection from ChromaDB
4. WHEN the user's session expires THEN the System SHALL clean up the associated ChromaDB collection
5. WHEN checking context status THEN the System SHALL return whether context exists and provide statistics
6. WHEN a user switches embedding providers THEN the System SHALL automatically reset existing context to prevent dimension mismatch
7. WHEN context is stored THEN the System SHALL record the embedding provider used for that context
8. WHEN the user uploads a new document THEN the System SHALL replace the existing context with the new document
9. WHEN displaying context status THEN the System SHALL show chunk count, themes, and keywords
10. IF the session is not available THEN the System SHALL return an appropriate error message

### Requirement 7: Error Handling and Validation

**User Story:** As a user, I want clear and helpful error messages when something goes wrong, so that I can understand and resolve issues quickly.

#### Acceptance Criteria

1. WHEN a file upload fails THEN the System SHALL return a specific error message indicating the reason (file type, size, corruption, etc.)
2. WHEN embedding generation fails THEN the System SHALL retry with exponential backoff before returning an error
3. WHEN the database is unavailable THEN the System SHALL return a 503 Service Unavailable status with an appropriate message
4. WHEN API keys are missing THEN the System SHALL log warnings and attempt to use fallback providers
5. WHEN invalid parameters are provided THEN the System SHALL return a 400 Bad Request with validation details
6. WHEN a session is not found THEN the System SHALL return a 404 Not Found with a clear message
7. WHEN processing times out THEN the System SHALL cancel the operation and notify the user
8. WHEN ChromaDB operations fail THEN the System SHALL log detailed error information for debugging
9. WHEN PDF extraction fails THEN the System SHALL provide specific guidance (re-save PDF, remove password, use text-based PDF)
10. WHEN errors occur THEN the System SHALL never expose sensitive information like API keys or internal paths

### Requirement 8: Performance and Optimization

**User Story:** As a user, I want fast response times for searches and queries, so that I can work efficiently without waiting.

#### Acceptance Criteria

1. WHEN processing document uploads THEN the System SHALL process chunks in batches of 10 to optimize throughput
2. WHEN executing agent queries THEN the System SHALL run internal and external searches in parallel
3. WHEN generating embeddings THEN the System SHALL reuse the same model instance to avoid initialization overhead
4. WHEN querying ChromaDB THEN the System SHALL limit results to the requested number to minimize data transfer
5. WHEN fetching idea details THEN the System SHALL use efficient SQL queries with proper indexing
6. WHEN the system is idle THEN the System SHALL maintain database connection pools to avoid connection overhead
7. WHEN processing large documents THEN the System SHALL stream processing to avoid memory issues
8. WHEN caching is beneficial THEN the System SHALL implement appropriate caching strategies
9. WHEN API calls are made THEN the System SHALL set reasonable timeout values to prevent hanging
10. WHEN monitoring performance THEN the System SHALL log processing times for key operations

### Requirement 9: Frontend Integration

**User Story:** As a user, I want a seamless and intuitive interface for uploading documents, asking questions, and viewing results, so that I can easily interact with the AI features.

#### Acceptance Criteria

1. WHEN the document upload component loads THEN the System SHALL check for existing context and display status
2. WHEN a user drags and drops a file THEN the System SHALL provide visual feedback and validate the file
3. WHEN uploading is in progress THEN the System SHALL display a loading indicator with progress information
4. WHEN upload completes THEN the System SHALL display extracted themes, keywords, and suggested questions
5. WHEN suggested questions are displayed THEN the System SHALL allow users to click them to populate the query input
6. WHEN the user switches between Agent Q&A and Semantic Search modes THEN the System SHALL update the UI appropriately
7. WHEN agent processing is running THEN the System SHALL poll for status updates and display progress
8. WHEN results are displayed THEN the System SHALL format citations with clickable links to ideas
9. WHEN semantic search results are shown THEN the System SHALL display similarity scores as percentages with visual indicators
10. WHEN errors occur THEN the System SHALL display user-friendly error messages with actionable guidance

### Requirement 10: Testing and Quality Assurance

**User Story:** As a developer, I want comprehensive tests to ensure the system works correctly and reliably, so that users have a stable experience.

#### Acceptance Criteria

1. WHEN testing document processing THEN the System SHALL verify text extraction works for PDF, DOCX, and TXT files
2. WHEN testing chunking THEN the System SHALL verify chunks are approximately 500 tokens with proper overlap
3. WHEN testing embeddings THEN the System SHALL verify vectors have consistent dimensions
4. WHEN testing semantic search THEN the System SHALL verify results are ranked by similarity
5. WHEN testing agent queries THEN the System SHALL verify responses include both internal and external sources
6. WHEN testing session management THEN the System SHALL verify context persists across requests
7. WHEN testing error handling THEN the System SHALL verify appropriate errors are returned for invalid inputs
8. WHEN testing API integration THEN the System SHALL verify Gemini 1.5 Flash calls work correctly
9. WHEN testing ChromaDB operations THEN the System SHALL verify collections are created, queried, and deleted properly
10. WHEN testing end-to-end workflows THEN the System SHALL verify the complete user journey works as expected
