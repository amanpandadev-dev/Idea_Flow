# ProSearch Score Filtering - Verification Guide

## Quick Verification Steps

### 1. Check Score Calculation
```bash
node -e "const calc = (pos, total) => Math.round(100 * (1 - (pos / (total - 1)))); console.log('Position 29/100:', calc(29, 100), '(should be 71)'); console.log('Position 30/100:', calc(30, 100), '(should be 70)');"
```

**Expected Output**:
```
Position 29/100: 71 (should be 71)
Position 30/100: 70 (should be 70)
```

---

### 2. Test Initial Search

**Action**: Open ProSearch and search for "blockchain"

**Expected Behavior**:
1. ChromaDB returns 300 results
2. Results are scored by position (100% → 0%)
3. Only results with matchScore ≥70% are displayed
4. With 300 results, approximately 90 results should be shown
5. Console log: `[hydrateResults] Filtered 300 → ~90 results (≥70% matchScore)`

**Verification**:
- Open browser DevTools → Console
- Look for log: `[hydrateResults] Filtered X → Y results`
- Check that Y ≈ 30% of X (for 300 results, Y ≈ 90)

---

### 3. Test Follow-up Query

**Action**: 
1. Search for "blockchain"
2. Then send: "filter by React"

**Expected Behavior**:
1. Base results (blockchain) are loaded from conversation state
2. React filter is applied
3. Filtered results are scored by position
4. Only results ≥70% are displayed
5. Console log shows filtering

**Verification**:
- Check console for: `[hydrateResults] Filtered X → Y results`
- Verify all displayed results have React in technologies
- Verify matchScore values are ≥70%

---

### 4. Test Chat History Reload

**Action**:
1. Search for "AI projects"
2. Note the number of results
3. Refresh the page (F5)
4. Wait for chat history to load

**Expected Behavior**:
1. Previous conversation is restored
2. Results are rehydrated from database
3. Same filtering (≥70%) is applied
4. Same number of results as before refresh
5. Console log: `[ProSearch Rehydrate] X → Y results (≥70%)`

**Verification**:
- Compare result count before and after refresh (should be identical)
- Check console for: `[ProSearch Rehydrate]` log
- Verify all results have matchScore ≥70%

---

### 5. Test Fallback Logic

**Action**: Search for a very specific query that returns few results (e.g., "quantum computing with Rust")

**Expected Behavior**:
1. If filtered results < 10, system returns top 20 instead
2. Console log: `[hydrateResults] Only X results ≥70%, returning top 20 instead`
3. Some results may have matchScore < 70%

**Verification**:
- Check console for fallback message
- Verify result count is ≤20
- Check if some results have matchScore < 70% (indicates fallback triggered)

---

## Manual Testing Checklist

### Initial Search
- [ ] Search returns results
- [ ] All results have matchScore ≥70%
- [ ] Console shows filtering log
- [ ] Result count is approximately 30% of total (for 300 results)

### Follow-up Query
- [ ] Filter refinement works
- [ ] Filtered results have matchScore ≥70%
- [ ] Console shows filtering log
- [ ] Results match the applied filter

### Chat History Reload
- [ ] Page refresh restores conversation
- [ ] Same results appear after reload
- [ ] Console shows rehydrate log
- [ ] All results have matchScore ≥70%

### Fallback Logic
- [ ] Specific query triggers fallback
- [ ] Console shows fallback message
- [ ] Top 20 results returned
- [ ] Some results may have matchScore < 70%

---

## Expected Console Logs

### Initial Search
```
[ProSearch] Incoming request { requestId: 'req_...', conversationId: null, ... }
[createNewConversation] Starting new conversation with query: blockchain
[createNewConversation] Generating embedding...
[createNewConversation] Querying ChromaDB...
[createNewConversation] Found 300 results from ChromaDB
[hydrateResults] Filtered 300 → 90 results (≥70% matchScore)
[ProSearch] Request completed { resultCount: 90, isNewBaseSearch: true, ... }
```

### Follow-up Query
```
[ProSearch] Incoming request { requestId: 'req_...', conversationId: 'uuid-...', ... }
[processFollowUp] Processing follow-up for conversation: uuid-...
[processFollowUp] Loading conversation state...
[processFollowUp] Applying filters to base results...
[hydrateResults] Filtered 150 → 45 results (≥70% matchScore)
[ProSearch] Request completed { resultCount: 45, isNewBaseSearch: false, ... }
```

### Chat History Reload
```
[ProSearch] Loading conversation: uuid-...
[ProSearch Rehydrate] Conversation uuid-...: 300 → 90 results (≥70%)
[ProSearch] ✅ Rehydrated 90 results from DB
```

### Fallback Triggered
```
[hydrateResults] Only 5 results ≥70%, returning top 20 instead
```

---

## API Testing with curl

### Test Rehydrate Endpoint
```bash
curl -X POST http://localhost:3001/api/search/rehydrate \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "your-conversation-uuid"}'
```

**Expected Response**:
```json
{
  "results": [...],
  "filters": {...},
  "baseQuery": "blockchain"
}
```

**Verify**:
- All results have `matchScore >= 70`
- Result count matches frontend display
- Filters match applied filters

---

## Debugging Tips

### Check Score Distribution
Add this to browser console:
```javascript
// Get all result cards
const results = document.querySelectorAll('[data-match-score]');
const scores = Array.from(results).map(r => parseInt(r.dataset.matchScore));
console.log('Score distribution:', {
  min: Math.min(...scores),
  max: Math.max(...scores),
  avg: scores.reduce((a,b) => a+b, 0) / scores.length,
  count: scores.length
});
```

### Check Filtering in Backend
Add temporary logging in `resultHydrator.js`:
```javascript
console.log('[DEBUG] Before filter:', hydratedResults.length);
console.log('[DEBUG] Score range:', {
  min: Math.min(...hydratedResults.map(r => r.matchScore)),
  max: Math.max(...hydratedResults.map(r => r.matchScore))
});
const filteredResults = hydratedResults.filter(idea => idea.matchScore >= 70);
console.log('[DEBUG] After filter:', filteredResults.length);
```

### Check Conversation State
Query database directly:
```sql
SELECT 
  conversation_id,
  base_query,
  array_length(base_result_ids, 1) as base_count,
  array_length(current_result_ids, 1) as current_count,
  applied_filters
FROM conversation_search_state
WHERE conversation_id = 'your-uuid'
ORDER BY updated_at DESC
LIMIT 1;
```

---

## Performance Verification

### Measure Filtering Time
Add timing logs in `resultHydrator.js`:
```javascript
const filterStart = Date.now();
const filteredResults = hydratedResults.filter(idea => idea.matchScore >= 70);
console.log(`[Performance] Filtering took ${Date.now() - filterStart}ms`);
```

**Expected**: < 5ms for 300 results

### Measure Rehydration Time
Check console logs for:
```
[ProSearch Rehydrate] Conversation uuid-...: 300 → 90 results (≥70%)
```

**Expected**: < 100ms total (including DB query)

---

## Common Issues

### Issue: No results after filtering
**Cause**: All results have matchScore < 70%
**Solution**: Check if ChromaDB is returning relevant results
**Debug**: Log scores before filtering

### Issue: Fallback always triggered
**Cause**: Query returns very few results
**Solution**: This is expected behavior for specific queries
**Debug**: Check base result count

### Issue: Different results after reload
**Cause**: Conversation state not saved correctly
**Solution**: Check conversation_search_state table
**Debug**: Query database for conversation_id

### Issue: Rehydrate endpoint 404
**Cause**: Endpoint not registered in server.js
**Solution**: Verify server.js has the rehydrate endpoint
**Debug**: Check server logs for route registration

---

## Success Criteria

✅ **Initial Search**: Returns ~30% of ChromaDB results (all ≥70%)
✅ **Follow-up**: Applies filters and returns ≥70% results
✅ **Reload**: Shows identical results after page refresh
✅ **Fallback**: Returns top 20 when filtered < 10
✅ **Performance**: Filtering adds < 5ms overhead
✅ **Consistency**: Same results across all three scenarios

---

## Rollback Plan

If issues occur, disable filtering:

### Option 1: Disable in Code
```javascript
// In resultHydrator.js, change default:
const applyScoreFilter = options.applyScoreFilter !== false;
// To:
const applyScoreFilter = options.applyScoreFilter === true;
```

### Option 2: Disable in Service
```javascript
// In prosearchService.js, pass option:
const results = await hydrateResults(
    conversation.current_result_ids,
    conversation.base_result_ids,
    { applyScoreFilter: false }  // Disable filtering
);
```

### Option 3: Revert Changes
```bash
git revert <commit-hash>
```

---

## Contact

For issues or questions:
- Check console logs first
- Review this verification guide
- Check implementation document: `IMPLEMENTATION_COMPLETE.md`
- Review test file: `backend/tests/score-filtering.test.js`
