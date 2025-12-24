# ProSearch Conversational Semantic Context - Design

## Overview

This design implements **conversation vector state** - a persistent semantic memory that accumulates meaning across multiple turns. Instead of embedding each message in isolation, we maintain a running conversation embedding that mathematically preserves context.

## Architecture

### Current Flow (Problematic)
```
Message 1: "blockchain"
  → embed("blockchain") → E1
  → search(E1) → 50 results

Message 2: "using Java"
  → embed("using Java") → E2  ❌ E1 is lost!
  → search(E2) → ALL Java projects (not blockchain+Java)
```

### New Flow (With Conversation Embedding)
```
Message 1: "blockchain"
  → embed("blockchain") → E1
  → context.conversationEmbedding = E1
  → search(E1) → 50 results

Message 2: "using Java"
  → embed("using Java") → E2
  → context.conversationEmbedding = combine(E1, E2)  ✅ E1 preserved!
  → search(combined) → blockchain+Java projects
```

## Components

### 1. Vector Utility Module

**File**: `backend/utils/vectorOperations.js`

```javascript
/**
 * Add two vectors element-wise
 */
export function addVectors(v1, v2) {
    if (v1.length !== v2.length) {
        throw new Error('Vectors must have same dimension');
    }
    return v1.map((val, i) => val + v2[i]);
}

/**
 * Multiply vector by scalar
 */
export function scaleVector(vector, scalar) {
    return vector.map(val => val * scalar);
}

/**
 * Normalize vector to unit length
 */
export function normalizeVector(vector) {
    const magnitude = Math.sqrt(
        vector.reduce((sum, val) => sum + val * val, 0)
    );
    
    if (magnitude === 0) {
        return vector; // Avoid division by zero
    }
    
    return vector.map(val => val / magnitude);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(v1, v2) {
    if (v1.length !== v2.length) {
        throw new Error('Vectors must have same dimension');
    }
    
    const dotProduct = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
    const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
    
    if (mag1 === 0 || mag2 === 0) {
        return 0;
    }
    
    return dotProduct / (mag1 * mag2);
}

/**
 * Combine two embeddings with weighted average
 * @param {number[]} prevEmbedding - Previous conversation embedding
 * @param {number[]} newEmbedding - New message embedding
 * @param {number} prevWeight - Weight for previous (default 0.7)
 * @param {number} newWeight - Weight for new (default 0.3)
 * @returns {number[]} Combined and normalized embedding
 */
export function combineEmbeddings(prevEmbedding, newEmbedding, prevWeight = 0.7, newWeight = 0.3) {
    const scaled1 = scaleVector(prevEmbedding, prevWeight);
    const scaled2 = scaleVector(newEmbedding, newWeight);
    const combined = addVectors(scaled1, scaled2);
    return normalizeVector(combined);
}

/**
 * Calculate time-decay weight
 * @param {number} age - Age in milliseconds
 * @param {number} lambda - Decay rate (default 0.0001)
 * @returns {number} Weight between 0 and 1
 */
export function timeDecayWeight(age, lambda = 0.0001) {
    return Math.exp(-lambda * age);
}
```

### 2. Enhanced ConversationContext

**File**: `backend/services/sessionContextManager.js` (modifications)

```javascript
class ConversationContext {
    constructor(sessionId, conversationId) {
        // ... existing fields ...
        
        // NEW: Semantic state
        this.conversationEmbedding = null;  // Current accumulated embedding
        this.lastEmbedding = null;          // Last message embedding (for debugging)
        this.embeddingHistory = [];         // Optional: track all embeddings
        this.embeddingUpdatedAt = null;     // Timestamp of last update
        this.messageCount = 0;              // Number of messages with embeddings
    }
    
    /**
     * Update conversation embedding with new message embedding
     * @param {number[]} newEmbedding - Embedding of new message
     * @param {Object} options - Configuration options
     */
    updateEmbedding(newEmbedding, options = {}) {
        const {
            prevWeight = 0.7,
            newWeight = 0.3,
            useTimeDecay = false,
            trackHistory = false
        } = options;
        
        // First message - initialize
        if (!this.conversationEmbedding) {
            this.conversationEmbedding = newEmbedding;
            this.lastEmbedding = newEmbedding;
            this.embeddingUpdatedAt = Date.now();
            this.messageCount = 1;
            
            console.log(`[Embedding] Initialized conversation embedding (dim: ${newEmbedding.length})`);
            return;
        }
        
        // Calculate weights (with optional time decay)
        let effectivePrevWeight = prevWeight;
        let effectiveNewWeight = newWeight;
        
        if (useTimeDecay && this.embeddingUpdatedAt) {
            const age = Date.now() - this.embeddingUpdatedAt;
            const decayFactor = timeDecayWeight(age);
            effectivePrevWeight *= decayFactor;
            
            // Renormalize weights
            const total = effectivePrevWeight + effectiveNewWeight;
            effectivePrevWeight /= total;
            effectiveNewWeight /= total;
            
            console.log(`[Embedding] Time decay applied: age=${age}ms, decay=${decayFactor.toFixed(3)}`);
        }
        
        // Calculate similarity before update (for monitoring)
        const similarity = cosineSimilarity(this.conversationEmbedding, newEmbedding);
        
        // Combine embeddings
        this.conversationEmbedding = combineEmbeddings(
            this.conversationEmbedding,
            newEmbedding,
            effectivePrevWeight,
            effectiveNewWeight
        );
        
        this.lastEmbedding = newEmbedding;
        this.embeddingUpdatedAt = Date.now();
        this.messageCount++;
        
        // Optional: track history
        if (trackHistory) {
            this.embeddingHistory.push({
                embedding: newEmbedding,
                timestamp: Date.now(),
                similarity
            });
            
            // Keep only last 10
            if (this.embeddingHistory.length > 10) {
                this.embeddingHistory = this.embeddingHistory.slice(-10);
            }
        }
        
        console.log(`[Embedding] Updated: weights=[${effectivePrevWeight.toFixed(2)}, ${effectiveNewWeight.toFixed(2)}], similarity=${similarity.toFixed(3)}, messages=${this.messageCount}`);
    }
    
    /**
     * Get current conversation embedding for search
     */
    getConversationEmbedding() {
        return this.conversationEmbedding;
    }
    
    /**
     * Reset conversation embedding (on explicit reset or new search)
     */
    resetEmbedding() {
        this.conversationEmbedding = null;
        this.lastEmbedding = null;
        this.embeddingHistory = [];
        this.embeddingUpdatedAt = null;
        this.messageCount = 0;
        
        console.log(`[Embedding] Reset conversation embedding`);
    }
    
    /**
     * Get embedding metadata for debugging
     */
    getEmbeddingMetadata() {
        if (!this.conversationEmbedding) {
            return {
                hasEmbedding: false,
                messageCount: 0
            };
        }
        
        return {
            hasEmbedding: true,
            messageCount: this.messageCount,
            dimension: this.conversationEmbedding.length,
            lastUpdated: this.embeddingUpdatedAt,
            age: Date.now() - this.embeddingUpdatedAt,
            historyLength: this.embeddingHistory.length
        };
    }
}
```

### 3. Query Rewriting Service (Optional Enhancement)

**File**: `backend/services/queryRewriter.js`

```javascript
import { generateText } from '../config/ollama.js';

/**
 * Detect if query is ambiguous and needs rewriting
 */
export function isAmbiguousQuery(query, context) {
    const wordCount = query.trim().split(/\s+/).length;
    
    // Short queries
    if (wordCount < 3) {
        return true;
    }
    
    // Pronouns
    const pronouns = ['those', 'them', 'these', 'that', 'this', 'it', 'same'];
    const lower = query.toLowerCase();
    if (pronouns.some(p => lower.includes(p))) {
        return true;
    }
    
    // Filter-only queries with context
    if (context.baseQuery && /^(using|with|from|in|for)\s/.test(lower)) {
        return true;
    }
    
    return false;
}

/**
 * Rewrite query with conversation context
 */
export async function rewriteQueryWithContext(query, context) {
    if (!context.baseQuery) {
        return query; // No context to use
    }
    
    const conversationHistory = context.intentHistory
        .slice(-3)
        .map(h => h.message)
        .join(' → ');
    
    const prompt = `You are helping rewrite a search query to include conversation context.

Previous search: "${context.baseQuery}"
Conversation: ${conversationHistory}
Current query: "${query}"

Rewrite the current query to be self-contained and include relevant context from the conversation.
Keep it concise (under 20 words). Only output the rewritten query, nothing else.

Rewritten query:`;

    try {
        const rewritten = await generateText(prompt, {
            maxOutputTokens: 50,
            temperature: 0.3
        });
        
        const cleaned = rewritten.trim().replace(/^["']|["']$/g, '');
        console.log(`[QueryRewrite] "${query}" → "${cleaned}"`);
        
        return cleaned;
    } catch (error) {
        console.warn(`[QueryRewrite] Failed:`, error.message);
        return query; // Fallback to original
    }
}
```

### 4. Database Schema Changes

**File**: `backend/migrations/add_conversation_embedding.sql`

```sql
-- Add conversation embedding column to conversation_search_state
ALTER TABLE conversation_search_state 
ADD COLUMN IF NOT EXISTS conversation_embedding JSONB;

-- Add metadata columns
ALTER TABLE conversation_search_state
ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS embedding_message_count INTEGER DEFAULT 0;

-- Add index for faster retrieval
CREATE INDEX IF NOT EXISTS idx_conversation_embedding 
ON conversation_search_state(conversation_id) 
WHERE conversation_embedding IS NOT NULL;

-- Add comment
COMMENT ON COLUMN conversation_search_state.conversation_embedding IS 
'Accumulated semantic embedding vector for conversation context (768-dim array stored as JSONB)';
```

### 5. SearchStateService Modifications

**File**: `backend/services/searchStateService.js` (add methods)

```javascript
/**
 * Save conversation embedding to database
 */
async saveConversationEmbedding(conversationId, embedding, messageCount) {
    try {
        await this.pool.query(`
            UPDATE conversation_search_state
            SET 
                conversation_embedding = $1,
                embedding_updated_at = NOW(),
                embedding_message_count = $2
            WHERE conversation_id = $3
        `, [JSON.stringify(embedding), messageCount, conversationId]);
        
        console.log(`[SearchState] Saved conversation embedding (${embedding.length}-dim, ${messageCount} messages)`);
    } catch (error) {
        console.error(`[SearchState] Failed to save embedding:`, error.message);
        throw error;
    }
}

/**
 * Load conversation embedding from database
 */
async loadConversationEmbedding(conversationId) {
    try {
        const result = await this.pool.query(`
            SELECT 
                conversation_embedding,
                embedding_updated_at,
                embedding_message_count
            FROM conversation_search_state
            WHERE conversation_id = $1
        `, [conversationId]);
        
        if (result.rows.length === 0 || !result.rows[0].conversation_embedding) {
            return null;
        }
        
        const row = result.rows[0];
        return {
            embedding: row.conversation_embedding, // Already parsed from JSONB
            updatedAt: row.embedding_updated_at,
            messageCount: row.embedding_message_count
        };
    } catch (error) {
        console.error(`[SearchState] Failed to load embedding:`, error.message);
        return null;
    }
}
```

## Integration Points

### 1. ProSearch Routes - Semantic Search Intent

**Location**: `backend/routes/proSearchRoutes.js`

**Changes in SEMANTIC_SEARCH case**:

```javascript
case INTENTS.SEMANTIC_SEARCH:
    // Build clean query
    cleanQuery = buildSemanticQuery(trimmedQuery);
    
    console.log(`[Semantic] Searching: "${cleanQuery}"`);
    
    // Generate embedding for new message
    const embeddingStart = Date.now();
    const newEmbedding = await getCachedEmbedding(cleanQuery);
    console.log(`[Embedding] Generated in ${Date.now() - embeddingStart}ms`);
    
    // 🆕 UPDATE CONVERSATION EMBEDDING
    context.updateEmbedding(newEmbedding, {
        prevWeight: 0.7,
        newWeight: 0.3,
        useTimeDecay: false,  // Enable for advanced use
        trackHistory: false   // Enable for debugging
    });
    
    // 🆕 USE CONVERSATION EMBEDDING FOR SEARCH
    const searchEmbedding = context.getConversationEmbedding();
    
    console.log(`[Semantic] Using conversation embedding (${context.messageCount} messages accumulated)`);
    
    // Rest of two-stage search logic...
    const collection = await getIdeasCollection();
    const chromaResults = await collection.query({
        queryEmbeddings: [searchEmbedding],  // ← Use accumulated embedding
        nResults: 200
    });
    
    // ... rest of logic ...
    
    break;
```

### 2. ProSearch Routes - Apply Filter Intent

**Changes in APPLY_FILTER case**:

```javascript
case INTENTS.APPLY_FILTER:
    console.log(`[APPLY_FILTER] Applying filter to existing base results`);
    
    // 🆕 OPTIONAL: Rewrite ambiguous queries
    let filterQuery = trimmedQuery;
    if (isAmbiguousQuery(trimmedQuery, context)) {
        console.log(`[APPLY_FILTER] Ambiguous query detected, rewriting...`);
        filterQuery = await rewriteQueryWithContext(trimmedQuery, context);
    }
    
    // Extract filters from (possibly rewritten) query
    const newExtractedFilters = await extractFiltersForPostgres(filterQuery);
    
    // ... rest of filter logic ...
    
    // 🆕 DO NOT update embedding for filter-only queries
    // Embedding only updates on semantic searches
    
    break;
```

### 3. ProSearch Routes - Reset Intent

**Changes in RESET_FILTERS case**:

```javascript
case INTENTS.RESET_FILTERS:
    console.log(`[Progressive] Resetting to base results`);
    
    // Reset filters
    context.resetToBase();
    
    // 🆕 ALSO RESET EMBEDDING
    context.resetEmbedding();
    
    semanticResults = context.getCurrentResults();
    console.log(`[Reset] Restored all ${semanticResults.length} base results + cleared embedding`);
    break;
```

### 4. ProSearch Routes - Save State

**Changes in state persistence**:

```javascript
// Save search state to database (for chat switching)
if (conversationId && (intent === INTENTS.SEMANTIC_SEARCH || intent === INTENTS.REFINE_SEARCH)) {
    try {
        const searchStateService = new SearchStateService(pool);
        
        // ... existing save logic ...
        
        // 🆕 SAVE CONVERSATION EMBEDDING
        if (context.conversationEmbedding) {
            await searchStateService.saveConversationEmbedding(
                conversationId,
                context.conversationEmbedding,
                context.messageCount
            );
            console.log('[SearchState] ✅ Saved conversation embedding');
        }
        
    } catch (saveError) {
        console.error('[SearchState] ❌ CRITICAL: Persistence failed', saveError);
        // ... error handling ...
    }
}
```

### 5. ProSearch Routes - Load State

**Changes in context rehydration**:

```javascript
// CRITICAL FIX 5: ALWAYS rehydrate context from DB
console.log(`[Context Rehydration] Loading state from DB...`);

const searchStateService = new SearchStateService(pool);
const savedState = await searchStateService.loadSearchState(conversationId);

if (savedState && savedState.baseResultIds && savedState.baseResultIds.length > 0) {
    // ... existing restore logic ...
    
    // 🆕 RESTORE CONVERSATION EMBEDDING
    const embeddingData = await searchStateService.loadConversationEmbedding(conversationId);
    if (embeddingData && embeddingData.embedding) {
        context.conversationEmbedding = embeddingData.embedding;
        context.embeddingUpdatedAt = embeddingData.updatedAt;
        context.messageCount = embeddingData.messageCount;
        
        console.log(`[Context Rehydration] ✅ Restored conversation embedding (${context.messageCount} messages)`);
    }
}
```

## Configuration

### Feature Flags

```javascript
// backend/config/prosearch.js
export const PROSEARCH_CONFIG = {
    // Conversation embedding
    USE_CONVERSATION_EMBEDDING: true,
    EMBEDDING_PREV_WEIGHT: 0.7,
    EMBEDDING_NEW_WEIGHT: 0.3,
    
    // Query rewriting
    USE_QUERY_REWRITING: false,  // Optional enhancement
    REWRITE_THRESHOLD_WORDS: 3,
    
    // Time decay
    USE_TIME_DECAY: false,  // Optional enhancement
    TIME_DECAY_LAMBDA: 0.0001,
    
    // History tracking
    TRACK_EMBEDDING_HISTORY: false,  // For debugging
    MAX_EMBEDDING_HISTORY: 10,
    
    // Persistence
    SAVE_EMBEDDING_TO_DB: true,
    LOAD_EMBEDDING_FROM_DB: true
};
```

## Error Handling

### 1. Embedding Dimension Mismatch

```javascript
try {
    context.updateEmbedding(newEmbedding);
} catch (error) {
    if (error.message.includes('dimension')) {
        console.error('[Embedding] Dimension mismatch - resetting');
        context.resetEmbedding();
        context.conversationEmbedding = newEmbedding;
    } else {
        throw error;
    }
}
```

### 2. Database Save Failure

```javascript
try {
    await searchStateService.saveConversationEmbedding(...);
} catch (error) {
    console.error('[Embedding] Failed to save to DB:', error.message);
    // Continue without saving - embedding still in memory
    // Will be lost on server restart, but conversation continues
}
```

### 3. Null/Invalid Embeddings

```javascript
if (!newEmbedding || !Array.isArray(newEmbedding) || newEmbedding.length === 0) {
    console.warn('[Embedding] Invalid embedding received, skipping update');
    return;
}
```

## Performance Considerations

### 1. Vector Operations
- **Addition**: O(n) where n = embedding dimension (768)
- **Scaling**: O(n)
- **Normalization**: O(n)
- **Total**: ~2ms for 768-dim vectors

### 2. Database Operations
- **Save**: Single UPDATE query, ~10-20ms
- **Load**: Single SELECT query, ~10-20ms
- **JSONB storage**: Efficient for 768-dim arrays

### 3. Memory Usage
- **Per conversation**: ~6KB (768 floats × 8 bytes)
- **1000 conversations**: ~6MB
- **Negligible impact** on server memory

## Monitoring & Debugging

### 1. Embedding Metadata in Response

```javascript
res.json({
    // ... existing fields ...
    embeddingMetadata: {
        hasEmbedding: context.conversationEmbedding !== null,
        messageCount: context.messageCount,
        lastUpdated: context.embeddingUpdatedAt,
        similarity: lastSimilarity,  // To previous embedding
        dimension: context.conversationEmbedding?.length
    }
});
```

### 2. Admin Endpoint

```javascript
router.get('/admin/embedding-stats', async (req, res) => {
    const stats = {
        totalConversations: 0,
        withEmbedding: 0,
        averageMessageCount: 0,
        oldestEmbedding: null,
        newestEmbedding: null
    };
    
    // Query database for stats
    const result = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(conversation_embedding) as with_embedding,
            AVG(embedding_message_count) as avg_messages,
            MIN(embedding_updated_at) as oldest,
            MAX(embedding_updated_at) as newest
        FROM conversation_search_state
    `);
    
    // ... populate stats ...
    
    res.json(stats);
});
```

## Testing Strategy

### Unit Tests

```javascript
// test/vectorOperations.test.js
describe('Vector Operations', () => {
    test('addVectors combines correctly', () => {
        const v1 = [1, 2, 3];
        const v2 = [4, 5, 6];
        expect(addVectors(v1, v2)).toEqual([5, 7, 9]);
    });
    
    test('normalizeVector produces unit vector', () => {
        const v = [3, 4];
        const normalized = normalizeVector(v);
        const magnitude = Math.sqrt(normalized[0]**2 + normalized[1]**2);
        expect(magnitude).toBeCloseTo(1.0);
    });
    
    test('combineEmbeddings preserves dimensions', () => {
        const e1 = new Array(768).fill(0.5);
        const e2 = new Array(768).fill(0.3);
        const combined = combineEmbeddings(e1, e2);
        expect(combined.length).toBe(768);
    });
});
```

### Integration Tests

```javascript
// test/conversationEmbedding.test.js
describe('Conversation Embedding', () => {
    test('two-turn conversation accumulates context', async () => {
        // Turn 1
        const res1 = await request(app)
            .post('/api/search/conversational')
            .send({ query: 'blockchain projects' });
        
        const convId = res1.body.conversationId;
        expect(res1.body.results.length).toBeGreaterThan(0);
        
        // Turn 2
        const res2 = await request(app)
            .post('/api/search/conversational')
            .send({ 
                query: 'using Java',
                conversationId: convId
            });
        
        // Should return blockchain+Java, not all Java
        expect(res2.body.results.length).toBeLessThan(res1.body.results.length);
        expect(res2.body.embeddingMetadata.messageCount).toBe(2);
    });
});
```

## Rollout Plan

### Phase 1: Development (Week 1)
- Implement vector operations
- Update ConversationContext
- Add database migration
- Unit tests

### Phase 2: Integration (Week 2)
- Integrate with ProSearch routes
- Add persistence
- Integration tests
- Internal testing

### Phase 3: Beta (Week 3)
- Deploy to staging
- Monitor embedding quality
- Gather user feedback
- Performance tuning

### Phase 4: Production (Week 4)
- Gradual rollout (10% → 50% → 100%)
- Monitor metrics
- A/B testing
- Full documentation

## Success Metrics

### Week 1
- ✅ Vector operations implemented
- ✅ Unit tests passing
- ✅ Context updated

### Week 2
- ✅ Integration complete
- ✅ Database migration applied
- ✅ Integration tests passing

### Week 3
- ✅ Staging deployment successful
- ✅ 90%+ semantic relevance in testing
- ✅ < 5ms embedding overhead

### Week 4
- ✅ Production rollout complete
- ✅ 80%+ user satisfaction
- ✅ 3+ average conversation turns
- ✅ Zero critical bugs
