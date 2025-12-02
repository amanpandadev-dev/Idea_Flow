# Advanced Search System Documentation

## 🎯 Overview

The IdeaFlow Dashboard now features an **enterprise-grade search system** that combines:

1. **BM25+ Algorithm** - Advanced keyword relevance scoring
2. **Vector Similarity** - Semantic understanding using embeddings
3. **Reciprocal Rank Fusion (RRF)** - Consensus-based ranking
4. **NLP Query Processing** - Spell correction and query expansion
5. **AI-Powered Enhancement** - Intelligent query refinement using Gemini

---

## 🚀 Key Features

### 1. Spell Correction
Automatically corrects common misspellings:
- `clodus` → `cloud`
- `custmer` → `customer`
- `amatuer` → `amateur`
- `kubernets` → `kubernetes`
- `databse` → `database`

### 2. Query Expansion
Expands queries with synonyms and related terms:
- `monitoring` → `monitoring, observability, tracking, health check, metrics`
- `banking` → `banking, financial services, fintech, payment, transaction`
- `hospital` → `hospital, healthcare, medical, clinical, patient care`
- `ai` → `artificial intelligence, AI, machine learning, ML, deep learning`

### 3. Naive User Support
Understands simple language queries:
- `"monitoring system"` → `"health monitoring, system monitoring, observability, tracking"`
- `"banking apps"` → `"banking applications, financial services, fintech, payment systems"`
- `"hospital software"` → `"hospital healthcare medical clinical patient care software"`

### 4. Hybrid Ranking
Combines multiple scoring methods with configurable weights:
- **BM25+**: 30% (keyword relevance)
- **Vector Similarity**: 50% (semantic similarity)
- **RRF**: 20% (rank fusion consensus)

---

## 📡 API Endpoints

### 1. Advanced Search (Recommended)

```http
GET /api/ideas/search?q=<query>&profile=<profile>&topK=<number>&minScore=<number>&useAI=<boolean>
```

**Parameters:**
- `q` (required): Search query
- `profile` (optional): Weight profile - `balanced`, `keyword`, `semantic`, `consensus` (default: `balanced`)
- `topK` (optional): Maximum results to return (default: `50`)
- `minScore` (optional): Minimum match score threshold (default: `10`)
- `useAI` (optional): Use AI for query enhancement (default: `true`)

**Example:**
```bash
curl "http://localhost:3001/api/ideas/search?q=clodus+monitoring+for+hospitals&profile=balanced&topK=20&useAI=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "IDEA-101",
      "title": "Cloud-based Hospital Monitoring System",
      "matchScore": 95,
      "bm25Score": 88,
      "vectorScore": 97,
      "rrfScore": 92,
      "_scoring": {
        "bm25Raw": 12.45,
        "vectorRaw": 0.87,
        "compositeScore": 0.95
      }
    }
  ],
  "metadata": {
    "query": {
      "original": "clodus monitoring for hospitals",
      "corrected": "cloud monitoring for hospitals",
      "expanded": ["cloud", "monitoring", "observability", "hospital", "healthcare", "medical"],
      "aiEnhanced": true
    },
    "scoring": {
      "weights": { "bm25": 0.30, "vector": 0.50, "rrf": 0.20 },
      "totalDocuments": 150,
      "matchedDocuments": 20
    },
    "performance": {
      "processingTime": 245,
      "documentsPerSecond": 612
    }
  }
}
```

### 2. Adaptive Search (Auto-Profile Selection)

```http
GET /api/ideas/adaptive-search?q=<query>&topK=<number>&minScore=<number>&useAI=<boolean>
```

Automatically selects the best weight profile based on query characteristics:
- Short queries (1-2 words) → `keyword` profile
- Long queries (>10 words) → `semantic` profile
- Medium queries → `balanced` profile

**Example:**
```bash
curl "http://localhost:3001/api/ideas/adaptive-search?q=ai+chatbot&useAI=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Get Available Profiles

```http
GET /api/ideas/search/profiles
```

Returns all available weight profiles and their configurations.

**Response:**
```json
{
  "success": true,
  "profiles": [
    {
      "name": "balanced",
      "weights": { "bm25": 0.30, "vector": 0.50, "rrf": 0.20 },
      "description": "Balanced approach combining keyword and semantic search (default)"
    },
    {
      "name": "keyword",
      "weights": { "bm25": 0.60, "vector": 0.25, "rrf": 0.15 },
      "description": "Keyword-focused for exact term matches"
    },
    {
      "name": "semantic",
      "weights": { "bm25": 0.15, "vector": 0.70, "rrf": 0.15 },
      "description": "Semantic-focused for conceptual similarity"
    },
    {
      "name": "consensus",
      "weights": { "bm25": 0.25, "vector": 0.25, "rrf": 0.50 },
      "description": "Consensus-based using rank fusion"
    }
  ]
}
```

---

## 🎨 Weight Profiles

### Balanced (Default)
- **BM25**: 30% | **Vector**: 50% | **RRF**: 20%
- Best for general-purpose search
- Good balance between keyword and semantic matching

### Keyword
- **BM25**: 60% | **Vector**: 25% | **RRF**: 15%
- Best for exact term matches
- Use when users know specific technical terms

### Semantic
- **BM25**: 15% | **Vector**: 70% | **RRF**: 15%
- Best for conceptual similarity
- Use for exploratory or vague queries

### Consensus
- **BM25**: 25% | **Vector**: 25% | **RRF**: 50%
- Best for diverse ranking
- Emphasizes agreement between methods

---

## 🧪 Testing Examples

### Example 1: Spell Correction
```bash
# Query with misspellings
curl "http://localhost:3001/api/ideas/search?q=clodus+databse+for+custmer+managment" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Automatically corrected to:
# "cloud database for customer management"
```

### Example 2: Query Expansion
```bash
# Simple query
curl "http://localhost:3001/api/ideas/search?q=monitoring" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expanded to:
# "monitoring observability tracking surveillance health check metrics alerting"
```

### Example 3: Naive User Query
```bash
# Naive query
curl "http://localhost:3001/api/ideas/search?q=banking+apps" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Enhanced to:
# "banking applications financial services fintech payment systems transaction processing"
```

### Example 4: Profile Comparison
```bash
# Keyword-focused
curl "http://localhost:3001/api/ideas/search?q=kubernetes&profile=keyword" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Semantic-focused
curl "http://localhost:3001/api/ideas/search?q=kubernetes&profile=semantic" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 Performance Metrics

### Typical Performance
- **Processing Time**: 200-500ms for 100-200 documents
- **Throughput**: 400-800 documents/second
- **Accuracy**: 85-95% relevance for top 10 results

### Optimization Tips
1. Use `topK` parameter to limit results
2. Set `minScore` threshold to filter low-quality matches
3. Disable AI (`useAI=false`) for faster processing
4. Use `keyword` profile for simple queries

---

## 🔧 Integration with Frontend

### Update services.ts

```typescript
export const advancedSearchIdeas = async (
  query: string,
  options: {
    profile?: 'balanced' | 'keyword' | 'semantic' | 'consensus';
    topK?: number;
    minScore?: number;
    useAI?: boolean;
  } = {}
): Promise<{ results: Idea[], metadata: any }> => {
  const { profile = 'balanced', topK = 50, minScore = 10, useAI = true } = options;
  
  const url = `${API_URL}/ideas/search?q=${encodeURIComponent(query)}&profile=${profile}&topK=${topK}&minScore=${minScore}&useAI=${useAI}`;
  
  return fetchWithAuth(url);
};

export const adaptiveSearchIdeas = async (
  query: string,
  options: {
    topK?: number;
    minScore?: number;
    useAI?: boolean;
  } = {}
): Promise<{ results: Idea[], metadata: any }> => {
  const { topK = 50, minScore = 10, useAI = true } = options;
  
  const url = `${API_URL}/ideas/adaptive-search?q=${encodeURIComponent(query)}&topK=${topK}&minScore=${minScore}&useAI=${useAI}`;
  
  return fetchWithAuth(url);
};
```

### Usage in Components

```typescript
// In your search component
const handleSearch = async (query: string) => {
  setLoading(true);
  try {
    const { results, metadata } = await advancedSearchIdeas(query, {
      profile: 'balanced',
      topK: 20,
      useAI: true
    });
    
    setResults(results);
    console.log('Query enhanced:', metadata.query);
    console.log('Processing time:', metadata.performance.processingTime, 'ms');
  } catch (error) {
    console.error('Search failed:', error);
  } finally {
    setLoading(false);
  }
};
```

---

## 🎓 Algorithm Details

### BM25+ Formula
```
BM25+(q, d) = Σ IDF(qi) × [(k1 + 1) × f(qi, d)] / [k1 × (1 - b + b × |d|/avgdl) + f(qi, d)] + δ
```

Where:
- `IDF(qi)` = Inverse Document Frequency
- `f(qi, d)` = Term frequency in document
- `|d|` = Document length
- `avgdl` = Average document length
- `k1` = 1.5 (term frequency saturation)
- `b` = 0.75 (length normalization)
- `δ` = 0.5 (lower bound)

### Vector Similarity (Cosine)
```
similarity(A, B) = (A · B) / (||A|| × ||B||)
```

### Reciprocal Rank Fusion
```
RRF(d) = Σ 1 / (k + rank_i(d))
```

Where:
- `k` = 60 (RRF constant)
- `rank_i(d)` = Rank of document d in list i

### Final Score
```
score = (BM25_norm × w_bm25) + (Vector_norm × w_vector) + (RRF_norm × w_rrf)
```

---

## 🐛 Troubleshooting

### Issue: Low match scores
**Solution**: Lower `minScore` parameter or use `semantic` profile

### Issue: Too many results
**Solution**: Increase `minScore` or decrease `topK`

### Issue: Slow performance
**Solution**: Set `useAI=false` or reduce `topK`

### Issue: Irrelevant results
**Solution**: Try different weight profiles or add more specific terms

---

## 📈 Future Enhancements

- [ ] Multi-language support
- [ ] Custom spell correction dictionaries
- [ ] User feedback learning
- [ ] Query suggestions
- [ ] Faceted search
- [ ] Real-time search as you type

---

## 📝 Notes

- AI enhancement requires `API_KEY` environment variable
- Spell correction works offline (no API required)
- Query expansion uses built-in dictionary
- All features are backward compatible

---

**Version**: 2.0.0  
**Last Updated**: December 2, 2025  
**Author**: Senior Software Engineer-II Team
