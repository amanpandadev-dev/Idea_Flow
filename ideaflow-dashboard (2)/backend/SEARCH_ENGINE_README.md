# BM25+ + Vector Similarity + RRF Search Engine

## Overview
This is a modular, state-of-the-art search engine implementation that combines three powerful ranking algorithms:
- **BM25+**: Industry-standard keyword-based scoring
- **Vector Similarity**: Semantic understanding using embeddings
- **Reciprocal Rank Fusion (RRF)**: Consensus-based ranking combination

## Architecture

```
backend/
├── search-engine.js          # Core search algorithms (modular)
└── routes/
    └── hybridSearchRoutes.js # Search API endpoint
```

## Integration Steps

### 1. Import the Search Route in `server.js`

Add this import at the top of your `server.js`:

```javascript
import hybridSearchRoutes from './backend/routes/hybridSearchRoutes.js';
```

### 2. Make AI Available to Routes

Add these lines after initializing the AI (around line 40):

```javascript
// Make AI available to routes
app.set('ai', ai);
app.set('aiAvailable', aiAvailable);
```

### 3. Register the Search Route

Add this line with your other route registrations (around line 75):

```javascript
app.use('/api/search', hybridSearchRoutes);
```

### 4. Update Frontend Service

In `services.ts`, update the `searchIdeas` function to use the new endpoint:

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

## Algorithm Details

### BM25+ Scoring

BM25+ is an improved version of the classic BM25 algorithm with better handling of term frequency.

**Formula:**
```
BM25+(t, d) = IDF(t) × [(k1 + 1) × tf(t, d) / (k1 × (1 - b + b × |d| / avgdl) + tf(t, d)) + δ]
```

**Parameters:**
- `k1 = 1.5`: Controls term frequency saturation
- `b = 0.75`: Controls length normalization
- `δ = 0.5`: Lower bound for term frequency component

**When it works best:**
- Exact keyword matches
- Technical terminology
- Specific product/feature names

### Vector Similarity

Uses Google's `text-embedding-004` model (768 dimensions) to create semantic representations.

**Formula:**
```
Similarity(q, d) = cos(θ) = (q · d) / (||q|| × ||d||)
```

**When it works best:**
- Conceptual queries
- Synonyms and related terms
- Natural language descriptions

### Reciprocal Rank Fusion (RRF)

Combines multiple rankings by considering the position of each result.

**Formula:**
```
RRF(d) = Σ [1 / (k + rank_i(d))]
```

**Parameters:**
- `k = 60`: Standard RRF constant

**Benefits:**
- Reduces impact of outliers
- Balances different ranking signals
- Robust to individual algorithm weaknesses

## Weighted Combination

The final score combines all three algorithms:

```
Final Score = (BM25_norm × 0.30) + (Vector_norm × 0.50) + (RRF_norm × 0.20)
```

**Weight Rationale:**
- **BM25 (30%)**: Ensures exact keyword matches are valued
- **Vector (50%)**: Prioritizes semantic understanding (most important for naive users)
- **RRF (20%)**: Provides consensus and stability

### Customizing Weights

You can adjust weights in `backend/search-engine.js`:

```javascript
export const DEFAULT_SEARCH_CONFIG = {
  weights: {
    bm25: 0.30,    // Increase for more keyword-focused results
    vector: 0.50,  // Increase for more semantic results
    rrf: 0.20      // Increase for more balanced results
  }
};
```

## API Usage

### Request

```http
GET /api/search/hybrid?q=AI%20chatbot&themes=["AI"]&businessGroups=["Technology"]
```

### Response

```json
{
  "results": [
    {
      "id": "IDEA-123",
      "title": "AI-Powered Customer Service Bot",
      "matchScore": 92,
      "bm25Score": 85,
      "vectorScore": 95,
      "rrfScore": 88,
      ...
    }
  ],
  "facets": {
    "themes": { "AI & Machine Learning": 5 },
    "businessGroups": { "Technology": 3 },
    "technologies": { "Python": 4 }
  },
  "metadata": {
    "algorithm": "BM25+ + Vector Similarity + RRF",
    "totalCandidates": 150,
    "weights": { "bm25": 0.3, "vector": 0.5, "rrf": 0.2 },
    "queryTerms": 3,
    "embeddingDimensions": 768
  }
}
```

## Performance Characteristics

### Time Complexity
- **BM25+**: O(n × m) where n = documents, m = query terms
- **Vector Similarity**: O(n × d) where d = embedding dimensions
- **RRF**: O(n × log n) for sorting
- **Overall**: O(n × (m + d + log n))

### Typical Search Times
- **< 50 documents**: < 500ms
- **50-150 documents**: 500ms - 2s
- **> 150 documents**: 2s - 5s

### Optimization Tips

1. **Pre-compute Embeddings**: Cache document embeddings to avoid regeneration
2. **Limit Candidates**: Use PostgreSQL FTS to filter to top 150 candidates
3. **Batch Embedding**: Generate embeddings in parallel
4. **Index Optimization**: Ensure PostgreSQL has proper text search indexes

## Testing

### Test Queries

1. **Keyword Match**: "React dashboard analytics"
   - Expected: High BM25 scores for exact matches

2. **Semantic Match**: "solutions for tracking customer behavior"
   - Expected: High vector scores for conceptual matches

3. **Mixed Query**: "AI chatbot for customer support"
   - Expected: Balanced scores across all algorithms

### Debug Information

Each result includes `_debug` field with raw scores:

```javascript
{
  _debug: {
    bm25Raw: 12.5,      // Raw BM25+ score
    vectorRaw: 0.87,    // Raw cosine similarity
    rrfRaw: 0.032       // Raw RRF score
  }
}
```

## Comparison with Previous Implementation

| Feature | Previous | New (BM25+ + Vector + RRF) |
|---------|----------|----------------------------|
| Keyword Matching | PostgreSQL ts_rank | BM25+ (industry standard) |
| Semantic Understanding | Cosine similarity | Cosine similarity |
| Ranking Combination | Weighted average | RRF + Weighted combination |
| Configurability | Hardcoded weights | Configurable via config |
| Modularity | Monolithic | Modular (reusable) |
| Score Transparency | Single score | Multiple component scores |

## References

1. **BM25+**: Lv, Y., & Zhai, C. (2011). "Lower-bounding term frequency normalization"
2. **RRF**: Cormack, G. V., et al. (2009). "Reciprocal rank fusion outperforms condorcet"
3. **Embeddings**: Google's text-embedding-004 model documentation

## Troubleshooting

### Issue: Low Match Scores

**Possible Causes:**
- Query too generic
- Insufficient training data for embeddings
- Weights not tuned for your data

**Solutions:**
- Encourage more specific queries
- Adjust weights to favor BM25 for keyword-heavy queries
- Add query expansion/refinement

### Issue: Slow Performance

**Possible Causes:**
- Too many candidates
- Embedding generation bottleneck
- Network latency to AI API

**Solutions:**
- Reduce candidate limit in SQL query
- Implement embedding cache
- Use batch embedding generation

### Issue: Inconsistent Results

**Possible Causes:**
- RRF weight too high
- Embedding API failures
- Database content changes

**Solutions:**
- Reduce RRF weight
- Implement fallback to BM25-only mode
- Add result caching

## Future Enhancements

1. **Learning to Rank (LTR)**: Train ML model on user feedback
2. **Query Expansion**: Automatic synonym and related term addition
3. **Personalization**: User-specific ranking adjustments
4. **Embedding Cache**: Pre-compute and store all document embeddings
5. **A/B Testing**: Compare different weight configurations
6. **Analytics**: Track which algorithm contributes most to clicked results

## License

This implementation is part of the IdeaFlow Dashboard project.
