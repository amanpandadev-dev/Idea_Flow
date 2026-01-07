# Chat History Score Persistence Fix

## Problem
When reloading chat history, the ProSearch results were showing recalculated scores (100%-0%) instead of the original stored scores (99%-70%). This caused confusion as the same results appeared with different match percentages.

## Root Cause
The `/api/prosearch/rehydrate` endpoint in `backend/routes/proSearchRoutes.js` was NOT passing the stored scores from the database to the `hydrateResults()` function. Without the `chromaScores` parameter, `hydrateResults()` fell back to position-based scoring (100%-0%).

## Solution Implemented

### File: `backend/routes/proSearchRoutes.js` (lines 215-250)

**BEFORE:**
```javascript
// Rehydrate results with ≥70% filter applied (same as initial search)
const results = await hydrateResults(
    conversation.current_result_ids,
    conversation.base_result_ids,
    { applyScoreFilter: true }  // Missing chromaScores!
);
```

**AFTER:**
```javascript
// Get scores for current results from stored base scores
const currentScores = conversation.current_result_ids.map(id => {
    const index = conversation.base_result_ids.indexOf(id);
    return index !== -1 && conversation.base_result_scores?.[index] 
        ? conversation.base_result_scores[index] 
        : 0;
});

logger.info('[ProSearch] Rehydrating conversation', {
    conversationId,
    totalResults: conversation.current_result_ids.length,
    hasStoredScores: conversation.base_result_scores?.length > 0,
    scoreRange: currentScores.length > 0 
        ? `${Math.min(...currentScores)}-${Math.max(...currentScores)}%`
        : 'none',
    baseQuery: conversation.base_query
});

// Rehydrate results with stored scores (already filtered to ≥70%)
const results = await hydrateResults(
    conversation.current_result_ids,
    conversation.base_result_ids,
    { 
        applyScoreFilter: true,
        chromaScores: currentScores  // Use stored scores from database
    }
);
```

## How It Works

1. **Load Conversation**: Retrieves conversation state including `base_result_scores` array
2. **Map Scores**: For each `current_result_id`, finds its position in `base_result_ids` and retrieves the corresponding score from `base_result_scores`
3. **Pass to Hydrator**: Provides `chromaScores` parameter to `hydrateResults()` so it uses stored scores instead of recalculating
4. **Logging**: Added diagnostic logs to verify scores are being loaded and used correctly

## Expected Behavior

### Initial Search
- Query: "machine learning"
- Results: 85 ideas ≥70%
- Scores: 99%, 98%, 97%, ..., 70%

### Chat History Reload
- Same conversation loaded
- Results: Same 85 ideas
- Scores: **Same 99%, 98%, 97%, ..., 70%** (NOT recalculated)

## Verification Steps

1. **Run a ProSearch query**
   - Note the result count and score range
   - Example: 85 results, scores 99%-70%

2. **Reload the page**
   - Chat history should restore
   - Results should show **identical scores**

3. **Check server logs**
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

## Files Modified
- `backend/routes/proSearchRoutes.js` - Fixed rehydrate endpoint to use stored scores

## Related Files (Already Correct)
- `backend/services/conversationStateManager.js` - Stores and loads `base_result_scores`
- `backend/services/resultHydrator.js` - Uses `chromaScores` when provided
- `backend/services/prosearchService.js` - Calculates and stores normalized scores
- `server.js` - Has correct rehydrate implementation (used as reference)

## Status
✅ **FIXED** - Chat history reload now preserves original match scores
