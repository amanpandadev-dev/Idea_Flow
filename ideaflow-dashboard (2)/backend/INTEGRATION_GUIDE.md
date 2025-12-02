# Quick Integration Guide

## Step-by-Step Integration

### 1. Update `server.js`

Add these lines to your `server.js`:

```javascript
// At the top with other imports (around line 15)
import hybridSearchRoutes from './backend/routes/hybridSearchRoutes.js';

// After initializing AI (around line 40, after line: aiAvailable = true;)
app.set('ai', ai);
app.set('aiAvailable', aiAvailable);

// With other route registrations (around line 76, after: app.use('/api/ideas', semanticSearchRoutes);)
app.use('/api/search', hybridSearchRoutes);
```

### 2. Update `services.ts`

Replace the existing `searchIdeas` function (around line 138) with:

```typescript
export const searchIdeas = async (query: string, filters?: ExploreFilters): Promise<{ results: Idea[], facets: any }> => {
  console.log(`[Service] Hybrid search with query: "${query}"`);
  let url = `${API_URL}/search/hybrid?q=${encodeURIComponent(query)}`;

  if (filters) {
    if (filters.themes && filters.themes.length > 0) {
      url += `&themes=${encodeURIComponent(JSON.stringify(filters.themes))}`;
    }
    if (filters.businessGroups && filters.businessGroups.length > 0) {
      url += `&businessGroups=${encodeURIComponent(JSON.stringify(filters.businessGroups))}`;
    }
    if (filters.technologies && filters.technologies.length > 0) {
      url += `&technologies=${encodeURIComponent(JSON.stringify(filters.technologies))}`;
    }
  }

  return fetchWithAuth(url);
};
```

### 3. Test the Integration

1. Restart your server:
   ```bash
   # Stop the current server (Ctrl+C)
   npm start
   ```

2. Open the Pro Search modal in your app

3. Try a test query: `"AI chatbot for customer support"`

4. Check the browser console for logs showing:
   - `[HybridSearch] Request received`
   - `[HybridSearch] Calculating BM25+ scores...`
   - `[HybridSearch] Calculating vector similarity scores...`
   - `[HybridSearch] Applying Reciprocal Rank Fusion...`

### 4. Verify Results

Results should now show:
- **AI Match %**: Final composite score (0-100)
- Results ranked by semantic relevance
- Better handling of typos and synonyms

## What Changed?

### Before (Simple Semantic Search)
```
Score = (Semantic × 0.6) + (Keyword × 0.3) + (Domain Bonus × 0.1)
```

### After (BM25+ + Vector + RRF)
```
1. Calculate BM25+ score (keyword relevance)
2. Calculate Vector similarity (semantic understanding)
3. Apply RRF to combine rankings
4. Normalize all scores to 0-1
5. Weighted combination:
   Final = (BM25 × 0.30) + (Vector × 0.50) + (RRF × 0.20)
```

## Benefits

✅ **More Accurate**: Industry-standard BM25+ algorithm
✅ **Better Ranking**: RRF combines multiple signals
✅ **Modular**: Clean separation of concerns
✅ **Configurable**: Easy to adjust weights
✅ **Transparent**: See individual component scores

## Troubleshooting

### Server won't start
- **Error**: `Cannot find module './backend/routes/hybridSearchRoutes.js'`
- **Fix**: Make sure the files were created in the correct directories

### Search returns no results
- **Check**: Browser console for error messages
- **Check**: Server logs for `[HybridSearch]` messages
- **Fix**: Ensure database connection is working

### Scores seem wrong
- **Check**: `metadata` field in response for algorithm details
- **Adjust**: Weights in `backend/search-engine.js` if needed

## Next Steps

1. **Monitor Performance**: Check search times in server logs
2. **Tune Weights**: Adjust based on user feedback
3. **Add Analytics**: Track which algorithm contributes most to clicks
4. **Optimize**: Consider pre-computing embeddings for faster searches

## Files Created

```
backend/
├── search-engine.js              # Core algorithms
├── routes/
│   └── hybridSearchRoutes.js     # API endpoint
├── SEARCH_ENGINE_README.md       # Full documentation
└── INTEGRATION_GUIDE.md          # This file
```

## Support

If you encounter issues:
1. Check server logs for error messages
2. Verify all files are in correct locations
3. Ensure AI API key is valid
4. Test with simple queries first

Happy searching! 🚀
