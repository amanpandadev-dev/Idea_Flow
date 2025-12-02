# Testing Guide - Pro Search & AI Agent

## 🚀 Quick Start

### Prerequisites
- ✅ Server running on http://localhost:3001
- ✅ Frontend running on http://localhost:5173
- ✅ Database connected
- ✅ AI features enabled

---

## 🧪 Test Scenarios

### Scenario 1: AI Agent Q&A

#### Steps:
1. Open http://localhost:5173
2. Login with your credentials
3. Navigate to "AI Agent" tab
4. Select "Agent Q&A" mode
5. Enter query: "What are the latest AI innovations?"
6. Click "Ask Agent"

#### Expected Results:
- ✅ Session starts immediately
- ✅ Status shows "Processing..." or "Waiting in queue..."
- ✅ Progress updates appear
- ✅ After ~10-30 seconds, answer appears
- ✅ Citations show internal ideas and external sources
- ✅ "Agent Reasoning Process" expandable section available

#### What to Check:
- Session persists on page refresh
- History saves completed searches
- Can view previous searches from history
- Can cancel running sessions

---

### Scenario 2: Semantic Search (Find Similar Ideas)

#### Steps:
1. In AI Agent tab
2. Select "Find Similar Ideas" mode
3. Enter query: "AI customer service automation"
4. Click "Search"

#### Expected Results:
- ✅ Search completes in ~2-5 seconds
- ✅ Shows list of similar ideas
- ✅ Each result shows similarity percentage
- ✅ Results are ranked by relevance
- ✅ Can click on ideas to view details

#### What to Check:
- Similarity scores make sense (higher = more relevant)
- Results are actually related to query
- Can switch between Agent Q&A and Semantic Search modes

---

### Scenario 3: Pro Search with Spell Correction

#### Steps:
1. Click "Pro Search" button in header
2. Enter query with typos: "clodus databse for custmer managment"
3. Press Enter or click Search

#### Expected Results:
- ✅ Query automatically corrected to: "cloud database for customer management"
- ✅ Results show relevant ideas
- ✅ "AI Ranked" badge appears
- ✅ Results sorted by semantic relevance

#### What to Check:
- Spell correction works (check metadata in response)
- Query expansion happens (more terms searched)
- Match scores are reasonable (0-100)
- Can apply filters

---

### Scenario 4: Pro Search with Naive Language

#### Steps:
1. Open Pro Search
2. Enter simple query: "monitoring system for hospitals"
3. Search

#### Expected Results:
- ✅ Query expanded to include: "health monitoring, observability, tracking, hospital, healthcare, medical, clinical"
- ✅ Results include ideas about healthcare monitoring
- ✅ Results include ideas about system monitoring
- ✅ Broader set of relevant results

#### What to Check:
- Query expansion visible in metadata
- Results cover multiple interpretations
- AI enhancement indicator shows if AI was used

---

### Scenario 5: Document Upload & Context

#### Steps:
1. In AI Agent tab
2. Click "Upload Document" section
3. Upload a PDF or DOCX file
4. Wait for processing
5. Ask a question related to the document

#### Expected Results:
- ✅ Document uploads successfully
- ✅ Shows "X chunks processed"
- ✅ Suggested questions appear
- ✅ Agent responses include document context
- ✅ Purple badge shows "Response includes context from your uploaded document"

#### What to Check:
- Can upload PDF and DOCX files
- Suggested questions are relevant
- Agent uses document context in answers
- Can reset context

---

### Scenario 6: Search History

#### Steps:
1. Perform several AI Agent searches
2. Click "History" button
3. Select a previous search

#### Expected Results:
- ✅ History shows all completed searches
- ✅ Shows timestamp for each search
- ✅ Can click to view previous results
- ✅ Blue badge shows "Viewing result from search history"
- ✅ Can clear all history

#### What to Check:
- History persists across page refreshes
- Can view old results without re-running
- History limited to 20 items
- Can clear history

---

### Scenario 7: Advanced Search Profiles

#### Steps:
1. Open Pro Search
2. Try same query with different profiles:
   - "kubernetes" with keyword profile
   - "kubernetes" with semantic profile
   - "kubernetes" with balanced profile

#### Expected Results:
- ✅ Keyword profile: Exact matches ranked higher
- ✅ Semantic profile: Conceptually similar ideas ranked higher
- ✅ Balanced profile: Mix of both
- ✅ Different results order for each profile

#### What to Check:
- Profile selection affects ranking
- Can see scoring breakdown (_scoring field)
- Results make sense for each profile

---

## 🐛 Common Issues & Solutions

### Issue: "Session not found"
**Solution:** Session expired. Start a new search.

### Issue: "Database not available"
**Solution:** Check if PostgreSQL is running and DATABASE_URL is correct.

### Issue: "AI enhancement failed"
**Solution:** Check API_KEY environment variable. AI will fallback to rule-based processing.

### Issue: No results in Pro Search
**Solution:** Try broader query or lower minScore parameter.

### Issue: Agent stuck in "Processing..."
**Solution:** Check server logs. May need to restart server if agent crashed.

---

## 📊 Performance Benchmarks

### Expected Performance:
- **AI Agent Q&A:** 10-30 seconds
- **Semantic Search:** 2-5 seconds
- **Pro Search:** 1-3 seconds
- **Document Upload:** 5-15 seconds (depends on size)

### If Slower:
- Check database connection
- Check AI API rate limits
- Check server resources
- Try disabling AI enhancement (useAI=false)

---

## 🔍 Debugging

### Check Server Logs
```bash
# View server output
npm run server

# Look for:
# - "[Agent Job UUID] ..." messages
# - "[AdvancedSearch] ..." messages
# - "[NLP] ..." messages
# - Error messages
```

### Check Browser Console
```javascript
// Open DevTools (F12)
// Look for:
// - "[Service] ..." messages
// - "[AgentChat] ..." messages
// - Network errors
// - API response errors
```

### Check Network Tab
```
# In DevTools Network tab, check:
# - POST /api/agent/session (should return 202)
# - GET /api/agent/session/:id/status (should return session data)
# - GET /api/ideas/search (should return results)
# - POST /api/ideas/semantic-search (should return results)
```

---

## ✅ Acceptance Criteria

### AI Agent
- [x] Can start agent session
- [x] Can poll for status
- [x] Can cancel running session
- [x] Shows progress updates
- [x] Returns answer with citations
- [x] Saves to history
- [x] Can view history
- [x] Session persists on refresh

### Pro Search
- [x] Spell correction works
- [x] Query expansion works
- [x] Naive language support works
- [x] Results are relevant
- [x] Can apply filters
- [x] Shows match scores
- [x] AI ranking indicator

### Semantic Search
- [x] Finds similar ideas
- [x] Shows similarity scores
- [x] Results are ranked
- [x] Fast response time
- [x] Can navigate to ideas

### Document Upload
- [x] Can upload PDF/DOCX
- [x] Shows processing status
- [x] Generates suggested questions
- [x] Agent uses context
- [x] Can reset context

---

## 🎯 Test Checklist

### Basic Functionality
- [ ] Server starts without errors
- [ ] Frontend loads successfully
- [ ] Can login
- [ ] Can navigate to AI Agent tab
- [ ] Can navigate to Pro Search

### AI Agent
- [ ] Can start agent session
- [ ] Status updates appear
- [ ] Answer appears after processing
- [ ] Citations are shown
- [ ] Can view reasoning
- [ ] History saves searches
- [ ] Can view history items
- [ ] Can clear history

### Pro Search
- [ ] Can enter query
- [ ] Spell correction works
- [ ] Query expansion works
- [ ] Results appear
- [ ] Match scores shown
- [ ] Can apply filters
- [ ] Can view idea details

### Semantic Search
- [ ] Can switch to semantic mode
- [ ] Search completes quickly
- [ ] Similarity scores shown
- [ ] Results are relevant
- [ ] Can navigate to ideas

### Document Upload
- [ ] Can upload document
- [ ] Processing completes
- [ ] Suggested questions appear
- [ ] Agent uses context
- [ ] Can reset context

### Edge Cases
- [ ] Empty query handled
- [ ] Very long query handled
- [ ] Special characters handled
- [ ] Network errors handled
- [ ] Session expiry handled

---

## 📝 Test Results Template

```
Date: ___________
Tester: ___________

AI Agent Q&A: ☐ Pass ☐ Fail
Notes: _______________________

Semantic Search: ☐ Pass ☐ Fail
Notes: _______________________

Pro Search: ☐ Pass ☐ Fail
Notes: _______________________

Document Upload: ☐ Pass ☐ Fail
Notes: _______________________

Overall: ☐ Pass ☐ Fail
```

---

## 🎉 Success Criteria

All features working when:
- ✅ AI Agent completes searches successfully
- ✅ Pro Search returns relevant results
- ✅ Spell correction fixes typos
- ✅ Query expansion improves results
- ✅ Semantic search finds similar ideas
- ✅ Document upload works
- ✅ History persists
- ✅ No console errors
- ✅ Performance is acceptable

---

**Ready for Testing!** 🚀

Open http://localhost:5173 and start testing!
