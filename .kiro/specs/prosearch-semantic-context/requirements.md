# ProSearch Conversational Semantic Context - Requirements

## Problem Statement

ProSearch currently remembers conversation **textually** but not **semantically**. This causes:

1. **Context Drift**: Second message ignores first message's semantic meaning
2. **Search Reset**: Each query re-searches the entire collection
3. **Filter-Only Refinement**: Filters help narrow results, but semantic intent is lost

## Current Architecture Issues

### What Works
- ✅ Text-based conversation history
- ✅ Metadata filtering (technologies, years, domains)
- ✅ Progressive narrowing of results
- ✅ Intent classification

### What's Missing
- ❌ **Conversation embedding** - No persistent semantic state
- ❌ **Vector accumulation** - Each message embedded in isolation
- ❌ **Context-aware search** - Previous meaning not mathematically preserved

## Solution: Conversation Vector State

Add persistent semantic memory to conversations using **vector accumulation**.

### Core Concept

```
Message 1: "Find blockchain projects"
  → Embedding E1
  → conversationEmbedding = E1
  → Search using E1

Message 2: "using Java"
  → Embedding E2
  → conversationEmbedding = normalize(0.7 * E1 + 0.3 * E2)
  → Search using combined embedding
  ✅ Meaning preserved, context respected
```

## Requirements

### 1. Add Conversation Embedding to Context

**Requirement 1.1**: Extend `ConversationContext` class
- Add `conversationEmbedding` field (number[] | null)
- Add `lastEmbedding` field for debugging
- Add `embeddingHistory` array (optional, for advanced features)

**Requirement 1.2**: Implement `updateEmbedding()` method
- Accept new embedding vector
- Combine with existing using weighted average
- Normalize result to unit vector
- Default weights: 0.7 (previous) + 0.3 (new)

### 2. Modify Semantic Search Flow

**Requirement 2.1**: Update embedding generation
- Generate embedding for new message
- Call `context.updateEmbedding(newEmbedding)`
- Use `context.conversationEmbedding` for search

**Requirement 2.2**: Preserve embedding across turns
- Store embedding in context after each search
- Reuse for refinements (don't re-embed)
- Clear only on explicit reset

### 3. Add Query Rewriting (Optional Enhancement)

**Requirement 3.1**: Detect ambiguous queries
- Query length < 3 words
- Intent = APPLY_FILTER
- User uses pronouns ("those", "same", "them")

**Requirement 3.2**: Rewrite with context
- Use LLM to expand query with conversation history
- Include previous base query
- Embed rewritten query instead

### 4. Add Vector Utility Functions

**Requirement 4.1**: Implement vector operations
- `addVectors(v1, v2)` - Element-wise addition
- `scaleVector(v, scalar)` - Multiply by scalar
- `normalizeVector(v)` - Convert to unit vector
- `cosineSimilarity(v1, v2)` - Measure similarity

**Requirement 4.2**: Add time-decay weighting (optional)
- Older messages get lower weight
- Formula: `weight = exp(-λ * age)`
- Configurable decay rate λ

### 5. Persist Embedding State

**Requirement 5.1**: Save to database
- Add `conversation_embedding` column to `conversation_search_state`
- Store as JSONB or FLOAT[] array
- Save after each semantic search

**Requirement 5.2**: Restore from database
- Load embedding when rehydrating conversation
- Set `context.conversationEmbedding` from DB
- Continue accumulation from saved state

### 6. Add Debugging & Monitoring

**Requirement 6.1**: Log embedding operations
- Log when embedding is updated
- Show weights used for combination
- Display similarity between consecutive embeddings

**Requirement 6.2**: Add metadata to responses
- Include `embeddingUpdated: boolean`
- Include `embeddingSimilarity: number` (to previous)
- Include `embeddingAge: number` (messages since last update)

## Success Criteria

### Functional Requirements
1. ✅ Second message semantically builds on first message
2. ✅ Search uses accumulated context, not just latest query
3. ✅ Filters work in combination with semantic context
4. ✅ Conversation embedding persists across page reloads
5. ✅ Reset clears both filters AND embedding

### Performance Requirements
1. ✅ Embedding combination < 5ms (vector operations)
2. ✅ No additional API calls for simple refinements
3. ✅ Database save/load < 50ms

### Quality Requirements
1. ✅ Semantic drift reduced by 80%+
2. ✅ User intent preserved across 5+ turns
3. ✅ Works with existing filter system
4. ✅ Backward compatible with current API

## Non-Requirements

- ❌ Do NOT change frontend API contract
- ❌ Do NOT break existing filter functionality
- ❌ Do NOT require reindexing ChromaDB
- ❌ Do NOT add external dependencies

## Implementation Priority

### Phase 1: Core Vector State (MVP)
1. Add `conversationEmbedding` to `ConversationContext`
2. Implement vector utility functions
3. Update semantic search to use accumulated embedding
4. Test with 2-3 turn conversations

### Phase 2: Persistence
1. Add database column for embedding
2. Save/restore embedding state
3. Test conversation reload

### Phase 3: Enhancements (Optional)
1. Add query rewriting for ambiguous queries
2. Add time-decay weighting
3. Add embedding similarity metrics
4. Add admin dashboard for monitoring

## Testing Strategy

### Unit Tests
- Vector operations (add, scale, normalize)
- Embedding combination with different weights
- Edge cases (null, empty, single message)

### Integration Tests
- 2-turn conversation: "blockchain" → "using Java"
- 3-turn conversation with filters
- Conversation reload from database
- Reset clears embedding

### Property-Based Tests
- Vector normalization always produces unit vector
- Embedding combination is commutative (order doesn't matter for same weights)
- Accumulated embedding converges (doesn't explode)

## Acceptance Criteria

**Scenario 1: Basic Semantic Continuation**
```
User: "Find blockchain projects"
  → 50 results
User: "using Java"
  → Should return blockchain+Java projects, not all Java projects
  ✅ PASS if results are subset of first search
```

**Scenario 2: Filter + Semantic**
```
User: "Find AI projects"
  → 100 results
User: "from 2024"
  → Should return AI projects from 2024
  ✅ PASS if semantic context (AI) is preserved
```

**Scenario 3: Conversation Reload**
```
User: "Find cloud infrastructure"
  → 30 results
[User closes tab, reopens]
User: "using AWS"
  → Should continue from cloud infrastructure context
  ✅ PASS if embedding is restored from DB
```

**Scenario 4: Reset**
```
User: "Find healthcare ideas"
  → 40 results
User: "using Python"
  → 15 results
User: "reset" or "clear"
  → Should clear both filters AND embedding
User: "Find finance ideas"
  → Should NOT be influenced by healthcare context
  ✅ PASS if embedding is cleared
```

## Migration Strategy

### Backward Compatibility
- Existing conversations without embedding continue to work
- Embedding is optional (null-safe)
- Gradual rollout: new conversations get embedding, old ones don't

### Database Migration
```sql
-- Add embedding column (nullable for backward compatibility)
ALTER TABLE conversation_search_state 
ADD COLUMN conversation_embedding JSONB;

-- Add index for faster retrieval
CREATE INDEX idx_conversation_embedding 
ON conversation_search_state(conversation_id);
```

### Rollback Plan
- If issues arise, set `USE_CONVERSATION_EMBEDDING = false`
- System falls back to current behavior
- No data loss, embedding column ignored

## Documentation Requirements

1. **Developer Guide**: How conversation embedding works
2. **API Documentation**: New fields in response
3. **Admin Guide**: Monitoring embedding quality
4. **User Guide**: How semantic context improves search

## Success Metrics

### Quantitative
- **Semantic Relevance**: 80%+ of follow-up queries return relevant results
- **User Satisfaction**: 90%+ of users find results "more relevant"
- **Performance**: < 5ms overhead for embedding operations
- **Adoption**: 100% of new conversations use embedding

### Qualitative
- Users report "search understands what I mean"
- Fewer "start over" or "reset" actions
- More multi-turn conversations (3+ messages)
- Positive feedback on result quality
