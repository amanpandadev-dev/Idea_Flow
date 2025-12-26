# Legacy Indexing Scripts - DEPRECATED

**Date Deprecated**: December 26, 2025  
**Reason**: Replaced by single authoritative indexing script

---

## ⚠️ DO NOT USE THESE SCRIPTS

These scripts have been **deprecated** and replaced by:

**New Authoritative Script**:
```bash
node backend/scripts/reindexIdeasSemanticIndex.js
```

---

## Why These Were Deprecated

### 1. Multiple Collections Problem
- ❌ `reindex-chromadb-llama.js` → Created `ideas_search`
- ❌ `verifyAndReindexIdeas.js` → Created `ideas_collection`
- ❌ `migrateIdeasToChroma.js` → Created `ideas_collection`

**Result**: Inconsistent behavior, confusion about which collection to use

### 2. Missing Fields
- ❌ Did NOT include `responsible_ai` in embeddings
- ❌ Did NOT include `risks` in embeddings

### 3. Inconsistent Embeddings
- ❌ Mixed embedding providers (Gemini, Grok, Llama)
- ❌ Vector dimension mismatches

---

## New Architecture

### Single Collection
- ✅ `ideas_semantic_index` - ONE collection for everything

### Enhanced Embeddings
- ✅ Includes `responsible_ai` field
- ✅ Includes `risks` field
- ✅ Llama/Ollama only (nomic-embed-text, 768 dim)

### Features Using New Collection
- ✅ ProSearch
- ✅ Agent Tab
- ✅ Similar Ideas
- ✅ Market Validation
- ✅ All search features

---

## Migration Guide

If you were using old scripts, use the new one:

### Old (DEPRECATED):
```bash
# DON'T USE
node backend/scripts/reindex-chromadb-llama.js
node backend/scripts/verifyAndReindexIdeas.js
node backend/scripts/migrateIdeasToChroma.js
```

### New (CURRENT):
```bash
# USE THIS
node backend/scripts/reindexIdeasSemanticIndex.js
```

---

## Files in This Folder

| File | Original Purpose | Replaced By |
|------|------------------|-------------|
| `reindex-chromadb-llama.js.deprecated` | Full reindex with Llama | `reindexIdeasSemanticIndex.js` |
| `verifyAndReindexIdeas.js.deprecated` | Incremental reindex | `reindexIdeasSemanticIndex.js` |
| `migrateIdeasToChroma.js.deprecated` | Initial migration | `reindexIdeasSemanticIndex.js` |

---

## Can I Delete These?

**Yes**, but they're kept here for reference in case you need to:
- Review old indexing logic
- Compare old vs new implementation
- Troubleshoot migration issues

**Safe to delete** after confirming new indexing works correctly.

---

## Questions?

See the main documentation:
- `backend/scripts/reindexIdeasSemanticIndex.js` - New script with comments
- Project walkthrough artifact - Complete migration guide
