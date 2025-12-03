# Design Document

## Overview

This design document outlines the architecture and implementation strategy for integrating semantic search, AI agent Q&A, and document-based idea retrieval workflows in the IdeaFlow platform. The system leverages Google Gemini 1.5 Flash as the primary AI model for embeddings, text generation, and intelligent features, providing a unified and production-ready solution.

### Key Features

1. **Document Processing Pipeline**: Extract, chunk, and embed documents (PDF/DOCX/TXT) with automatic theme extraction and question generation
2. **AI Agent Q&A System**: Asynchronous agent that combines internal RAG, external Tavily search, and Gemini 1.5 Flash synthesis
3. **Semantic Search Engine**: Vector-based similarity search for discovering related ideas
4. **Automatic Idea Indexing**: Real-time indexing of idea submissions in ChromaDB
5. **Session-Based Context Management**: Ephemeral document context that persists across queries
6. **Hybrid Search**: Combination of keyword matching and semantic similarity for optimal results

### Technology Stack

- **AI Model**: Google Gemini 1.5 Flash (embeddings, text generation, structured output)
- **Vector Database**: ChromaDB (in-memory with persistence)
- **Relational Database**: PostgreSQL (idea storage, user management)
- **Backend**: Node.js with Express
- **Frontend**: React with TypeScript
- **External APIs**: Tavily (web search), OpenRouter (fallback)

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Document     │  │ Agent Chat   │  │ Semantic     │          │
│  │ Upload       │  │ Interface    │  │ Search UI    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Express API Server                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Context      │  │ Agent        │  │ Semantic     │          │
│  │ Routes       │  │ Routes       │  │ Search Routes│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Document     │    │ Agent        │    │ Semantic     │
│ Service      │    │ Service      │    │ Search       │
│              │    │              │    │ Service      │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Embedding    │    │ Vector Store │    │ ChromaDB     │
│ Service      │    │ Service      │    │ Client       │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Gemini 1.5   │    │ ChromaDB     │    │ PostgreSQL   │
│ Flash API    │    │ (Vector DB)  │    │ (Relational) │
└──────────────┘    └──────────────┘    └──────────────┘
```


### Data Flow

#### Document Upload Flow
```
User uploads file → Multer validates → Extract text → Clean & normalize →
Chunk text (500 tokens, 50 overlap) → Generate embeddings (Gemini) →
Store in ChromaDB (session namespace) → Extract themes/keywords (Gemini) →
Generate suggested questions (Gemini) → Return response to client
```

#### Agent Q&A Flow
```
User submits query → Create session (jobId) → Return jobId immediately →
[Background] Generate query embedding → Search internal RAG (parallel) →
Search Tavily web (parallel) → Combine results → Synthesize with Gemini →
Format citations → Update session status → Client polls for result
```

#### Semantic Search Flow
```
User enters query → Generate query embedding (Gemini) →
Query ChromaDB ideas_collection → Get top K similar vectors →
Fetch full idea details from PostgreSQL → Sort by similarity →
Return formatted results with scores
```

## Components and Interfaces

### 1. Document Service (`backend/services/documentService.js`)

**Purpose**: Handle document processing, text extraction, chunking, and AI-powered analysis

**Key Functions**:
- `extractDocument(buffer, mimetype)`: Extract text from PDF/DOCX/TXT
- `chunkText(text, chunkSize, overlap)`: Split text into overlapping chunks
- `extractThemesWithAI(text)`: Use Gemini to extract themes, keywords, topics, tech stack, industry
- `processDocument(buffer, mimetype, options)`: Complete document processing pipeline

**Dependencies**:
- `pdf-parse`: PDF text extraction
- `mammoth`: DOCX text extraction
- `@google/generative-ai`: Gemini API client

**Interface**:
```javascript
// Input
{
  buffer: Buffer,
  mimetype: string,
  options: {
    chunkSize: number,      // default: 500
    chunkOverlap: number    // default: 50
  }
}

// Output
{
  success: boolean,
  text: string,
  chunks: string[],
  themes: string[],
  keywords: string[],
  suggestedQuestions: string[],
  ragData: {
    themes: string[],
    keywords: string[],
    suggestedQuestions: string[],
    topics: string[],
    techStack: string[],
    industry: string[]
  },
  stats: {
    originalLength: number,
    chunkCount: number,
    avgChunkLength: number
  }
}
```


### 2. Embedding Service (`backend/services/embeddingService.js`)

**Purpose**: Generate embeddings using Gemini 1.5 Flash with fallback to Ollama

**Key Functions**:
- `generateSingleEmbedding(text, provider)`: Generate embedding for single text
- `generateEmbeddings(texts, provider)`: Batch generate embeddings
- `generateEmbeddingWithRetry(text, provider, maxRetries)`: Generate with retry logic

**Gemini Integration**:
```javascript
// New function to add
async function generateGeminiEmbedding(text) {
  const genAI = new GoogleGenerativeAI(process.env.API_KEY);
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  
  const result = await model.embedContent(text);
  return result.embedding.values;
}
```

**Interface**:
```javascript
// Input
{
  text: string | string[],
  provider: 'gemini' | 'llama' | 'grok',
  maxRetries: number  // optional, default: 3
}

// Output
number[] | number[][]  // Single embedding or array of embeddings
```

### 3. Vector Store Service (`backend/services/vectorStoreService.js`)

**Purpose**: Manage ChromaDB collections for session-based and persistent storage

**Key Functions**:
- `createEphemeralCollection(sessionId)`: Create session-specific collection
- `getEphemeralCollection(sessionId)`: Retrieve existing collection
- `addDocuments(sessionId, documents, embeddings, metadatas)`: Add documents to collection
- `queryCollection(sessionId, queryEmbedding, topK)`: Query for similar documents
- `deleteCollection(sessionId)`: Remove collection
- `getCollectionStats(sessionId)`: Get collection metadata

**Interface**:
```javascript
// Add Documents
{
  sessionId: string,
  documents: string[],
  embeddings: number[][],
  metadatas: Array<{
    index: number,
    chunkLength: number,
    filename: string,
    uploadedAt: string
  }>
}

// Query Results
{
  documents: string[],
  metadatas: object[],
  distances: number[]
}
```


### 4. Semantic Search Service (`backend/services/semanticSearch.js`)

**Purpose**: Perform vector similarity search on idea submissions

**Key Functions**:
- `searchSimilarIdeas(chromaClient, db, query, embeddingProvider, limit)`: Search for similar ideas
- `indexIdea(chromaClient, idea, embeddingProvider)`: Index new idea in vector database

**Enhanced Interface**:
```javascript
// Search Input
{
  query: string,
  embeddingProvider: 'gemini' | 'llama' | 'grok',
  limit: number  // default: 10
}

// Search Output
{
  id: string,           // IDEA-XXX format
  title: string,
  description: string,
  team: string,
  tags: string[],
  similarity: number,   // 0-1 score
  createdAt: string,
  category: string,
  status: string
}[]
```

### 5. Agent Service (`backend/agents/reactAgent.js`)

**Purpose**: Orchestrate multi-source search and synthesis

**Key Functions**:
- `executeAgent(jobId, userQuery, pool, httpSessionId, options)`: Async agent execution
- `executeSimpleAgent(userQuery, pool, sessionId, options)`: Synchronous fallback

**Execution Flow**:
1. Initialize InternalRAGTool and TavilyTool
2. Execute both tools in parallel
3. Synthesize results with Gemini 1.5 Flash
4. Format response with structured citations
5. Update session manager with result

**Interface**:
```javascript
// Agent Response
{
  answer: string,
  citations: {
    internal: Array<{
      ideaId: string,
      title: string,
      snippet: string,
      domain: string,
      relevance: number
    }>,
    external: Array<{
      title: string,
      url: string,
      snippet: string
    }>
  },
  reasoning: string,
  usedEphemeralContext: boolean,
  processingTime: number
}
```


### 6. Question Generator Service (`backend/services/questionGenerator.js`)

**Purpose**: Generate contextual questions from document themes

**Enhanced with Gemini**:
```javascript
async function generateQuestionsWithGemini(themes, fullText) {
  const genAI = new GoogleGenerativeAI(process.env.API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `Based on a document with themes: ${themes.join(', ')}
  
Generate 5-8 insightful questions that would help users explore this document's content.
Questions should be:
- Specific to the themes
- Open-ended and exploratory
- Relevant for innovation/business context
- Actionable and thought-provoking

Return as JSON array of strings.`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 500
    }
  });
  
  return JSON.parse(result.response.text());
}
```

## Data Models

### ChromaDB Collections

#### 1. Session Collections (Ephemeral)
- **Collection Name**: `{sessionId}` (e.g., "sess_abc123")
- **Purpose**: Store uploaded document chunks for RAG
- **Lifecycle**: Created on upload, deleted on reset or session expiry
- **Schema**:
```javascript
{
  ids: string[],              // Chunk IDs: "chunk_0", "chunk_1", ...
  embeddings: number[][],     // Embedding vectors
  documents: string[],        // Text chunks
  metadatas: Array<{
    index: number,
    chunkLength: number,
    filename: string,
    uploadedAt: string
  }>
}
```

#### 2. Ideas Collection (Persistent)
- **Collection Name**: `ideas_collection`
- **Purpose**: Store all idea submissions for semantic search
- **Lifecycle**: Persistent, updated on idea submission/update
- **Schema**:
```javascript
{
  ids: string[],              // Idea IDs: "123", "456", ...
  embeddings: number[][],     // Embedding vectors
  documents: string[],        // Title + Description
  metadatas: Array<{
    title: string,
    team: string,
    category: string,
    status: string
  }>
}
```

### PostgreSQL Schema (Existing)

**Ideas Table**:
```sql
CREATE TABLE ideas (
  idea_id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  challenge_opportunity VARCHAR(100),
  business_group VARCHAR(100),
  code_preference TEXT,
  build_phase VARCHAR(50),
  score INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```


### Session State Model

**Agent Session**:
```typescript
interface AgentSession {
  id: string;                    // Unique job ID
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  query: string;
  history: string[];             // Progress messages
  result: AgentResponse | null;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
```

**Context Status**:
```typescript
interface ContextStatus {
  hasContext: boolean;
  sessionId: string | null;
  stats?: {
    sessionId: string;
    documentCount: number;
    collectionName: string;
    themes?: string[];
    keywords?: string[];
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Text Extraction Completeness
*For any* valid PDF, DOCX, or TXT file, extracting text should produce non-empty output that contains recognizable content from the original file.
**Validates: Requirements 1.1**

### Property 2: Chunking Coverage
*For any* text input, the chunking process should produce chunks that collectively cover the entire input text without loss of content, with each chunk being approximately 500 tokens and having 50-token overlap with adjacent chunks.
**Validates: Requirements 1.3**

### Property 3: Embedding Dimension Consistency
*For any* set of text chunks processed with the same embedding provider, all generated embeddings should have identical dimensions.
**Validates: Requirements 1.4**

### Property 4: Storage Round Trip
*For any* set of chunks and embeddings stored in ChromaDB, querying the collection should retrieve the stored data with matching content and metadata.
**Validates: Requirements 1.5**

### Property 5: Theme Extraction Structure
*For any* processed document, the extracted RAG data should contain all required fields (themes, keywords, suggestedQuestions, topics, techStack, industry) with non-empty arrays for valid documents.
**Validates: Requirements 1.6**

### Property 6: Question Generation Count
*For any* document with extracted themes, the number of generated suggested questions should be between 5 and 8, and all questions should end with a question mark.
**Validates: Requirements 1.7**

### Property 7: Response Structure Completeness
*For any* successful document processing, the response should contain all required fields (success, chunksProcessed, themes, keywords, suggestedQuestions, sessionId, stats) with correct types.
**Validates: Requirements 1.8**

### Property 8: Session Creation Uniqueness
*For any* user query, creating an agent session should generate a unique jobId that can be used to retrieve the session status.
**Validates: Requirements 2.1**


### Property 9: Context Inclusion in Search
*For any* query submitted with an active document context, the internal RAG search results should include chunks from the uploaded document context.
**Validates: Requirements 2.3**

### Property 10: Citation Format Consistency
*For any* agent response containing internal sources, the answer should include idea identifiers in the format "IDEA-XXX" where XXX is a numeric ID.
**Validates: Requirements 2.5**

### Property 11: External Citation URLs
*For any* agent response containing external sources, the citations should include valid URLs (starting with http:// or https://).
**Validates: Requirements 2.6**

### Property 12: Response Citation Structure
*For any* completed agent response, the result should contain a citations object with both internal and external arrays, even if empty.
**Validates: Requirements 2.7**

### Property 13: Session Status Transition
*For any* agent session that completes successfully, the status should transition to 'completed' and the result field should be non-null.
**Validates: Requirements 2.8**

### Property 14: Embedding Query Consistency
*For any* search query, generating an embedding should produce a vector with dimensions consistent with the selected embedding provider.
**Validates: Requirements 3.1**

### Property 15: Similarity Score Ordering
*For any* semantic search results, the ideas should be sorted in descending order by similarity score.
**Validates: Requirements 3.5**

### Property 16: Similarity Score Range
*For any* semantic search result, the similarity score should be a number between 0 and 1 (or 0-100 when displayed as percentage).
**Validates: Requirements 3.6**

### Property 17: Idea Details Completeness
*For any* idea returned from semantic search, the result should include all required fields (id, title, description, team, tags, similarity, createdAt).
**Validates: Requirements 3.4**

### Property 18: Hybrid Search Coverage
*For any* document with extracted keywords, finding similar ideas should return results that include both keyword matches and semantically similar ideas.
**Validates: Requirements 3.9**

### Property 19: Idea Indexing Round Trip
*For any* idea indexed in ChromaDB, querying with the idea's title and description should return that idea in the results.
**Validates: Requirements 4.3**

### Property 20: Metadata Preservation
*For any* idea stored in ChromaDB with metadata (title, team, category, status), retrieving the idea should return the same metadata values.
**Validates: Requirements 4.4**


### Property 21: Session Context Association
*For any* uploaded document, the context should be retrievable using the user's session ID.
**Validates: Requirements 6.1**

### Property 22: Context Inclusion Effect
*For any* query with session context, the search results should differ from the same query without context (when relevant context exists).
**Validates: Requirements 6.2**

### Property 23: Context Reset Completeness
*For any* session with uploaded context, resetting the context should make the context no longer retrievable.
**Validates: Requirements 6.3**

### Property 24: Context Status Accuracy
*For any* session, checking context status should correctly reflect whether context exists (hasContext = true if context exists, false otherwise).
**Validates: Requirements 6.5**

### Property 25: Provider Switch Reset
*For any* session with existing context using provider A, uploading a document with provider B should clear the old context before storing new context.
**Validates: Requirements 6.6**

### Property 26: Provider Tracking
*For any* session with uploaded context, the system should record and return the embedding provider used for that context.
**Validates: Requirements 6.7**

### Property 27: Context Replacement
*For any* session with existing context, uploading a new document should replace the old context with the new document's chunks.
**Validates: Requirements 6.8**

### Property 28: Status Display Completeness
*For any* session with context, the status response should include chunk count, themes, and keywords.
**Validates: Requirements 6.9**

## Error Handling

### Error Categories

1. **Validation Errors (400)**
   - Invalid file type
   - File size exceeds limit
   - Missing required parameters
   - Invalid embedding provider

2. **Authentication Errors (401)**
   - Missing or invalid token
   - Expired session

3. **Not Found Errors (404)**
   - Session not found
   - Idea not found
   - Collection not found

4. **Service Errors (503)**
   - Database unavailable
   - ChromaDB unavailable
   - Gemini API unavailable

5. **Processing Errors (500)**
   - Text extraction failed
   - Embedding generation failed
   - Vector store operation failed


### Error Handling Strategy

**Retry Logic**:
```javascript
async function withRetry(fn, maxRetries = 3, backoffMs = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const waitTime = backoffMs * Math.pow(2, attempt - 1);
      console.warn(`Attempt ${attempt} failed, retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}
```

**Graceful Degradation**:
- If Gemini API fails, fall back to Ollama for embeddings
- If external search fails, continue with internal results only
- If embedding fails during idea indexing, log error but don't block submission
- If theme extraction fails, use simple keyword extraction

**User-Friendly Error Messages**:
```javascript
const ERROR_MESSAGES = {
  FILE_TOO_LARGE: 'File size exceeds 10MB limit. Please upload a smaller file.',
  INVALID_FILE_TYPE: 'Only PDF, DOCX, and TXT files are supported.',
  PDF_CORRUPTED: 'The PDF file appears to be corrupted. Try re-saving the PDF or using a different file.',
  PDF_ENCRYPTED: 'The PDF file is password-protected. Please provide an unprotected PDF.',
  PDF_NO_TEXT: 'The PDF contains no extractable text. It may be a scanned image.',
  SESSION_NOT_FOUND: 'Session not found. Please refresh the page.',
  DB_UNAVAILABLE: 'Database is temporarily unavailable. Please try again later.',
  API_KEY_MISSING: 'AI service is not configured. Please contact support.'
};
```

## Testing Strategy

### Unit Testing

**Framework**: Jest with Node.js

**Test Coverage**:
1. Document extraction for each file type (PDF, DOCX, TXT)
2. Text chunking with various input sizes
3. Embedding generation with different providers
4. ChromaDB operations (create, add, query, delete)
5. Session management (create, update, retrieve, expire)
6. Error handling for invalid inputs
7. Retry logic for transient failures

**Example Unit Test**:
```javascript
describe('Document Service', () => {
  test('should extract text from valid PDF', async () => {
    const buffer = await fs.readFile('test-files/sample.pdf');
    const text = await extractDocument(buffer, 'application/pdf');
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  });
  
  test('should chunk text with proper overlap', async () => {
    const text = 'a'.repeat(2000);
    const chunks = await chunkText(text, 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(550);
    });
  });
});
```


### Property-Based Testing

**Framework**: fast-check (JavaScript property-based testing library)

**Configuration**: Each property test should run a minimum of 100 iterations to ensure comprehensive coverage of the input space.

**Test Tagging**: Each property-based test must include a comment explicitly referencing the correctness property from this design document using the format:
```javascript
// Feature: semantic-agent-integration, Property 1: Text Extraction Completeness
```

**Property Test Examples**:

```javascript
const fc = require('fast-check');

// Feature: semantic-agent-integration, Property 2: Chunking Coverage
test('chunking should cover entire text without loss', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1000, maxLength: 5000 }),
      async (text) => {
        const chunks = await chunkText(text, 500, 50);
        const reconstructed = chunks.join('');
        
        // All content should be present in chunks
        const words = text.split(/\s+/).filter(w => w.length > 3);
        const missingWords = words.filter(word => 
          !chunks.some(chunk => chunk.includes(word))
        );
        
        expect(missingWords.length).toBe(0);
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: semantic-agent-integration, Property 3: Embedding Dimension Consistency
test('embeddings should have consistent dimensions', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 2, maxLength: 10 }),
      async (texts) => {
        const embeddings = await generateEmbeddings(texts, 'gemini');
        
        const firstDim = embeddings[0].length;
        embeddings.forEach(emb => {
          expect(emb.length).toBe(firstDim);
        });
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: semantic-agent-integration, Property 4: Storage Round Trip
test('stored embeddings should be retrievable', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.array(fc.string({ minLength: 50, maxLength: 200 }), { minLength: 1, maxLength: 5 }),
      async (sessionId, documents) => {
        const embeddings = await generateEmbeddings(documents, 'gemini');
        await addDocuments(sessionId, documents, embeddings);
        
        const queryEmb = embeddings[0];
        const results = await queryCollection(sessionId, queryEmb, 5);
        
        expect(results.documents.length).toBeGreaterThan(0);
        expect(results.documents).toContain(documents[0]);
        
        await deleteCollection(sessionId);
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: semantic-agent-integration, Property 15: Similarity Score Ordering
test('search results should be sorted by similarity', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 10, maxLength: 50 }),
      async (query) => {
        const results = await semanticSearchIdeas(query, 'gemini', 10);
        
        for (let i = 1; i < results.length; i++) {
          expect(results[i-1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
        }
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: semantic-agent-integration, Property 19: Idea Indexing Round Trip
test('indexed ideas should be retrievable', () => {
  fc.assert(
    fc.property(
      fc.record({
        id: fc.integer({ min: 1, max: 10000 }),
        title: fc.string({ minLength: 10, maxLength: 100 }),
        description: fc.string({ minLength: 50, maxLength: 500 }),
        team: fc.string({ minLength: 5, maxLength: 50 })
      }),
      async (idea) => {
        await indexIdea(chromaClient, idea, 'gemini');
        
        const query = idea.title;
        const results = await searchSimilarIdeas(chromaClient, db, query, 'gemini', 10);
        
        const found = results.some(r => r.id === idea.id.toString());
        expect(found).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
});
```


### Integration Testing

**Test Scenarios**:
1. **End-to-End Document Upload**: Upload → Process → Store → Query → Retrieve
2. **Agent Q&A Workflow**: Submit query → Poll status → Receive result with citations
3. **Semantic Search**: Index ideas → Search → Verify results
4. **Session Management**: Create session → Upload context → Query with context → Reset
5. **Provider Switching**: Upload with provider A → Switch to provider B → Verify reset
6. **Error Recovery**: Simulate API failures → Verify fallback behavior

**Example Integration Test**:
```javascript
describe('Document Upload Integration', () => {
  let sessionId;
  
  beforeEach(() => {
    sessionId = 'test-session-' + Date.now();
  });
  
  afterEach(async () => {
    await deleteCollection(sessionId);
  });
  
  test('complete document upload workflow', async () => {
    // 1. Upload document
    const file = await fs.readFile('test-files/sample.pdf');
    const response = await request(app)
      .post('/api/context/upload')
      .set('Cookie', `connect.sid=${sessionId}`)
      .attach('file', file, 'sample.pdf')
      .field('embeddingProvider', 'gemini');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.chunksProcessed).toBeGreaterThan(0);
    expect(response.body.themes).toBeDefined();
    expect(response.body.suggestedQuestions).toBeDefined();
    
    // 2. Verify context status
    const statusResponse = await request(app)
      .get('/api/context/status')
      .set('Cookie', `connect.sid=${sessionId}`);
    
    expect(statusResponse.body.hasContext).toBe(true);
    expect(statusResponse.body.stats.documentCount).toBeGreaterThan(0);
    
    // 3. Query with context
    const queryResponse = await request(app)
      .post('/api/agent/session')
      .set('Cookie', `connect.sid=${sessionId}`)
      .send({
        userQuery: 'What are the main topics in the document?',
        embeddingProvider: 'gemini'
      });
    
    expect(queryResponse.status).toBe(202);
    expect(queryResponse.body.jobId).toBeDefined();
    
    // 4. Poll for result
    const jobId = queryResponse.body.jobId;
    let completed = false;
    let attempts = 0;
    
    while (!completed && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResp = await request(app)
        .get(`/api/agent/session/${jobId}/status`);
      
      if (statusResp.body.status === 'completed') {
        completed = true;
        expect(statusResp.body.result).toBeDefined();
        expect(statusResp.body.result.usedEphemeralContext).toBe(true);
      }
      
      attempts++;
    }
    
    expect(completed).toBe(true);
  });
});
```


## Implementation Details

### Gemini 1.5 Flash Integration

**API Configuration**:
```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// For embeddings
const embeddingModel = genAI.getGenerativeModel({ 
  model: "text-embedding-004" 
});

// For text generation
const generativeModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash" 
});
```

**Embedding Generation**:
```javascript
async function generateGeminiEmbedding(text) {
  try {
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    if (error.message.includes('429')) {
      // Rate limit - implement backoff
      throw new Error('Rate limit exceeded');
    }
    throw error;
  }
}
```

**Structured Output for Theme Extraction**:
```javascript
async function extractThemesWithGemini(text) {
  const prompt = `Analyze this document and extract key information for a RAG system.
  
Return JSON with:
- topics: Key topics (max 5)
- techStack: Technologies mentioned (max 5)
- industry: Relevant industries (max 3)
- keywords: Important keywords (max 10)
- suggestedQuestions: Questions users might ask (5-8)

Document: ${text.substring(0, 15000)}`;

  const result = await generativeModel.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 1000
    }
  });

  return JSON.parse(result.response.text());
}
```

### ChromaDB Configuration

**Initialization**:
```javascript
import { ChromaClient } from 'chromadb';

let chromaClient = null;

export async function initChromaDB() {
  if (!chromaClient) {
    chromaClient = new ChromaClient({
      path: process.env.CHROMA_PATH || 'http://localhost:8000'
    });
    
    // Ensure ideas collection exists
    try {
      await chromaClient.getOrCreateCollection({
        name: 'ideas_collection',
        metadata: { description: 'Innovation idea submissions' }
      });
      console.log('✅ ChromaDB initialized with ideas_collection');
    } catch (error) {
      console.error('❌ ChromaDB initialization failed:', error);
    }
  }
  
  return chromaClient;
}
```

**Collection Management**:
```javascript
// Session-specific collections for ephemeral context
async function createSessionCollection(sessionId) {
  const collection = await chromaClient.getOrCreateCollection({
    name: sessionId,
    metadata: { 
      type: 'ephemeral',
      createdAt: new Date().toISOString()
    }
  });
  return collection;
}

// Persistent ideas collection
async function getIdeasCollection() {
  return await chromaClient.getCollection({ name: 'ideas_collection' });
}
```


### Session Management

**Express Session Configuration**:
```javascript
import session from 'express-session';

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
```

**Session Context Tracking**:
```javascript
// Middleware to track context provider
function trackContextProvider(req, res, next) {
  if (!req.session.contextProvider) {
    req.session.contextProvider = null;
  }
  next();
}

// Store provider when uploading
req.session.contextProvider = embeddingProvider;

// Check provider mismatch
if (req.session.contextProvider && req.session.contextProvider !== embeddingProvider) {
  console.warn(`Provider mismatch: ${req.session.contextProvider} → ${embeddingProvider}`);
  await deleteCollection(req.session.id);
  req.session.contextProvider = embeddingProvider;
}
```

### Performance Optimizations

**1. Batch Processing**:
```javascript
async function generateEmbeddingsBatch(texts, provider, batchSize = 10) {
  const embeddings = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchPromises = batch.map(text => generateSingleEmbedding(text, provider));
    const batchResults = await Promise.all(batchPromises);
    embeddings.push(...batchResults);
  }
  
  return embeddings;
}
```

**2. Parallel Execution**:
```javascript
// Execute internal and external searches in parallel
const [internalResults, externalResults] = await Promise.allSettled([
  internalTool.execute(userQuery),
  tavilyTool.execute(userQuery)
]);
```

**3. Connection Pooling**:
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

**4. Caching Strategy**:
```javascript
// Cache embedding model instance
let cachedEmbeddingModel = null;

function getEmbeddingModel() {
  if (!cachedEmbeddingModel) {
    cachedEmbeddingModel = genAI.getGenerativeModel({ 
      model: "text-embedding-004" 
    });
  }
  return cachedEmbeddingModel;
}
```


### Security Considerations

**1. Input Validation**:
```javascript
// File upload validation
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function validateFile(file) {
  if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
    throw new Error('Invalid file type');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large');
  }
}
```

**2. API Key Protection**:
```javascript
// Never expose API keys in responses
function sanitizeError(error) {
  const message = error.message || 'An error occurred';
  // Remove any potential API keys or sensitive data
  return message.replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]');
}
```

**3. Rate Limiting**:
```javascript
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per window
  message: 'Too many uploads, please try again later'
});

app.use('/api/context/upload', uploadLimiter);
```

**4. Session Isolation**:
```javascript
// Ensure users can only access their own session data
function validateSessionAccess(req, sessionId) {
  if (req.session.id !== sessionId) {
    throw new Error('Unauthorized access to session');
  }
}
```

### Monitoring and Logging

**Structured Logging**:
```javascript
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    }));
  },
  
  error: (message, error, meta = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      error: error.message,
      stack: error.stack,
      ...meta
    }));
  }
};

// Usage
logger.info('Document processed', {
  sessionId,
  chunkCount: chunks.length,
  provider: embeddingProvider
});
```

**Performance Metrics**:
```javascript
function trackPerformance(operation) {
  const start = Date.now();
  
  return {
    end: () => {
      const duration = Date.now() - start;
      logger.info(`${operation} completed`, { duration });
      return duration;
    }
  };
}

// Usage
const timer = trackPerformance('document-processing');
await processDocument(buffer, mimetype);
timer.end();
```


## Deployment Considerations

### Environment Variables

Required environment variables:
```bash
# Google Gemini API
API_KEY=your-gemini-api-key

# Database
DATABASE_URL=postgresql://user:pass@host:5432/ideaflow

# ChromaDB
CHROMA_PATH=http://localhost:8000

# Session
SESSION_SECRET=your-session-secret

# External APIs
TAVILY_API_KEY=your-tavily-api-key
OPENROUTER_API_KEY=your-openrouter-api-key  # Fallback

# Server
PORT=3001
NODE_ENV=production

# Embedding Provider (default)
EMBEDDING_PROVIDER=gemini
```

### Production Checklist

- [ ] Set strong SESSION_SECRET
- [ ] Configure HTTPS for production
- [ ] Set up ChromaDB persistence
- [ ] Configure database connection pooling
- [ ] Enable rate limiting
- [ ] Set up error monitoring (e.g., Sentry)
- [ ] Configure log aggregation
- [ ] Set up health check endpoints
- [ ] Configure CORS for production domain
- [ ] Enable compression middleware
- [ ] Set up automated backups for PostgreSQL
- [ ] Configure session store (Redis recommended)
- [ ] Set up API key rotation policy
- [ ] Enable request logging
- [ ] Configure timeout values

### Scalability Considerations

**Horizontal Scaling**:
- Use Redis for session storage (instead of in-memory)
- Deploy ChromaDB as a separate service
- Use load balancer for multiple API instances
- Implement job queue for agent processing (e.g., Bull)

**Vertical Scaling**:
- Increase database connection pool size
- Allocate more memory for ChromaDB
- Optimize embedding batch sizes
- Cache frequently accessed embeddings

**Cost Optimization**:
- Monitor Gemini API usage
- Implement request caching
- Use batch processing where possible
- Set up usage alerts
- Consider embedding caching for common queries

## Migration Strategy

### Phase 1: Gemini Integration
1. Add Gemini API client to embedding service
2. Update embedding provider selection logic
3. Test embedding generation with Gemini
4. Deploy with feature flag

### Phase 2: Enhanced Document Processing
1. Update document service with AI theme extraction
2. Implement question generation
3. Add structured output parsing
4. Test with various document types

### Phase 3: Semantic Search Enhancement
1. Index existing ideas in ChromaDB
2. Update search endpoints
3. Add hybrid search capability
4. Test search quality

### Phase 4: Agent Improvements
1. Update agent synthesis to use Gemini
2. Enhance citation formatting
3. Improve context inclusion
4. Test end-to-end workflows

### Phase 5: Production Hardening
1. Add comprehensive error handling
2. Implement monitoring and logging
3. Performance optimization
4. Security audit
5. Load testing

## Success Metrics

### Performance Metrics
- Document processing time: < 5 seconds for 10-page PDF
- Embedding generation: < 2 seconds for 10 chunks
- Semantic search response: < 1 second
- Agent query completion: < 10 seconds

### Quality Metrics
- Search relevance: > 80% user satisfaction
- Question quality: > 70% questions used
- Citation accuracy: > 95% correct references
- Theme extraction accuracy: > 85% relevant themes

### Reliability Metrics
- API uptime: > 99.5%
- Error rate: < 1%
- Successful uploads: > 98%
- Session persistence: > 99%
