# Pro Search Chat Optimizations v2.0

## Summary of Changes

### 1. Improved Indexing Performance
**File:** `backend/services/optimizedIndexer.js`

- Increased batch size from 25 to 200 for faster processing
- Optimized embedding generation with FNV-1a hash for better distribution
- Increased embedding cache size from 5000 to 10000
- Parallel batch processing for all ideas
- All 20+ fields from ideas table are now indexed

### 2. Dynamic Query Filtering
**File:** `backend/routes/proSearchRoutes.js`

- Case-insensitive search across all fields
- Dynamic filter parsing from natural language:
  - Domain/challenge detection (healthcare, finance, AI, blockchain, etc.)
  - Technology detection (Python, JavaScript, Java, Cloud, AI/ML)
  - Build phase detection (prototype, MVP, POC, production)
  - Scalability detection (high, medium)
  - Year detection (2020-2030)
- Filters are applied both at semantic and database levels

### 3. Persistent Context with Manual Delete
**File:** `backend/routes/proSearchRoutes.js`

- User context stored in memory (persists across requests)
- Context includes: filters, last query, search history
- New endpoints:
  - `POST /api/search/clear-context` - Clear all or specific filters
  - `GET /api/search/context/:userId` - Get user's current context
- Frontend button to clear context manually

### 4. Increased Result Limit
- Default limit increased from 20 to 200
- ChromaDB query limit increased to 500 for post-filtering
- Frontend now requests 200 results

## API Changes

### POST /api/search/conversational
New parameters:
```json
{
  "query": "search query",
  "additionalFilters": {},
  "userId": "user-id",
  "clearContext": false,
  "clearFilterType": "all",
  "limit": 200
}
```

### POST /api/search/clear-context
Clear user's search context:
```json
{
  "userId": "user-id",
  "filterType": "all" | "domain" | "techStack" | "year" | etc.
}
```

### GET /api/search/context/:userId
Returns user's current context and search history.

## Performance Improvements

| Metric | Before | After |
|--------|--------|-------|
| Indexing batch size | 25 | 200 |
| Embedding cache size | 5000 | 10000 |
| Default result limit | 20 | 200 |
| ChromaDB query limit | 50 | 500 |
| Fields indexed | ~10 | 20+ |

## Testing

```bash
# Start server
node server.js

# Test search
curl -X POST http://localhost:3001/api/search/conversational \
  -H "Content-Type: application/json" \
  -d '{"query": "blockchain", "userId": "test", "limit": 200}'

# Clear context
curl -X POST http://localhost:3001/api/search/clear-context \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "filterType": "all"}'

# Force reindex
curl -X POST http://localhost:3001/api/search/reindex
```
