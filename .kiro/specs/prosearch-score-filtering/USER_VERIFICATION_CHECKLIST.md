# User Verification Checklist

## Quick Test Guide

Follow these steps to verify the ProSearch score filtering fix is working correctly.

---

## ✅ Step 1: Start the Server

```bash
npm run server
```

**Expected Output**:
```
✅ Database configured. Attempting to connect...
✅ Loaded 2 collections with 2001 documents from disk
✅ ChromaDB initialized
Server running on port 3001
```

**If you see errors**: Check that the database migration was run (add_chroma_scores_column.sql)

---

## ✅ Step 2: Perform Initial Search

1. Open the application in your browser
2. Navigate to ProSearch
3. Enter a search query (e.g., "machine learning")
4. Submit the search

**What to Check**:
- ✅ Results are displayed
- ✅ Result count varies (NOT always 92)
- ✅ Match scores range from 99% down to 70%
- ✅ No results below 70%

**Example Expected Results**:
```
Query: "machine learning"
Results: 85 ideas
Scores: 99%, 98%, 97%, ..., 71%, 70%
```

---

## ✅ Step 3: Check Server Logs

Look at your server console output.

**Expected Logs**:
```
[ProSearch] Raw results from Chroma: 300
[ProSearch] Normalized scores: 99-0%
[ProSearch] >=70% results count: 85
[hydrateResults] Filtered 300 → 85 results (≥70% matchScore)
```

**What to Verify**:
- ✅ "Raw results from Chroma" shows 300 (or your configured limit)
- ✅ ">=70% results count" shows a number less than 300
- ✅ Filtered count matches displayed results

---

## ✅ Step 4: Test Chat History Reload

1. **Note the current results**: Write down the result count and first few scores
   - Example: 85 results, scores: 99%, 98%, 97%, 96%, 95%...

2. **Reload the page** (F5 or Ctrl+R)

3. **Wait for chat history to restore**

4. **Compare the results**:
   - ✅ Same result count (85 results)
   - ✅ **SAME scores** (99%, 98%, 97%, 96%, 95%...)
   - ✅ NOT recalculated (should NOT be 100%, 99%, 98%...)

**Expected Server Logs on Reload**:
```
[ProSearch] Rehydrating conversation {
  conversationId: '...',
  totalResults: 85,
  hasStoredScores: true,
  scoreRange: '70-99%',
  baseQuery: 'machine learning'
}
[ProSearch] Rehydrated conversation {
  conversationId: '...',
  filteredResults: 85,
  baseQuery: 'machine learning'
}
```

**What to Verify**:
- ✅ `hasStoredScores: true` (scores loaded from database)
- ✅ `scoreRange: '70-99%'` (not '0-100%')
- ✅ Same result count before and after reload

---

## ✅ Step 5: Test Different Queries

Try multiple different search queries to verify variable result counts.

**Test Queries**:
1. "machine learning" → Should get ~85 results
2. "cloud computing" → Should get different count (e.g., ~72 results)
3. "blockchain" → Should get different count (e.g., ~45 results)
4. "artificial intelligence" → Should get different count (e.g., ~95 results)

**What to Verify**:
- ✅ Each query returns a DIFFERENT number of results
- ✅ NOT always 92 results
- ✅ All results have scores ≥70%

---

## ✅ Step 6: Verify Score Consistency

For each search:

1. **Initial Search**:
   - Note the first result's score (should be 99%)
   - Note the last result's score (should be 70% or close)

2. **Reload Page**:
   - First result should still be 99%
   - Last result should still be 70% (or same as before)

**What to Verify**:
- ✅ Scores don't change on reload
- ✅ Top score is always 99% (not 100%)
- ✅ Bottom score is always ≥70%

---

## ❌ Common Issues

### Issue 1: Server Won't Start
**Error**: `proSearchRoutes is not defined`

**Solution**: 
- Check that `backend/routes/proSearchRoutes.js` exists
- Check import statement in `server.js` line 20

### Issue 2: Scores Still Recalculating on Reload
**Symptom**: Scores change from 99%-70% to 100%-0% on reload

**Solution**:
- Verify database migration was run: `add_chroma_scores_column.sql`
- Check server logs for `hasStoredScores: true`
- If `hasStoredScores: false`, the migration didn't run

### Issue 3: Still Getting 92 Results Every Time
**Symptom**: Every query returns exactly 92 results

**Solution**:
- Check that `backend/services/prosearchService.js` has `calculateNormalizedScores()`
- Verify server logs show "Normalized scores: 99-0%"
- Restart the server

### Issue 4: No Results Below 70%
**This is CORRECT behavior!** ✅

The system is designed to filter out results below 70% to show only relevant matches.

---

## 🎯 Success Criteria

Your implementation is working correctly if:

✅ Different queries return different result counts (not always 92)
✅ All results have match scores between 70% and 99%
✅ Chat history reload shows the SAME scores (not recalculated)
✅ Server logs show "hasStoredScores: true" on reload
✅ Server logs show "scoreRange: '70-99%'" (not '0-100%')

---

## 📊 Example Test Results

### Test 1: Machine Learning Query
```
Initial Search:
- Query: "machine learning"
- Results: 85 ideas
- Scores: 99%, 98%, 97%, ..., 71%, 70%
- Server Log: ">=70% results count: 85"

After Reload:
- Results: 85 ideas (SAME)
- Scores: 99%, 98%, 97%, ..., 71%, 70% (SAME)
- Server Log: "hasStoredScores: true, scoreRange: '70-99%'"

✅ PASS
```

### Test 2: Cloud Computing Query
```
Initial Search:
- Query: "cloud computing"
- Results: 72 ideas
- Scores: 99%, 98%, 97%, ..., 71%, 70%
- Server Log: ">=70% results count: 72"

After Reload:
- Results: 72 ideas (SAME)
- Scores: 99%, 98%, 97%, ..., 71%, 70% (SAME)
- Server Log: "hasStoredScores: true, scoreRange: '70-99%'"

✅ PASS
```

---

## 🚀 Ready to Test!

1. Start your server: `npm run server`
2. Open the application
3. Follow the steps above
4. Report any issues

**If all checks pass**: ✅ Implementation is working correctly!

**If any checks fail**: ❌ Review the "Common Issues" section above or check the server logs for errors.

---

**Last Updated**: 2026-01-06
**Version**: 2.1v
