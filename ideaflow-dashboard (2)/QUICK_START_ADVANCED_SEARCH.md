# 🚀 Quick Start: Advanced Search System

## ⚡ 5-Minute Setup

### Step 1: Verify Installation
```bash
# Check if server files exist
ls backend/services/nlpQueryProcessor.js
ls backend/services/advancedSearchService.js
ls backend/routes/advancedSearchRoutes.js
```

### Step 2: Start Server
```bash
npm run server
```

**Expected output:**
```
✅ Database connected successfully
✅ Google GenAI initialized successfully
🚀 Server running on port 3001
```

### Step 3: Test Basic Search
```bash
# Test 1: Spell correction
curl "http://localhost:3001/api/ideas/search?q=clodus+monitoring" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 2: Query expansion
curl "http://localhost:3001/api/ideas/search?q=banking" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 3: Naive user query
curl "http://localhost:3001/api/ideas/search?q=monitoring+system+for+hospitals" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🎯 Common Use Cases

### Use Case 1: User Makes Typos
```bash
# User types: "clodus databse for custmer managment"
curl "http://localhost:3001/api/ideas/search?q=clodus+databse+for+custmer+managment" \
  -H "Authorization: Bearer YOUR_TOKEN"

# System automatically corrects to:
# "cloud database for customer management"
```

### Use Case 2: User Uses Simple Language
```bash
# User types: "banking apps"
curl "http://localhost:3001/api/ideas/search?q=banking+apps" \
  -H "Authorization: Bearer YOUR_TOKEN"

# System expands to:
# "banking applications financial services fintech payment systems"
```

### Use Case 3: User Wants Exact Matches
```bash
# Use keyword profile for exact term matching
curl "http://localhost:3001/api/ideas/search?q=kubernetes&profile=keyword" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Use Case 4: User Wants Conceptual Matches
```bash
# Use semantic profile for conceptual similarity
curl "http://localhost:3001/api/ideas/search?q=container+orchestration&profile=semantic" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 Response Format

```json
{
  "success": true,
  "results": [
    {
      "id": "IDEA-101",
      "title": "Cloud-based Hospital Monitoring System",
      "description": "Real-time patient monitoring...",
      "matchScore": 95,
      "bm25Score": 88,
      "vectorScore": 97,
      "rrfScore": 92
    }
  ],
  "metadata": {
    "query": {
      "original": "clodus monitoring for hospitals",
      "corrected": "cloud monitoring for hospitals",
      "expanded": ["cloud", "monitoring", "hospital", "healthcare"],
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

---

## 🎨 Weight Profiles

| Profile | When to Use | BM25 | Vector | RRF |
|---------|-------------|------|--------|-----|
| **balanced** | General search (default) | 30% | 50% | 20% |
| **keyword** | Exact term matches | 60% | 25% | 15% |
| **semantic** | Conceptual similarity | 15% | 70% | 15% |
| **consensus** | Diverse ranking | 25% | 25% | 50% |

---

## 🧪 Test the System

### Run Automated Tests
```bash
node scripts/test-advanced-search.js
```

**Expected output:**
```
🧪 Advanced Search System - Test Suite

📝 Test 1: Spell Correction
✅ "clodus" → "cloud"
✅ "custmer" → "customer"
✅ "amatuer" → "amateur"

🔍 Test 2: Query Expansion
"monitoring" expanded to:
  monitoring, observability, tracking, health check, metrics...
  (7 total terms)

✅ Test Suite Complete!
```

---

## 🔧 Integration with Frontend

### Update services.ts
```typescript
// Add to services.ts
export const advancedSearchIdeas = async (query: string) => {
  return fetchWithAuth(`${API_URL}/ideas/search?q=${encodeURIComponent(query)}`);
};
```

### Use in Component
```typescript
// In your search component
const handleSearch = async (query: string) => {
  const { results, metadata } = await advancedSearchIdeas(query);
  console.log('Query corrected:', metadata.query.corrected);
  setResults(results);
};
```

---

## 📈 Performance Tips

### Optimize for Speed
```bash
# Disable AI for faster processing
curl "http://localhost:3001/api/ideas/search?q=cloud&useAI=false"

# Limit results
curl "http://localhost:3001/api/ideas/search?q=cloud&topK=10"

# Set minimum score threshold
curl "http://localhost:3001/api/ideas/search?q=cloud&minScore=50"
```

### Optimize for Accuracy
```bash
# Enable AI enhancement
curl "http://localhost:3001/api/ideas/search?q=cloud&useAI=true"

# Use semantic profile
curl "http://localhost:3001/api/ideas/search?q=cloud&profile=semantic"

# Lower minimum score
curl "http://localhost:3001/api/ideas/search?q=cloud&minScore=10"
```

---

## 🐛 Troubleshooting

### Issue: "Database not available"
**Solution**: Ensure PostgreSQL is running and DATABASE_URL is set

### Issue: "AI enhancement failed"
**Solution**: Check API_KEY environment variable

### Issue: Low match scores
**Solution**: Lower minScore parameter or use semantic profile

### Issue: Too many results
**Solution**: Increase minScore or decrease topK

---

## 📚 Documentation

- **Full API Docs**: `ADVANCED_SEARCH_DOCUMENTATION.md`
- **Implementation Details**: `SENIOR_ENGINEER_IMPLEMENTATION.md`
- **Test Suite**: `scripts/test-advanced-search.js`

---

## ✅ Checklist

- [ ] Server running on port 3001
- [ ] Database connected
- [ ] API_KEY set (for AI features)
- [ ] Test queries working
- [ ] Frontend integrated
- [ ] Documentation reviewed

---

## 🎉 You're Ready!

The advanced search system is now active with:
- ✅ Spell correction
- ✅ Query expansion
- ✅ Hybrid ranking (BM25 + Vector + RRF)
- ✅ NLP for naive users
- ✅ AI-powered enhancement

**Next**: Try searching with misspelled words or simple language!

---

**Need Help?** Check `ADVANCED_SEARCH_DOCUMENTATION.md` for detailed examples.
