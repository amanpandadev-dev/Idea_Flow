# Market Chat Intelligence Improvements

## Overview
Enhanced the Market Chat feature to provide more intelligent, query-specific responses using advanced RAG (Retrieval-Augmented Generation) techniques with both internal and external resources.

## Problems Solved

### 1. **Duplicate Responses for Different Queries**
**Before:** "What are the competitors?" and "Give top 2 competitors?" returned identical responses.

**After:** System now extracts query parameters (numbers, constraints, timeframes) and tailors responses accordingly.

### 2. **Lack of Query Specificity**
**Before:** Generic responses regardless of user's specific requirements.

**After:** Intelligent parameter extraction recognizes:
- Numerical limits ("top 2", "first 5", "3 competitors")
- Constraints ("biggest", "newest", "fastest growing")
- Timeframes ("in 2024", "next 5 years")
- Regions ("in US", "Europe", "global")
- Specific company names

### 3. **No Conversation Context**
**Before:** Each query treated in isolation, no memory of previous exchanges.

**After:** System tracks conversation history and:
- Detects follow-up questions
- Acknowledges refinements ("Here are the top 2 as requested...")
- Provides NEW information instead of repeating

### 4. **Generic External Searches**
**Before:** Same Tavily search query regardless of user intent.

**After:** Dynamic search query construction based on:
- User constraints
- Geographic preferences
- Timeframe requirements
- Specific parameters

## Technical Enhancements

### 1. Query Parameter Extraction
```javascript
extractQueryParameters(message) {
  // Extracts:
  - limit: numerical constraints (top 2, first 5)
  - specificNames: company/competitor names
  - timeframe: temporal constraints (2024, next year)
  - region: geographic scope (US, Europe, global)
  - constraints: qualifiers (biggest, newest, fastest)
}
```

### 2. Enhanced Intent Classification
- Intent detection now includes extracted parameters
- Metadata passed through entire processing pipeline
- Context-aware routing to specialized handlers

### 3. Intelligent Response Formatting
- **Follow-up Detection**: Recognizes when user is refining previous query
- **Limit Application**: Respects exact numbers requested ("top 2" = exactly 2 results)
- **Contextual Insights**: Strategic advice tailored to query constraints

### 4. Improved Gemini Integration
- Extended conversation context (6 messages vs 4)
- Parameter-aware prompting
- Post-processing to remove unwanted questions
- Stricter rules against generic responses

## RAG Architecture

### Internal Resources (Idea Data)
- Title, description, domain, technologies
- Business group, year, theme
- Used for: Summarization, context building

### External Resources (Tavily API)
- Patent searches (Google Patents)
- Market trend analysis
- Competitor intelligence
- Real-time web data

### Intelligent Routing
```
User Query → Intent Classification → Parameter Extraction
     ↓
Internal Data? → Use Idea Database
External Data? → Tavily Search with Custom Query
General Query? → Gemini with Enhanced Context
     ↓
Response Formatting → User
```

## Example Improvements

### Example 1: Competitor Queries
**Query 1:** "What are the competitors?"
**Response:** Full competitive landscape with 5 companies

**Query 2:** "Give top 2 competitors?"
**Response:** "Here are the **top 2 competitors** based on your request:" + exactly 2 results

### Example 2: Constrained Searches
**Query:** "Who are the biggest competitors in Europe?"
**Search Query:** `companies building [idea] competitors products biggest in Europe`
**Response:** Tailored to European market with focus on market leaders

### Example 3: Follow-up Refinement
**Query 1:** "What are the market trends?"
**Response:** 5 trend insights

**Query 2:** "Show me just the top 3"
**Response:** Acknowledges refinement + provides exactly 3 trends (NEW search, not truncation)

## Configuration

### Environment Variables Required
```bash
GEMINI_API_KEY=your_gemini_key
TAVILY_API_KEY=your_tavily_key
```

### API Endpoints
- `POST /api/ideas/:ideaId/market-chat/initialize` - Start chat session
- `POST /api/ideas/:ideaId/market-chat` - Send message with conversation history
- `POST /api/ideas/:ideaId/market-chat/download` - Export chat as PDF

## Testing Recommendations

### Test Scenarios
1. **Numerical Constraints**
   - "What are the competitors?" → Should return 5 results
   - "Give top 2 competitors?" → Should return exactly 2 results
   - "Show me 3 market trends" → Should return exactly 3 trends

2. **Follow-up Queries**
   - Ask general question → Ask refined version → Should acknowledge refinement

3. **Constraint Handling**
   - "Who are the biggest competitors?" → Should emphasize market leaders
   - "What are the newest competitors?" → Should focus on recent entrants

4. **Geographic Scope**
   - "Competitors in US" → Should filter to US market
   - "Global market trends" → Should provide worldwide perspective

5. **Conversation Memory**
   - Multiple exchanges → Should maintain context
   - Should not repeat identical information

## Performance Considerations

- **Tavily API Limits**: 5 results per query, 30-second timeout
- **Gemini Context**: Last 6 messages (vs previous 4) for better continuity
- **Response Size**: Capped at 400 words for general queries
- **Search Depth**: Basic (faster) vs Advanced (more thorough)

## Future Enhancements

1. **Semantic Deduplication**: Detect when user is asking same question differently
2. **Multi-source Aggregation**: Combine Tavily + internal docs + Gemini for hybrid responses
3. **Confidence Scoring**: Indicate reliability of external data
4. **Citation Tracking**: Link specific claims to sources
5. **Query Suggestions**: Proactive recommendations based on idea domain
6. **Caching**: Store external search results to reduce API calls

## Monitoring & Debugging

### Log Messages
- `[MarketChat] Processing query: "..."` - Entry point
- `[MarketChat] Classified intent: COMPETITORS` - Intent detection
- `[MarketChat] Handling COMPETITORS query via Tavily with params:` - Parameter extraction
- `[Tavily] Searching competitors: "..."` - External API call

### Key Metrics to Track
- Intent classification accuracy
- Parameter extraction success rate
- Follow-up detection rate
- User satisfaction (implicit: conversation length, refinement frequency)
- API response times (Tavily, Gemini)

## Summary

The Market Chat feature is now a true intelligent RAG chatbot that:
✅ Understands query nuances and parameters
✅ Provides specific, non-repetitive responses
✅ Leverages both internal and external resources intelligently
✅ Maintains conversation context
✅ Tailors search queries to user intent
✅ Delivers actionable, strategic insights

The system now satisfies the requirement for "smart replies" that accurately address user queries with appropriate use of internal idea data and external market intelligence.
