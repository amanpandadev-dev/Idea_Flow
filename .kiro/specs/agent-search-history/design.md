# Design Document - Agent Search History

## Overview

The Agent Search History feature provides persistent storage and retrieval of user conversations with the AI agent. It enables users to view, search, continue, and manage their conversation history, creating a seamless experience across multiple sessions.

## Architecture

### High-Level Architecture

```
┌─────────────────┐
│   Frontend UI   │
│  (React/Vue)    │
└────────┬────────┘
         │
         │ HTTP/REST
         │
┌────────▼────────────────────────────────────┐
│         Backend API Layer                   │
│  ┌──────────────────────────────────────┐  │
│  │  Conversation Routes                  │  │
│  │  - GET /api/conversations             │  │
│  │  - GET /api/conversations/:id         │  │
│  │  - POST /api/conversations            │  │
│  │  - PUT /api/conversations/:id         │  │
│  │  - DELETE /api/conversations/:id      │  │
│  │  - GET /api/conversations/search      │  │
│  │  - GET /api/conversations/stats       │  │
│  └──────────────────────────────────────┘  │
└────────┬────────────────────────────────────┘
         │
         │
┌────────▼────────────────────────────────────┐
│      Conversation Service Layer             │
│  - Business logic for CRUD operations       │
│  - Search and filtering                     │
│  - Statistics calculation                   │
│  - Export functionality                     │
└────────┬────────────────────────────────────┘
         │
         │
┌────────▼────────────────────────────────────┐
│         PostgreSQL Database                 │
│  ┌──────────────────────────────────────┐  │
│  │  conversations                        │  │
│  │  - id, user_id, title, tags           │  │
│  │  - session_id, created_at, updated_at │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │  conversation_messages                │  │
│  │  - id, conversation_id, role          │  │
│  │  - content, timestamp                 │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Database Schema

#### conversations Table
```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    tags TEXT[], -- Array of tags
    session_id VARCHAR(255), -- Reference to vector store session
    document_context JSONB, -- Metadata about uploaded documents
    embedding_provider VARCHAR(50) DEFAULT 'llama',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    
    -- Indexes for performance
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX idx_conversations_tags ON conversations USING GIN(tags);
```

#### conversation_messages Table
```sql
CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'user' or 'agent'
    content TEXT NOT NULL,
    metadata JSONB, -- Additional data like tool calls, sources
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_conversation FOREIGN KEY (conversation_id) 
        REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON conversation_messages(timestamp);
CREATE INDEX idx_messages_content_search ON conversation_messages USING GIN(to_tsvector('english', content));
```

### 2. Backend API Endpoints

#### GET /api/conversations
List all conversations for the authenticated user.

**Query Parameters:**
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `tags` (optional): Filter by tags (comma-separated)
- `sortBy` (optional): Sort field (default: 'created_at')
- `order` (optional): Sort order 'asc' or 'desc' (default: 'desc')

**Response:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "uuid",
      "title": "Supply Chain Optimization Discussion",
      "tags": ["logistics", "ai"],
      "messageCount": 12,
      "firstMessage": "How can AI optimize delivery routes?",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T11:45:00Z"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

#### GET /api/conversations/:id
Retrieve a specific conversation with all messages.

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "uuid",
    "title": "Supply Chain Optimization Discussion",
    "tags": ["logistics", "ai"],
    "sessionId": "session-uuid",
    "documentContext": {
      "filename": "supply-chain.pdf",
      "uploadedAt": "2024-01-15T10:25:00Z"
    },
    "embeddingProvider": "llama",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T11:45:00Z",
    "messages": [
      {
        "id": "msg-uuid-1",
        "role": "user",
        "content": "How can AI optimize delivery routes?",
        "timestamp": "2024-01-15T10:30:00Z"
      },
      {
        "id": "msg-uuid-2",
        "role": "agent",
        "content": "AI can optimize delivery routes through...",
        "metadata": {
          "sources": ["doc-chunk-1", "doc-chunk-3"],
          "toolsUsed": ["internalRAG", "tavilySearch"]
        },
        "timestamp": "2024-01-15T10:30:15Z"
      }
    ]
  }
}
```

#### POST /api/conversations
Create a new conversation.

**Request Body:**
```json
{
  "title": "New Discussion",
  "tags": ["innovation"],
  "sessionId": "session-uuid",
  "documentContext": {
    "filename": "document.pdf"
  },
  "embeddingProvider": "llama"
}
```

**Response:**
```json
{
  "success": true,
  "conversationId": "uuid",
  "message": "Conversation created successfully"
}
```

#### POST /api/conversations/:id/messages
Add a message to an existing conversation.

**Request Body:**
```json
{
  "role": "user",
  "content": "What about real-time traffic data?",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "msg-uuid",
  "conversationId": "uuid"
}
```

#### PUT /api/conversations/:id
Update conversation metadata (title, tags).

**Request Body:**
```json
{
  "title": "Updated Title",
  "tags": ["logistics", "ai", "optimization"]
}
```

#### DELETE /api/conversations/:id
Delete a conversation and all its messages.

**Response:**
```json
{
  "success": true,
  "message": "Conversation deleted successfully"
}
```

#### GET /api/conversations/search
Search conversations by content.

**Query Parameters:**
- `q`: Search query (required)
- `limit`: Number of results (default: 20)

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "conversationId": "uuid",
      "title": "Supply Chain Discussion",
      "matchedMessage": "...optimize delivery routes...",
      "messageId": "msg-uuid",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 5
}
```

#### GET /api/conversations/stats
Get conversation statistics for the user.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalConversations": 45,
    "totalMessages": 523,
    "averageMessagesPerConversation": 11.6,
    "firstConversationDate": "2023-12-01T09:00:00Z",
    "lastConversationDate": "2024-01-15T11:45:00Z",
    "topTags": [
      { "tag": "ai", "count": 23 },
      { "tag": "logistics", "count": 15 }
    ]
  }
}
```

#### GET /api/conversations/:id/export
Export a conversation in specified format.

**Query Parameters:**
- `format`: 'json' or 'markdown' (default: 'json')

**Response:** File download

### 3. Service Layer

#### ConversationService

```javascript
class ConversationService {
  constructor(db) {
    this.db = db;
  }

  async createConversation(userId, data) {
    // Create conversation record
    // Generate title from first message if not provided
    // Return conversation ID
  }

  async getConversations(userId, options) {
    // Fetch conversations with pagination
    // Apply filters (tags, date range)
    // Return list with metadata
  }

  async getConversationById(conversationId, userId) {
    // Fetch conversation with all messages
    // Verify user ownership
    // Return full conversation object
  }

  async addMessage(conversationId, userId, message) {
    // Add message to conversation
    // Update conversation updated_at
    // Increment message_count
    // Return message ID
  }

  async updateConversation(conversationId, userId, updates) {
    // Update title, tags, or other metadata
    // Verify user ownership
    // Return updated conversation
  }

  async deleteConversation(conversationId, userId) {
    // Verify user ownership
    // Delete conversation (cascade deletes messages)
    // Return success status
  }

  async searchConversations(userId, query, options) {
    // Full-text search across messages
    // Return matching conversations with context
  }

  async getStatistics(userId) {
    // Calculate aggregate statistics
    // Return stats object
  }

  async exportConversation(conversationId, userId, format) {
    // Fetch conversation
    // Format as JSON or Markdown
    // Return formatted string
  }

  async generateTitle(firstMessage) {
    // Extract key topics from first message
    // Generate concise title (max 50 chars)
    // Return title string
  }
}
```

## Data Models

### Conversation Model
```javascript
{
  id: 'uuid',
  userId: 'emp_id',
  title: 'string',
  tags: ['string'],
  sessionId: 'string',
  documentContext: {
    filename: 'string',
    uploadedAt: 'timestamp',
    themes: ['string']
  },
  embeddingProvider: 'llama' | 'gemini' | 'grok',
  createdAt: 'timestamp',
  updatedAt: 'timestamp',
  messageCount: 'number'
}
```

### Message Model
```javascript
{
  id: 'uuid',
  conversationId: 'uuid',
  role: 'user' | 'agent',
  content: 'string',
  metadata: {
    sources: ['string'],
    toolsUsed: ['string'],
    executionTime: 'number'
  },
  timestamp: 'timestamp'
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: User Isolation
*For any* two different users, the conversations returned for user A should never include conversations belonging to user B.
**Validates: Requirements 7.2**

### Property 2: Message Ordering Preservation
*For any* conversation, when messages are retrieved, they should be ordered by timestamp in ascending order (oldest first).
**Validates: Requirements 1.3**

### Property 3: Cascade Deletion Integrity
*For any* conversation, when the conversation is deleted, all associated messages should also be deleted from the database.
**Validates: Requirements 4.2**

### Property 4: Title Generation Consistency
*For any* first message text, generating a title multiple times should produce the same result.
**Validates: Requirements 5.1**

### Property 5: Search Result Relevance
*For any* search query, all returned conversations should contain at least one message that matches the search criteria.
**Validates: Requirements 3.1**

### Property 6: Timestamp Monotonicity
*For any* conversation, the updated_at timestamp should always be greater than or equal to the created_at timestamp.
**Validates: Requirements 2.4**

### Property 7: Export Round-Trip (JSON)
*For any* conversation exported to JSON and then parsed, the parsed data should contain all original messages and metadata.
**Validates: Requirements 6.4**

### Property 8: Tag Filtering Accuracy
*For any* tag filter applied, all returned conversations should contain the specified tag in their tags array.
**Validates: Requirements 5.4**

### Property 9: Message Count Consistency
*For any* conversation, the message_count field should equal the actual number of messages in the conversation_messages table.
**Validates: Requirements 8.2**

### Property 10: Pagination Completeness
*For any* set of conversations, fetching all pages with pagination should return the same total set as fetching without pagination.
**Validates: Requirements 1.5**

## Error Handling

### Error Scenarios

1. **Conversation Not Found**
   - Status: 404
   - Message: "Conversation not found or access denied"
   - Action: Return error, do not expose whether conversation exists

2. **Unauthorized Access**
   - Status: 403
   - Message: "You do not have permission to access this conversation"
   - Action: Verify user ownership before any operation

3. **Invalid Input**
   - Status: 400
   - Message: Specific validation error
   - Action: Return detailed validation errors

4. **Database Error**
   - Status: 500
   - Message: "Failed to process request"
   - Action: Log error, return generic message, rollback transaction

5. **Export Timeout**
   - Status: 504
   - Message: "Export request timed out"
   - Action: Suggest smaller date range or fewer messages

### Error Recovery

- Use database transactions for multi-step operations
- Implement retry logic for transient failures
- Graceful degradation: if search fails, return recent conversations
- Cache frequently accessed conversations to reduce database load

## Testing Strategy

### Unit Tests

1. **ConversationService Tests**
   - Test CRUD operations
   - Test search functionality
   - Test statistics calculation
   - Test export formatting
   - Test title generation

2. **Database Query Tests**
   - Test user isolation queries
   - Test pagination logic
   - Test full-text search
   - Test cascade deletion

3. **API Endpoint Tests**
   - Test authentication/authorization
   - Test input validation
   - Test error responses
   - Test response formatting

### Property-Based Tests

Using `fast-check` library for JavaScript:

1. **Property 1: User Isolation**
   - Generate random user IDs and conversations
   - Verify no cross-user data leakage

2. **Property 2: Message Ordering**
   - Generate random message sequences
   - Verify retrieval maintains chronological order

3. **Property 3: Cascade Deletion**
   - Create conversations with random message counts
   - Verify all messages deleted when conversation deleted

4. **Property 4: Title Generation**
   - Generate random first messages
   - Verify title generation is deterministic

5. **Property 7: Export Round-Trip**
   - Generate random conversations
   - Export to JSON, parse, verify data integrity

6. **Property 8: Tag Filtering**
   - Generate conversations with random tags
   - Verify filtering returns only matching conversations

7. **Property 9: Message Count**
   - Generate conversations with random messages
   - Verify message_count field matches actual count

8. **Property 10: Pagination**
   - Generate large conversation sets
   - Verify pagination returns complete data

### Integration Tests

1. **End-to-End Conversation Flow**
   - Create conversation → Add messages → Retrieve → Update → Delete
   - Verify each step succeeds and data persists correctly

2. **Search Integration**
   - Create conversations with known content
   - Search and verify correct results returned

3. **Export Integration**
   - Create conversation with various message types
   - Export in both formats and verify completeness

## Performance Considerations

### Database Optimization

1. **Indexes**
   - B-tree indexes on user_id, created_at for fast lookups
   - GIN index on tags array for tag filtering
   - GIN index on message content for full-text search

2. **Query Optimization**
   - Use LIMIT/OFFSET for pagination
   - Fetch message counts in single query with JOIN
   - Use prepared statements to prevent SQL injection

3. **Caching Strategy**
   - Cache recent conversations list (5 min TTL)
   - Cache conversation statistics (15 min TTL)
   - Invalidate cache on conversation updates

### API Performance

1. **Response Time Targets**
   - List conversations: < 200ms
   - Get single conversation: < 300ms
   - Search: < 500ms
   - Create/Update: < 150ms
   - Delete: < 100ms

2. **Pagination**
   - Default page size: 50 conversations
   - Maximum page size: 100 conversations
   - Use cursor-based pagination for large datasets

3. **Rate Limiting**
   - 100 requests per minute per user
   - 10 search requests per minute per user
   - 5 export requests per minute per user

## Security Considerations

1. **Authentication**
   - All endpoints require valid JWT token
   - Token must contain user ID

2. **Authorization**
   - Verify user owns conversation before any operation
   - Prevent enumeration attacks (same error for not found vs unauthorized)

3. **Input Validation**
   - Sanitize all user inputs
   - Limit title length (500 chars)
   - Limit message content (10,000 chars)
   - Limit tags array (max 10 tags, 50 chars each)

4. **SQL Injection Prevention**
   - Use parameterized queries exclusively
   - Never concatenate user input into SQL

5. **Data Privacy**
   - Cascade delete conversations when user deleted
   - Do not log message content
   - Encrypt sensitive data at rest (if required)

## Migration Strategy

### Database Migration

```sql
-- Migration: Create conversation tables
-- Version: 001
-- Date: 2024-01-15

BEGIN;

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    tags TEXT[],
    session_id VARCHAR(255),
    document_context JSONB,
    embedding_provider VARCHAR(50) DEFAULT 'llama',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(emp_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_conversation FOREIGN KEY (conversation_id) 
        REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX idx_conversations_tags ON conversations USING GIN(tags);
CREATE INDEX idx_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON conversation_messages(timestamp);
CREATE INDEX idx_messages_content_search ON conversation_messages USING GIN(to_tsvector('english', content));

COMMIT;
```

### Rollback Plan

```sql
-- Rollback: Drop conversation tables
BEGIN;
DROP INDEX IF EXISTS idx_messages_content_search;
DROP INDEX IF EXISTS idx_messages_timestamp;
DROP INDEX IF EXISTS idx_messages_conversation_id;
DROP INDEX IF EXISTS idx_conversations_tags;
DROP INDEX IF EXISTS idx_conversations_created_at;
DROP INDEX IF EXISTS idx_conversations_user_id;
DROP TABLE IF EXISTS conversation_messages;
DROP TABLE IF EXISTS conversations;
COMMIT;
```

## Future Enhancements

1. **Conversation Sharing**
   - Allow users to share conversations with team members
   - Generate shareable links with expiration

2. **Conversation Templates**
   - Save common query patterns as templates
   - Quick-start conversations from templates

3. **Advanced Analytics**
   - Visualize conversation trends over time
   - Identify most discussed topics
   - Track agent response quality metrics

4. **Conversation Merging**
   - Combine related conversations
   - Split long conversations into topics

5. **Voice Notes**
   - Add voice message support
   - Transcribe and store as text

6. **Collaborative Conversations**
   - Multiple users in same conversation
   - Real-time updates via WebSocket
