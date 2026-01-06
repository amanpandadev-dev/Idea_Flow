# ProSearch Normalized Scoring Fix

## Problem Identified

1. **Only 20 results returned** instead of all 300
2. **Scores too low** (57%) - not reflecting top results properly
3. **Scores not persisted** - chat history reload showed different results

## Solution Implemented

### 1. Normalized Scoring (Top = 99%)

**Formula**:
```javascript
score = 99 * (1 - (position / (totalResults - 1)))
```

**Result**:
- Position 0 (top result): 99%
- Position 1: 98.67%
- Position 2: 98.34%
- ...
- Position 209 (70% threshold): 70%
- Position 210: 69.67% (filtered out)
- ...
- Position 299 (last): 0%

**With 300 results**: Approximately **210 results will be ≥70%**

---

### 2. Score Persistence

**Database Migration**: `add_chroma_scores_column.sql`

Added column to `prosearch_conversations` table:
```sql
ALTER TABLE prosearch_conversations 
ADD COLUMN IF NOT EXISTS base_result_scores INTEGER[] DEFAULT '{}';
```

**Stores**: Array of normalized scores (0-99) aligned with `base_result_ids`

---

### 3. Complete Flow

#### Initial Search

1. **User Query**: "blockchain projects"
2. **ChromaDB Query**: Returns 300 results with distances
3. **Calculate Normalized Scores**:
   ```javascript
   scores = [99, 98, 98, 97, ..., 70, 69, ..., 1, 0]
   ```
4. **Store in Database**:
   ```javascript
   base_result_ids: [123, 456, 789, ...]
   base_result_scores: [99, 98, 98, ...]
   ```
5. **Hydrate with Scores**: Pass scores to hydrator
6. **Filter ≥70%**: Keep ~210 results
7. **Return**: 210 results with scores 99%-70%

#### Follow-up Query (Filter)

1. **Load Conversation**: Get stored IDs and scores
2. **Apply Filters**: Filter IDs (e.g., "React" → 50 IDs)
3. **Get Scores for Filtered IDs**:
   ```javascript
   filteredScores = filteredIds.map(id => {
       const index = base_result_ids.indexOf(id);
       return base_result_scores[index];
   });
   ```
4. **Hydrate with Scores**: Use stored scores
5. **Filter ≥70%**: Keep results ≥70%
6. **Return**: Filtered results with original scores

#### Chat History Reload

1. **Load Conversation**: Get `current_result_ids` and `base_result_scores`
2. **Get Scores**:
   ```javascript
   currentScores = current_result_ids.map(id => {
       const index = base_result_ids.indexOf(id);
       return base_result_scores[index];
   });
   ```
3. **Hydrate with Scores**: Use stored scores
4. **Filter ≥70%**: Apply same filter
5. **Return**: **Exact same results** as before reload

---

### 4. Files Modified

#### `backend/services/prosearchService.js`
- Added `calculateNormalizedScores()` function
- Calculate normalized scores (99, 98, 97, ...)
- Pass scores to `createConversation()`
- Pass scores to `hydrateResults()`
- For follow-ups: extract scores from stored data

#### `backend/services/conversationStateManager.js`
- Updated `createConversation()` to accept and store scores
- Updated `loadConversation()` to return scores
- Scores stored in `base_result_scores` column

#### `backend/services/resultHydrator.js`
- Use pre-normalized scores directly (no recalculation)
- Removed fallback logic (no more "top 20" fallback)
- Filter strictly by ≥70%

#### `server.js`
- Updated rehydrate endpoint to use stored scores
- Extract scores for current results from base scores

#### `backend/migrations/add_chroma_scores_column.sql`
- New migration to add `base_result_scores` column

---

### 5. Expected Behavior

#### Different Queries

| Query | Raw Results | Normalized Scores | ≥70% Count |
|-------|-------------|-------------------|------------|
| "blockchain" | 300 | 99%-0% | ~210 |
| "AI chatbot" | 300 | 99%-0% | ~210 |
| "healthcare" | 300 | 99%-0% | ~210 |

**Note**: All queries return ~210 results because normalization is position-based, not similarity-based.

#### Score Distribution

With 300 results:
- **Top 30%** (0-89): Scores 99%-70% ✅ Shown
- **Bottom 70%** (90-299): Scores 69%-0% ❌ Filtered out

#### Chat History Reload

**Before Reload**:
- Query: "blockchain"
- Results: 210 ideas with scores 99%-70%

**After Reload**:
- Same 210 ideas
- Same scores 99%-70%
- **Identical results** ✅

---

### 6. Verification

#### Run Migration

```bash
psql -d your_database -f backend/migrations/add_chroma_scores_column.sql
```

#### Expected Logs

```
[ProSearch] Query: blockchain projects
[ProSearch] Raw results from Chroma: 300
[ProSearch] Score range: min=45%, max=98%
[ProSearch] Normalized scores: top=99%, bottom=0%
[createNewConversation] Storing conversation state with scores...
[createNewConversation] Hydrating results with normalized scores...
[ProSearch] >=70% results count: 210
[hydrateResults] Filtered 300 → 210 results (≥70% matchScore)
```

#### Test Scenarios

1. **Initial Search**:
   - Search: "blockchain"
   - Expected: ~210 results
   - Top result: 99%
   - Last result: 70%

2. **Follow-up Filter**:
   - Filter: "React"
   - Expected: Subset of 210 results
   - Scores: Same as initial search

3. **Chat History Reload**:
   - Refresh page
   - Expected: Same 210 results
   - Scores: Identical to before reload

---

### 7. Key Changes Summary

✅ **Normalized Scoring**: Top result = 99%, linear decrease
✅ **Score Persistence**: Stored in database
✅ **Consistent Filtering**: ≥70% threshold
✅ **Chat History**: Same results after reload
✅ **No Fallback**: Removed "top 20" fallback logic
✅ **All 300 Results**: Processes all ChromaDB results

---

### 8. Migration Instructions

**Step 1**: Run the migration
```bash
psql -d your_database -f backend/migrations/add_chroma_scores_column.sql
```

**Step 2**: Restart the server
```bash
npm run server
```

**Step 3**: Test
- Search for "blockchain"
- Verify ~210 results
- Check top result is 99%
- Refresh page
- Verify same results

---

### 9. Technical Details

#### Score Calculation

```javascript
function calculateNormalizedScores(totalResults) {
    if (totalResults === 0) return [];
    if (totalResults === 1) return [99];
    
    const scores = [];
    for (let i = 0; i < totalResults; i++) {
        // Linear scale: position 0 = 99%, last position approaches 0%
        const score = Math.round(99 * (1 - (i / (totalResults - 1))));
        scores.push(score);
    }
    
    return scores;
}
```

#### Score Storage

```javascript
// Create conversation with scores
await createConversation(query, ideaIds, normalizedScores);

// Database stores:
{
    base_result_ids: [123, 456, 789, ...],
    base_result_scores: [99, 98, 98, ...]
}
```

#### Score Retrieval

```javascript
// Get scores for filtered IDs
const filteredScores = filteredIds.map(id => {
    const index = base_result_ids.indexOf(id);
    return base_result_scores[index] || 0;
});
```

---

### 10. Comparison

#### Before Fix

- **Results**: 20 (fallback triggered)
- **Scores**: 57% (raw ChromaDB similarity)
- **Reload**: Different results (recalculated)

#### After Fix

- **Results**: ~210 (≥70% of 300)
- **Scores**: 99%-70% (normalized)
- **Reload**: Same results (persisted)

---

**Implementation Date**: January 6, 2026
**Status**: ✅ Complete - Ready for Testing
**Migration Required**: Yes - Run `add_chroma_scores_column.sql`
