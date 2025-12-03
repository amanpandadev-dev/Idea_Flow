# Agent Search History Feature Spec

## Overview

This spec defines a comprehensive conversation history system for the IdeaFlow Dashboard's AI agent. Users can view, search, continue, and manage their past conversations with persistent storage in PostgreSQL.

## Key Features

1. **Conversation Persistence** - All agent interactions are saved to the database
2. **Search & Filter** - Full-text search across conversation content with tag filtering
3. **Continue Conversations** - Resume previous discussions with preserved context
4. **Export** - Download conversations in JSON or Markdown format
5. **Statistics** - View usage analytics and conversation metrics
6. **Organization** - Auto-generated titles and custom tags for easy categorization

## Architecture Highlights

- **Database**: PostgreSQL with two tables (conversations, conversation_messages)
- **API**: RESTful endpoints for CRUD operations, search, and export
- **Service Layer**: ConversationService handles business logic
- **Security**: User isolation, authentication, input validation
- **Performance**: Indexed queries, caching, pagination

## Database Schema

### conversations
- Stores conversation metadata (title, tags, timestamps)
- Links to user and vector store session
- Tracks message count for quick stats

### conversation_messages
- Stores individual messages (user queries and agent responses)
- Includes metadata (sources, tools used, execution time)
- Supports full-text search

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/conversations | List user's conversations |
| GET | /api/conversations/:id | Get conversation with messages |
| POST | /api/conversations | Create new conversation |
| POST | /api/conversations/:id/messages | Add message to conversation |
| PUT | /api/conversations/:id | Update title/tags |
| DELETE | /api/conversations/:id | Delete conversation |
| GET | /api/conversations/search | Search conversations |
| GET | /api/conversations/stats | Get user statistics |
| GET | /api/conversations/:id/export | Export conversation |

## Correctness Properties

The design includes 10 testable properties:

1. **User Isolation** - No cross-user data leakage
2. **Message Ordering** - Chronological order preserved
3. **Cascade Deletion** - Messages deleted with conversation
4. **Title Generation** - Deterministic title creation
5. **Search Relevance** - Results match search criteria
6. **Timestamp Monotonicity** - Updated >= Created
7. **Export Round-Trip** - Data integrity in exports
8. **Tag Filtering** - Accurate tag-based filtering
9. **Message Count** - Count matches actual messages
10. **Pagination** - Complete data across pages

## Implementation Tasks

The implementation is broken into 18 tasks:

1. Database setup and migration
2. Core CRUD operations
3. Message management
4. Search functionality
5. Statistics and analytics
6. Export functionality
7. Title generation
8. API routes
9. Agent integration
10. Document context preservation
11. Tag management
12. Error handling
13. Caching strategy
14. Rate limiting
15. Security hardening
16. Frontend UI (optional)
17. Testing checkpoint
18. Documentation

## Testing Strategy

- **Unit Tests**: Service methods, database queries, API endpoints
- **Property-Based Tests**: 10 properties using fast-check library
- **Integration Tests**: End-to-end conversation flows

## Performance Targets

- List conversations: < 200ms
- Get conversation: < 300ms
- Search: < 500ms
- Create/Update: < 150ms
- Delete: < 100ms

## Security Measures

- JWT authentication on all endpoints
- User ownership verification
- Input sanitization and validation
- Parameterized queries (SQL injection prevention)
- Rate limiting (100 req/min general, 10 search/min, 5 export/min)
- Cascade delete on user account deletion

## Next Steps

1. Review the requirements document
2. Review the design document
3. Review the tasks document
4. Start implementation with Task 1 (Database Setup)

## Files in This Spec

- `requirements.md` - User stories and acceptance criteria
- `design.md` - Technical design and architecture
- `tasks.md` - Implementation task list
- `README.md` - This overview document

## Dependencies

- PostgreSQL database (already configured)
- Express.js backend (existing)
- JWT authentication (existing)
- fast-check library (for property-based testing)

## Estimated Implementation Time

- Backend: 3-4 days
- Testing: 1-2 days
- Frontend UI: 2-3 days (if included)
- Total: 6-9 days

## Questions?

Review the detailed documents in this spec folder for complete information on requirements, design decisions, and implementation steps.
