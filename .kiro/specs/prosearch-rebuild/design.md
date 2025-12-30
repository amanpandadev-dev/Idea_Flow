# ProSearch Rebuild - Design Document

## Overview

The ProSearch system is a conversational semantic search engine that enables users to discover and filter innovation ideas through natural language queries. The architecture is built on three core principles:

1. **Single Vector Search**: Semantic search via ChromaDB occurs exactly once per conversation
2. **Deterministic Filtering**: All follow-up interactions apply rule-based filters without AI guessing
3. **State Persistence**: Conversation state is stored in PostgreSQL for instant restoration and stability

The system operates in two distinct phases:
- **Phase 1 (Initial Search)**: User query → Embedding → ChromaDB query → Store base results
- **Phase 2 (Refinement)**: User message → Extract filters → Apply to base results → Update state

## Architecture

### High-Level Architecture

```
┌─────────────┐
│   Client    │
│  (React)    │
└──────┬──────┘
       │ POST /api/prosearch/chat
       │ {conversationId, message}
       ▼
┌─────────────────────────────────────┐
│     ProSearch API Endpoint          │
│  (prosearchRoutes.js)               │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  ProSearch Service                  │
│  (prosearchService.js)              │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ Conversation Manager         │  │
│  │ - New vs Existing            │  │
│  │ - State Orchestration        │  │
│  └──────────────────────────────┘  │
└──────┬──────────────────────────────┘
       │
       ├─────────────┬──────────────┬──────────────┐
       ▼             ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Embedding│  │  Filter  │  │PostgreSQL│  │ ChromaDB │
│ Service  │  │Extractor │  │  (State) │  │ (Vector) │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Data Flow

**New Conversation Flow:**
```
User Query
    ↓
Generate Embedding (embeddingService.js)
    ↓
Query ChromaDB (chroma.js)
    ↓
Store: base_query, base_result_ids, current_result_ids
    ↓
Hydrate Results from PostgreSQL
    ↓
Return: {conversationId, results, appliedFilters, isNewBaseSearch: true}
```

**Follow-up Message Flow:**
```
User Message + conversationId
    ↓
Load Conversation State from PostgreSQL
    ↓
Extract Filters (filterExtractor.js)
    ↓
Apply Filters to base_result_ids
    ↓
Update: current_result_ids, applied_filters
    ↓
Hydrate Results from PostgreSQL
    ↓
Return: {conversationId, results, appliedFilters, isNewBaseSearch: false}
```

## Components and Interfaces

### 1. ProSearch Routes (`backend/routes/prosearchRoutes.js`)

**Responsibility**: HTTP endpoint handling and request/response formatting

**Interface**:
```javascript
POST /api/prosearch/chat

Request:
{
  conversationId: string | null,  // UUID or null for new conversation
  message: string                  // User's natural language query/message
}

Response:
{
  conversationId: string,          // UUID of conversation
  results: IdeaCard[],             // Array of matching ideas
  appliedFilters: {
    technologies: string[],
    businessGroups: string[],
    themes: string[],
    years: number[]
  },
  isNewBaseSearch: boolean         // true if this was initial search
}

Error Response:
{
  error: string,
  message: string
}
```

**Validation Rules**:
- `message` must be non-empty string
- `conversationId` must be valid UUID or null
- Returns 400 for validation errors
- Returns 404 if conversationId not found
- Returns 500 for server errors

### 2. ProSearch Service (`backend/services/prosearchService.js`)

**Responsibility**: Core business logic orchestration

**Key Functions**:

```javascript
/**
 * Process a ProSearch chat message
 * @param {string|null} conversationId - Existing conversation ID or null
 * @param {string} message - User message
 * @returns {Promise<ProSearchResponse>}
 */
async function processChat(conversationId, message)

/**
 * Create new conversation with initial semantic search
 * @param {string} query - User's search query
 * @returns {Promise<Conversation>}
 */
async function createNewConversation(query)

/**
 * Process follow-up message in existing conversation
 * @param {string} conversationId - Conversation UUID
 * @param {string} message - User message
 * @returns {Promise<Conversation>}
 */
async function processFollowUp(conversationId, message)

/**
 * Hydrate idea results from PostgreSQL
 * @param {number[]} ideaIds - Array of idea IDs
 * @param {number[]} baseResultIds - Original search order for scoring
 * @returns {Promise<IdeaCard[]>}
 */
async function hydrateResults(ideaIds, baseResultIds)
```

### 3. Filter Extractor (`backend/services/filterExtractor.js`)

**Responsibility**: Deterministic extraction of filters from user messages

**Interface**:
```javascript
/**
 * Extract filters from user message using rule-based patterns
 * @param {string} message - User message
 * @param {FilterContext} context - Current filter state and available values
 * @returns {FilterExtractionResult}
 */
function extractFilters(message, context)

// Return type
{
  technologies: string[],      // e.g., ["Datadog", "Kubernetes"]
  businessGroups: string[],    // e.g., ["Healthcare", "Banking"]
  themes: string[],            // e.g., ["AI for Cybersecurity"]
  years: number[],             // e.g., [2024, 2025]
  mode: "ADD" | "REMOVE" | "REPLACE"
}
```

**Pattern Matching Rules**:

1. **Technology Extraction**:
   - Match against predefined technology list from database
   - Case-insensitive matching
   - Support common variations (e.g., "k8s" → "Kubernetes")

2. **Business Group Extraction**:
   - Match against known business groups
   - Support partial matches (e.g., "health" → "Healthcare")

3. **Theme Extraction**:
   - Match against challenge_opportunity/theme values
   - Support fuzzy matching for multi-word themes

4. **Year Extraction**:
   - Regex pattern: `\b(202[1-5])\b`
   - Support ranges: "2023 to 2024" → [2023, 2024]
   - Support "latest" → current year

5. **Mode Detection**:
   - **ADD** (default): "show", "include", "add", "also"
   - **REMOVE**: "exclude", "remove", "without", "not"
   - **REPLACE**: "only", "just", "switch to"

**Example Extractions**:
```javascript
// Input: "show me Datadog projects"
// Output: {technologies: ["Datadog"], mode: "ADD"}

// Input: "only Healthcare ideas"
// Output: {businessGroups: ["Healthcare"], mode: "REPLACE"}

// Input: "exclude 2021 and 2022"
// Output: {years: [2021, 2022], mode: "REMOVE"}

// Input: "Kubernetes in Banking from 2024"
// Output: {technologies: ["Kubernetes"], businessGroups: ["Banking"], years: [2024], mode: "ADD"}
```

### 4. Conversation State Manager (`backend/services/conversationStateManager.js`)

**Responsibility**: PostgreSQL persistence and retrieval

**Interface**:
```javascript
/**
 * Create new conversation record
 * @param {string} baseQuery - Initial search query
 * @param {number[]} baseResultIds - IDs from ChromaDB search
 * @returns {Promise<string>} conversationId
 */
async function createConversation(baseQuery, baseResultIds)

/**
 * Load conversation state
 * @param {string} conversationId - Conversation UUID
 * @returns {Promise<ConversationState>}
 */
async function loadConversation(conversationId)

/**
 * Update conversation with new filters and results
 * @param {string} conversationId - Conversation UUID
 * @param {number[]} currentResultIds - Filtered result IDs
 * @param {object} appliedFilters - Current filter state
 * @returns {Promise<void>}
 */
async function updateConversation(conversationId, currentResultIds, appliedFilters)
```

### 5. Filter Application Engine (`backend/services/filterApplicator.js`)

**Responsibility**: Apply filters to result sets using strict AND logic

**Interface**:
```javascript
/**
 * Apply filters to base result set
 * @param {number[]} baseResultIds - Original search results
 * @param {object} filters - Filters to apply
 * @param {object} currentFilters - Previously applied filters
 * @param {string} mode - Filter mode (ADD/REMOVE/REPLACE)
 * @returns {Promise<number[]>} Filtered idea IDs
 */
async function applyFilters(baseResultIds, filters, currentFilters, mode)
```

**Filter Logic**:
```sql
-- Pseudo-SQL for filter application
SELECT idea_id FROM ideas
WHERE idea_id = ANY($baseResultIds)
  AND (technologies @> $techFilters OR $techFilters IS EMPTY)
  AND (business_group = ANY($bgFilters) OR $bgFilters IS EMPTY)
  AND (theme ILIKE ANY($themeFilters) OR $themeFilters IS EMPTY)
  AND (EXTRACT(YEAR FROM created_at) = ANY($yearFilters) OR $yearFilters IS EMPTY)
ORDER BY array_position($baseResultIds, idea_id)
```

## Data Models

### PostgreSQL Schema

```sql
CREATE TABLE prosearch_conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_query TEXT NOT NULL,
  base_result_ids INTEGER[] NOT NULL,
  current_result_ids INTEGER[] NOT NULL,
  applied_filters JSONB NOT NULL DEFAULT '{"technologies":[],"businessGroups":[],"themes":[],"years":[]}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prosearch_conversations_created_at 
  ON prosearch_conversations(created_at DESC);

CREATE INDEX idx_prosearch_conversations_updated_at 
  ON prosearch_conversations(updated_at DESC);
```

**Field Descriptions**:
- `conversation_id`: Unique identifier for conversation
- `base_query`: Original user query that initiated the search
- `base_result_ids`: Ordered array of idea IDs from initial ChromaDB search
- `current_result_ids`: Ordered array of idea IDs after applying filters
- `applied_filters`: JSONB object storing current filter state
- `created_at`: Conversation creation timestamp
- `updated_at`: Last modification timestamp

### TypeScript Interfaces

```typescript
interface ProSearchRequest {
  conversationId: string | null;
  message: string;
}

interface ProSearchResponse {
  conversationId: string;
  results: IdeaCard[];
  appliedFilters: AppliedFilters;
  isNewBaseSearch: boolean;
}

interface IdeaCard {
  idea_id: number;
  title: string;
  summary: string;
  theme: string;
  business_group: string;
  technologies: string[];
  year: number;
  matchScore: number;  // 0-1, derived from search rank
}

interface AppliedFilters {
  technologies: string[];
  businessGroups: string[];
  themes: string[];
  years: number[];
}

interface ConversationState {
  conversation_id: string;
  base_query: string;
  base_result_ids: number[];
  current_result_ids: number[];
  applied_filters: AppliedFilters;
  created_at: Date;
  updated_at: Date;
}

interface FilterExtractionResult {
  technologies: string[];
  businessGroups: string[];
  themes: string[];
  years: number[];
  mode: "ADD" | "REMOVE" | "REPLACE";
}
```

### ChromaDB Collection Schema

**Collection Name**: `ideas_semantic_index`

**Document Structure**:
```javascript
{
  id: "idea_123",           // String: "idea_{idea_id}"
  embedding: [0.1, 0.2, ...], // 768-dim vector (Gemini) or 1024-dim (Grok)
  metadata: {
    idea_id: 123,           // Integer
    title: "...",           // String
    summary: "...",         // String (used for embedding)
    business_group: "...",  // String
    theme: "...",           // String
    year: 2024              // Integer
  },
  document: "..."           // Full text (title + summary)
}
```

## Error Handling

### Error Categories

1. **Validation Errors (400)**:
   - Empty message
   - Invalid conversationId format
   - Missing required fields

2. **Not Found Errors (404)**:
   - ConversationId does not exist
   - No ideas found for given IDs

3. **Server Errors (500)**:
   - ChromaDB connection failure
   - PostgreSQL query failure
   - Embedding generation failure

### Error Response Format

```javascript
{
  error: "ERROR_CODE",
  message: "Human-readable error message",
  details: {  // Optional
    field: "conversationId",
    value: "invalid-uuid"
  }
}
```

### Retry Strategy

- **ChromaDB queries**: No retry (fail fast)
- **PostgreSQL queries**: 3 retries with exponential backoff
- **Embedding generation**: 3 retries with exponential backoff (handled by embeddingService)

### Logging

All operations must log:
- Request ID (generated per request)
- Conversation ID
- Operation type (new_search, follow_up, filter_apply)
- Execution time
- Result count
- Errors with stack traces

## Testing Strategy

### Unit Testing

**Framework**: Jest

**Test Files**:
- `filterExtractor.test.js`: Test pattern matching and mode detection
- `filterApplicator.test.js`: Test filter logic and SQL generation
- `conversationStateManager.test.js`: Test CRUD operations
- `prosearchService.test.js`: Test orchestration logic

**Key Test Cases**:
1. Filter extraction with various input patterns
2. Filter application with different combinations
3. Conversation state persistence and retrieval
4. Result hydration and ordering
5. Error handling for invalid inputs

### Property-Based Testing

**Framework**: fast-check (JavaScript property-based testing library)

**Configuration**: Each property test runs 100 iterations minimum


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several properties can be consolidated to eliminate redundancy:

- Properties 3.1, 3.2, and 3.5 all test idempotence of conversation retrieval → Combined into Property 3
- Properties 9.1, 9.2, and 9.3 all test that follow-ups don't trigger searches → Combined into Property 9
- Properties 5.2, 5.3, 5.4, 5.5 all test individual filter types → Combined into Property 5 (comprehensive filter validation)
- Properties 7.3 and 3.4 both test order preservation → Combined into Property 7

### Core Properties

**Property 1: Single search per conversation**
*For any* new conversation, the system should perform exactly one ChromaDB query, and for any existing conversation, follow-up messages should perform zero ChromaDB queries.
**Validates: Requirements 1.1, 9.5, 2.1, 9.2**

**Property 2: Conversation state round-trip**
*For any* conversation created with a query and result IDs, storing and then retrieving the conversation should return the exact same base_query and base_result_ids.
**Validates: Requirements 1.2, 2.4**

**Property 3: Conversation retrieval idempotence**
*For any* conversation, retrieving it multiple times should return identical current_result_ids and applied_filters.
**Validates: Requirements 3.1, 3.2, 3.5**

**Property 4: Filter extraction determinism**
*For any* user message, running filter extraction multiple times should produce identical results (same technologies, business groups, themes, years, and mode).
**Validates: Requirements 2.2, 4.1**

**Property 5: Filter application correctness**
*For any* set of filters applied to a base result set, all returned ideas should match ALL filter criteria (AND logic), and the result count should be less than or equal to the base result count.
**Validates: Requirements 2.3, 5.1, 5.2, 5.3, 5.4, 5.5**

**Property 6: Filter monotonicity**
*For any* base result set, adding additional filter criteria should never increase the result count (filters only narrow results).
**Validates: Requirements 2.3, 5.1**

**Property 7: Result order preservation**
*For any* ordered list of idea IDs, hydrating those IDs should return results in the exact same order.
**Validates: Requirements 3.4, 7.3**

**Property 8: Result completeness**
*For any* returned idea, all required fields (title, summary, theme, business_group, technologies, year, matchScore) should be present and non-null.
**Validates: Requirements 1.4, 7.1**

**Property 9: Follow-up operates on base results**
*For any* existing conversation with base_result_ids, the current_result_ids after any follow-up should be a subset of base_result_ids.
**Validates: Requirements 9.4, 2.3**

**Property 10: Empty filter result**
*For any* filter combination that matches no ideas in the base result set, the system should return exactly an empty array (not null, not undefined).
**Validates: Requirements 2.5, 5.6**

**Property 11: Conversation isolation**
*For any* two different conversations, applying filters to one should not change the state of the other.
**Validates: Requirements 10.1, 10.2**

**Property 12: UUID uniqueness**
*For any* set of newly created conversations, all conversation_ids should be unique valid UUIDs.
**Validates: Requirements 1.3, 10.4**

**Property 13: Response structure validity**
*For any* API response, it should contain conversationId (UUID), results (array), appliedFilters (object with arrays), and isNewBaseSearch (boolean).
**Validates: Requirements 8.3**

**Property 14: Match score ordering**
*For any* result set, ideas that appear earlier in base_result_ids should have match scores greater than or equal to ideas that appear later.
**Validates: Requirements 7.4**

**Property 15: Filter extraction structure**
*For any* filter extraction result, it should contain technologies (array), businessGroups (array), themes (array), years (array), and mode (string enum).
**Validates: Requirements 4.7**

**Property 16: Year range validation**
*For any* message containing years, only years between 2021 and 2025 (inclusive) should be extracted.
**Validates: Requirements 4.5**

**Property 17: Conversation update immutability**
*For any* conversation update, the conversation_id, base_query, base_result_ids, and created_at should remain unchanged.
**Validates: Requirements 6.3**

**Property 18: Embedding dimension consistency**
*For any* query embedding generated, its dimension should match the dimension of embeddings in the ChromaDB collection.
**Validates: Requirements 1.5**

**Property 19: Invalid input rejection**
*For any* request with an empty message or invalid conversationId format, the system should return a 400 error.
**Validates: Requirements 8.5**

**Property 20: Result hydration correctness**
*For any* set of idea IDs, the hydrated results should contain exactly those ideas with matching idea_id values.
**Validates: Requirements 3.3, 7.2**

### Edge Cases

The following edge cases should be handled by the property tests through appropriate test data generation:

- Empty base result sets (no matches from initial search)
- Very large result sets (1000+ ideas)
- Filters that match all results (no narrowing)
- Filters that match no results (complete narrowing)
- Messages with no extractable filters
- Messages with multiple filters of the same type
- Concurrent requests to the same conversation
- Malformed UUIDs
- Non-existent conversation IDs

## Testing Strategy

### Unit Testing Framework

**Framework**: Jest
**Location**: `backend/tests/prosearch/`

### Property-Based Testing Framework

**Framework**: fast-check (https://github.com/dubzzz/fast-check)
**Installation**: `npm install --save-dev fast-check`
**Configuration**: Minimum 100 iterations per property test

### Test Organization

```
backend/tests/prosearch/
├── unit/
│   ├── filterExtractor.test.js
│   ├── filterApplicator.test.js
│   ├── conversationStateManager.test.js
│   └── prosearchService.test.js
├── property/
│   ├── conversation-lifecycle.pbt.js
│   ├── filter-extraction.pbt.js
│   ├── filter-application.pbt.js
│   └── result-hydration.pbt.js
└── integration/
    └── prosearch-api.test.js
```

### Property Test Tagging

Each property-based test MUST include a comment tag in this exact format:

```javascript
/**
 * Feature: prosearch-rebuild, Property 1: Single search per conversation
 * Validates: Requirements 1.1, 9.5, 2.1, 9.2
 */
test('property: single search per conversation', () => {
  fc.assert(
    fc.property(fc.string(), async (query) => {
      // Test implementation
    }),
    { numRuns: 100 }
  );
});
```

### Test Data Generators

Property tests require custom generators for:

```javascript
// Generator for valid user queries
const queryGenerator = fc.string({ minLength: 1, maxLength: 200 });

// Generator for idea IDs
const ideaIdGenerator = fc.integer({ min: 1, max: 10000 });

// Generator for idea ID arrays
const ideaIdArrayGenerator = fc.array(ideaIdGenerator, { minLength: 0, maxLength: 100 });

// Generator for filter messages
const filterMessageGenerator = fc.oneof(
  fc.constant("show me Datadog projects"),
  fc.constant("only Healthcare ideas"),
  fc.constant("exclude 2021"),
  fc.constant("Kubernetes in Banking from 2024")
);

// Generator for conversation states
const conversationStateGenerator = fc.record({
  conversation_id: fc.uuid(),
  base_query: queryGenerator,
  base_result_ids: ideaIdArrayGenerator,
  current_result_ids: ideaIdArrayGenerator,
  applied_filters: fc.record({
    technologies: fc.array(fc.string()),
    businessGroups: fc.array(fc.string()),
    themes: fc.array(fc.string()),
    years: fc.array(fc.integer({ min: 2021, max: 2025 }))
  })
});
```

### Unit Test Coverage

**Minimum Coverage**: 80% line coverage for all service files

**Critical Paths to Test**:
1. Filter extraction with various message patterns
2. Filter application with different combinations
3. Conversation CRUD operations
4. Result hydration and ordering
5. Error handling for all error types
6. UUID generation and validation
7. Request validation

### Integration Testing

**Scope**: End-to-end API testing with real PostgreSQL and mock ChromaDB

**Test Scenarios**:
1. Complete conversation lifecycle (new → follow-up → retrieve)
2. Multiple concurrent conversations
3. Filter application across multiple follow-ups
4. Error scenarios (invalid IDs, missing data)
5. Large result sets (performance validation)

### Mock Strategy

**Mock ChromaDB**: Yes - use in-memory mock for predictable results
**Mock PostgreSQL**: No - use test database with transactions
**Mock Embedding Service**: Yes - return fixed-dimension vectors

### Test Database Setup

```sql
-- Test database initialization
CREATE DATABASE prosearch_test;

-- Run migrations
\i backend/migrations/create_prosearch_conversations.sql

-- Seed test data
INSERT INTO ideas (idea_id, title, summary, theme, business_group, code_preference, created_at)
VALUES
  (1, 'Test Idea 1', 'Summary 1', 'AI', 'Healthcare', 'Datadog,Kubernetes', '2024-01-01'),
  (2, 'Test Idea 2', 'Summary 2', 'FinOps', 'Banking', 'Kubernetes', '2023-01-01'),
  (3, 'Test Idea 3', 'Summary 3', 'Cybersecurity', 'Healthcare', 'Datadog', '2024-01-01');
```

### Performance Testing

**Benchmarks**:
- Initial search: < 500ms (including embedding + ChromaDB query)
- Follow-up filter: < 100ms (database query only)
- Conversation retrieval: < 50ms (database query only)
- Result hydration (100 ideas): < 200ms

**Load Testing**:
- 100 concurrent conversations
- 1000 total conversations in database
- 10,000 ideas in database

### Test Execution

```bash
# Run all tests
npm test

# Run unit tests only
npm test -- backend/tests/prosearch/unit

# Run property tests only
npm test -- backend/tests/prosearch/property

# Run with coverage
npm test -- --coverage

# Run specific property test
npm test -- backend/tests/prosearch/property/conversation-lifecycle.pbt.js
```

## Implementation Notes

### Technology Stack

- **Runtime**: Node.js 18+
- **Database**: PostgreSQL 14+
- **Vector Store**: ChromaDB (file-based, existing implementation)
- **Embedding**: Gemini or Grok (via embeddingProvider.js)
- **Testing**: Jest + fast-check
- **Validation**: Joi or Zod for request validation

### Dependencies

```json
{
  "dependencies": {
    "uuid": "^9.0.0",
    "pg": "^8.11.0"
  },
  "devDependencies": {
    "fast-check": "^3.15.0",
    "jest": "^29.7.0"
  }
}
```

### File Structure

```
backend/
├── routes/
│   └── prosearchRoutes.js          # API endpoint
├── services/
│   ├── prosearchService.js         # Main orchestration
│   ├── filterExtractor.js          # Filter parsing
│   ├── filterApplicator.js         # Filter application
│   ├── conversationStateManager.js # DB persistence
│   └── resultHydrator.js           # Result fetching
├── migrations/
│   └── create_prosearch_conversations.sql
└── tests/
    └── prosearch/
        ├── unit/
        ├── property/
        └── integration/
```

### Configuration

```javascript
// config/prosearch.js
export const PROSEARCH_CONFIG = {
  CHROMA_COLLECTION: 'ideas_semantic_index',
  MAX_RESULTS: 100,
  DEFAULT_EMBEDDING_PROVIDER: 'gemini',
  FILTER_MODES: ['ADD', 'REMOVE', 'REPLACE'],
  VALID_YEAR_RANGE: [2021, 2025]
};
```

### Security Considerations

1. **SQL Injection**: Use parameterized queries for all database operations
2. **UUID Validation**: Validate UUID format before database queries
3. **Input Sanitization**: Sanitize user messages before processing
4. **Rate Limiting**: Apply rate limiting to prevent abuse
5. **Conversation Access**: Validate user ownership of conversations (future enhancement)

### Performance Optimizations

1. **Database Indexes**: Index on conversation_id, created_at, updated_at
2. **Connection Pooling**: Use pg pool for database connections
3. **Result Caching**: Cache hydrated results for frequently accessed conversations
4. **Batch Hydration**: Fetch all ideas in single query using WHERE idea_id = ANY($1)
5. **Lazy Loading**: Only hydrate results when needed, not on every state update

### Migration Strategy

1. Create new `prosearch_conversations` table
2. Keep existing `prosearch_contexts` table for backward compatibility
3. Implement new routes alongside old routes
4. Gradually migrate frontend to use new endpoint
5. Deprecate old endpoint after migration complete

### Monitoring and Observability

**Metrics to Track**:
- Conversation creation rate
- Average filter application time
- ChromaDB query latency
- Database query latency
- Error rates by type
- Result set sizes (base vs current)

**Logging Requirements**:
- All API requests with request ID
- Conversation lifecycle events
- Filter extraction results
- Query execution times
- Errors with full context

### Future Enhancements

1. **User Authentication**: Associate conversations with user accounts
2. **Conversation History**: List all conversations for a user
3. **Conversation Sharing**: Share conversation links
4. **Filter Suggestions**: Suggest filters based on current results
5. **Natural Language Feedback**: "Show me more like this"
6. **Export Results**: Export filtered results to CSV/PDF
7. **Saved Searches**: Save filter combinations for reuse
