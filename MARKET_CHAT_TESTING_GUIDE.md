# Market Chat Testing Guide

## Quick Test Commands

### Run Unit Tests
```bash
npm test backend/tests/market-chat-intelligence.test.js
```

### Run All Market Chat Tests
```bash
npm test -- --testPathPattern=market
```

## Manual Testing Scenarios

### Scenario 1: Numerical Constraint Differentiation
**Goal:** Verify that "top 2" returns exactly 2 results, not the same as "all competitors"

**Test Steps:**
1. Open Market Chat for any idea
2. Ask: "What are the competitors?"
3. Note the number of results (should be ~5)
4. Ask: "Give top 2 competitors?"
5. Verify: Should return exactly 2 results with acknowledgment

**Expected Behavior:**
- First query: 5 competitors with full analysis
- Second query: "Here are the **top 2 competitors** based on your request:" + exactly 2 results
- Results should be DIFFERENT (not just truncated)

---

### Scenario 2: Follow-up Query Recognition
**Goal:** Verify system recognizes refinement requests

**Test Steps:**
1. Ask: "What are the market trends?"
2. Wait for response (should show 5 trends)
3. Ask: "Show me just the top 3"
4. Verify: Should acknowledge this is a refinement

**Expected Behavior:**
- Second response should start with acknowledgment like "Here are the top 3..."
- Should provide NEW search results, not just truncate previous

---

### Scenario 3: Constraint-Based Search
**Goal:** Verify constraints modify search behavior

**Test Steps:**
1. Ask: "Who are the competitors?"
2. Note the results
3. Ask: "Who are the biggest competitors?"
4. Compare results

**Expected Behavior:**
- Second query should emphasize market leaders
- Strategic insight should mention "major players" or similar
- Search query should include "biggest" constraint

---

### Scenario 4: Geographic Filtering
**Goal:** Verify regional constraints work

**Test Steps:**
1. Ask: "What are the competitors in Europe?"
2. Verify response mentions European market
3. Ask: "What about in the US?"
4. Verify response shifts to US market

**Expected Behavior:**
- Responses should be geographically relevant
- Search queries should include region
- Strategic insights should be region-specific

---

### Scenario 5: Timeframe Constraints
**Goal:** Verify temporal filtering works

**Test Steps:**
1. Ask: "What are the market trends?"
2. Ask: "What are the market trends in 2024?"
3. Compare responses

**Expected Behavior:**
- Second query should show "Market Trends Analysis (2024)" in header
- Results should be time-relevant

---

### Scenario 6: Conversation Memory
**Goal:** Verify system maintains context across messages

**Test Steps:**
1. Ask: "What are the competitors?"
2. Ask: "Which one is the biggest threat?"
3. Ask: "What about patent risks?"
4. Ask: "How does this compare to the competitors we discussed?"

**Expected Behavior:**
- System should reference previous conversation
- Should not ask "which competitors?" in step 4
- Should maintain idea context throughout

---

### Scenario 7: No Repetition
**Goal:** Verify system doesn't repeat identical information

**Test Steps:**
1. Ask: "What are the competitors?"
2. Note the exact response
3. Ask: "Tell me about the competitors"
4. Compare responses

**Expected Behavior:**
- Responses should be similar in content but NOT identical
- Second response should provide additional perspective or details
- Should not copy-paste the same text

---

### Scenario 8: Specific Number Extraction
**Goal:** Verify various number patterns are recognized

**Test Queries:**
- "top 2 competitors"
- "first 5 market trends"
- "3 biggest patent risks"
- "list 10 companies"

**Expected Behavior:**
- Each should return EXACTLY the number requested
- Should work with different phrasings

---

### Scenario 9: Off-Topic Handling
**Goal:** Verify system redirects off-topic queries

**Test Queries:**
- "What's the weather?"
- "Tell me a joke"
- "How are you?"

**Expected Behavior:**
- Should politely redirect to market validation topics
- Should list available capabilities
- Should not attempt to answer off-topic questions

---

### Scenario 10: General Query Intelligence
**Goal:** Verify Gemini provides specific, non-generic answers

**Test Steps:**
1. Ask: "What opportunities exist for this idea?"
2. Verify response is specific to the idea's domain
3. Ask: "What are the risks?"
4. Verify response doesn't ask follow-up questions

**Expected Behavior:**
- Responses should be direct and actionable
- Should NOT end with "Would you like to know more?"
- Should NOT say "I need more information"
- Should provide value based on available context

---

## Automated Test Coverage

### Unit Tests Included
✅ Query parameter extraction (limits, constraints, regions, timeframes)
✅ Intent classification with metadata
✅ Query differentiation (general vs specific)
✅ Edge case handling
✅ Response formatting

### Integration Tests Needed
⚠️ Tavily API integration with custom queries
⚠️ Gemini API with enhanced prompts
⚠️ Conversation history persistence
⚠️ End-to-end chat flow

## Performance Benchmarks

### Response Time Targets
- Intent classification: < 10ms
- Parameter extraction: < 5ms
- Tavily search: < 3s
- Gemini response: < 5s
- Total response time: < 8s

### API Call Limits
- Tavily: 5 results per query
- Gemini: 400 word responses
- Conversation history: Last 6 messages

## Debugging Tips

### Enable Verbose Logging
Check console for these log messages:
```
[MarketChat] Processing query: "..."
[MarketChat] Classified intent: COMPETITORS
[MarketChat] Handling COMPETITORS query via Tavily with params: { limit: 2, ... }
[Tavily] Searching competitors: "..."
```

### Common Issues

**Issue:** Same response for different queries
**Check:** 
- Is parameter extraction working? (check logs for metadata)
- Is conversation history being passed?
- Are results being limited correctly?

**Issue:** Generic responses from Gemini
**Check:**
- Is GEMINI_API_KEY set?
- Is conversation context being built?
- Are post-processing filters removing questions?

**Issue:** No external data
**Check:**
- Is TAVILY_API_KEY set?
- Are API calls succeeding? (check network tab)
- Is search query being constructed correctly?

## Success Criteria

✅ Different queries produce different responses
✅ Numerical constraints are respected exactly
✅ Follow-up queries are acknowledged
✅ Conversation context is maintained
✅ No repetitive responses
✅ Responses are specific to query parameters
✅ External searches use custom queries
✅ Strategic insights are contextual
✅ No unwanted follow-up questions
✅ Fast response times (< 8s)

## Regression Testing

Before deploying, verify these still work:
- [ ] Initial welcome message generation
- [ ] Patent risk queries
- [ ] Market trend queries
- [ ] Competitor queries
- [ ] Specific competitor risk analysis
- [ ] Idea summarization
- [ ] Off-topic handling
- [ ] PDF export functionality
- [ ] Chat history persistence
- [ ] Multi-idea chat isolation

## Next Steps After Testing

1. Monitor real user queries for patterns
2. Collect feedback on response quality
3. Tune parameter extraction patterns
4. Expand constraint vocabulary
5. Add semantic deduplication
6. Implement response caching
7. Add confidence scoring
8. Create query suggestion engine
