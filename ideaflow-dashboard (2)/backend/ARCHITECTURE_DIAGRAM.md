# Search Engine Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER QUERY                                       │
│                    "AI chatbot for support"                              │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    STEP 1: NLP Enhancement                               │
│                    (Gemini 2.0 Flash Exp)                                │
│                                                                           │
│  Input:  "AI chatbot for support"                                        │
│  Output: "artificial intelligence AI chatbot conversational agent        │
│           customer support service helpdesk"                             │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  STEP 2A: Tokenization       │  │  STEP 2B: Embedding          │
│                              │  │                              │
│  Terms: [artificial,         │  │  Model: text-embedding-004   │
│          intelligence,       │  │  Dimensions: 768             │
│          chatbot,            │  │  Vector: [0.23, -0.45, ...]  │
│          support, ...]       │  │                              │
└──────────────┬───────────────┘  └──────────────┬───────────────┘
               │                                 │
               │                                 │
               ▼                                 │
┌─────────────────────────────────────────────────────────────────────────┐
│                STEP 3: Broad Retrieval (PostgreSQL FTS)                  │
│                                                                           │
│  SELECT * FROM ideas WHERE                                                │
│    to_tsvector('english', title || summary || ...) @@                    │
│    websearch_to_tsquery('english', enhanced_query)                       │
│  LIMIT 150                                                                │
│                                                                           │
│  Result: 150 candidate documents                                         │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    STEP 4: Parallel Scoring                              │
│                                                                           │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────┐ │
│  │   BM25+ Scoring │  │ Vector Similarity│  │   Create Rankings      │ │
│  │                 │  │                  │  │                        │ │
│  │  For each doc:  │  │  For each doc:   │  │  BM25 Ranked List:     │ │
│  │  - Count terms  │  │  - Get embedding │  │  1. Doc A (12.5)       │ │
│  │  - Calculate TF │  │  - Cosine sim    │  │  2. Doc B (11.2)       │ │
│  │  - Calculate IDF│  │  - Score: 0-1    │  │  3. Doc C (9.8)        │ │
│  │  - Apply BM25+  │  │                  │  │                        │ │
│  │                 │  │                  │  │  Vector Ranked List:   │ │
│  │  Scores:        │  │  Scores:         │  │  1. Doc C (0.92)       │ │
│  │  Doc A: 12.5    │  │  Doc A: 0.78     │  │  2. Doc A (0.78)       │ │
│  │  Doc B: 11.2    │  │  Doc B: 0.65     │  │  3. Doc B (0.65)       │ │
│  │  Doc C: 9.8     │  │  Doc C: 0.92     │  │                        │ │
│  └─────────────────┘  └──────────────────┘  └────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              STEP 5: Reciprocal Rank Fusion (RRF)                        │
│                                                                           │
│  RRF Score = Σ [1 / (k + rank)]  where k = 60                           │
│                                                                           │
│  Doc A: 1/(60+1) + 1/(60+2) = 0.0163 + 0.0161 = 0.0324                  │
│  Doc B: 1/(60+2) + 1/(60+3) = 0.0161 + 0.0159 = 0.0320                  │
│  Doc C: 1/(60+3) + 1/(60+1) = 0.0159 + 0.0163 = 0.0322                  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    STEP 6: Score Normalization                           │
│                                                                           │
│  Normalize each score set to 0-1 range using min-max:                   │
│  normalized = (score - min) / (max - min)                                │
│                                                                           │
│  BM25 Normalized:    Doc A: 1.00, Doc B: 0.56, Doc C: 0.00              │
│  Vector Normalized:  Doc A: 0.00, Doc B: 0.00, Doc C: 1.00              │
│  RRF Normalized:     Doc A: 1.00, Doc B: 0.00, Doc C: 0.50              │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 STEP 7: Weighted Combination                             │
│                                                                           │
│  Final Score = (BM25_norm × 0.30) + (Vector_norm × 0.50) + (RRF × 0.20) │
│                                                                           │
│  Doc A: (1.00 × 0.30) + (0.00 × 0.50) + (1.00 × 0.20) = 0.50            │
│  Doc B: (0.56 × 0.30) + (0.00 × 0.50) + (0.00 × 0.20) = 0.17            │
│  Doc C: (0.00 × 0.30) + (1.00 × 0.50) + (0.50 × 0.20) = 0.60            │
│                                                                           │
│  Convert to 0-100: Doc C: 60%, Doc A: 50%, Doc B: 17%                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STEP 8: Final Ranking                               │
│                                                                           │
│  1. Doc C - AI Match: 60% (High semantic relevance)                     │
│  2. Doc A - AI Match: 50% (Balanced keyword + consensus)                │
│  3. Doc B - AI Match: 17% (Lower overall relevance)                     │
│                                                                           │
│  Return to user with facets and metadata                                 │
└─────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════
                            ALGORITHM WEIGHTS
═══════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│   BM25+ (30%)          Vector (50%)         RRF (20%)                    │
│   ═══════════          ════════════         ═════════                    │
│                                                                           │
│   Keyword              Semantic             Consensus                    │
│   Matching             Understanding        Ranking                      │
│                                                                           │
│   ✓ Exact terms        ✓ Concepts           ✓ Balances both             │
│   ✓ Technical          ✓ Synonyms           ✓ Reduces outliers          │
│   ✓ Acronyms           ✓ Intent             ✓ Stable results            │
│                                                                           │
│   Best for:            Best for:            Best for:                    │
│   - Product names      - Natural queries    - Overall quality           │
│   - Tech terms         - Descriptions       - Robustness                │
│   - Specific IDs       - User intent        - Consistency               │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════
                          PERFORMANCE PROFILE
═══════════════════════════════════════════════════════════════════════════

Time Breakdown (typical 100-document search):

┌──────────────────────────────────────────────────────────────┐
│ NLP Enhancement        │████░░░░░░░░░░░░░░░░░░░░░░  200ms   │
│ Embedding Generation   │██████░░░░░░░░░░░░░░░░░░░░  300ms   │
│ PostgreSQL FTS         │███░░░░░░░░░░░░░░░░░░░░░░░  150ms   │
│ BM25+ Calculation      │████░░░░░░░░░░░░░░░░░░░░░░  200ms   │
│ Vector Similarity      │████████████░░░░░░░░░░░░░░  600ms   │
│ RRF Combination        │██░░░░░░░░░░░░░░░░░░░░░░░░  100ms   │
│ Normalization          │█░░░░░░░░░░░░░░░░░░░░░░░░░   50ms   │
│ Final Ranking          │█░░░░░░░░░░░░░░░░░░░░░░░░░   50ms   │
│                        │                                     │
│ TOTAL                  │████████████████████░░░░░░ 1650ms   │
└──────────────────────────────────────────────────────────────┘

Bottleneck: Vector embedding generation (can be optimized with caching)
```

## Key Insights

1. **Parallel Processing**: BM25+ and Vector scoring happen independently
2. **RRF Consensus**: Combines rankings to reduce individual algorithm bias
3. **Normalization**: Ensures fair comparison across different score scales
4. **Weighted Combination**: Prioritizes semantic understanding (50%) while maintaining keyword accuracy (30%)

## Example Scenarios

### Scenario 1: Exact Keyword Match
Query: "React Dashboard"
- **BM25+**: High (exact term match)
- **Vector**: Medium (understands concept)
- **RRF**: High (both algorithms agree)
- **Result**: High overall score

### Scenario 2: Semantic Query
Query: "tool for visualizing data trends"
- **BM25+**: Low (no exact terms)
- **Vector**: High (understands intent)
- **RRF**: Medium (one algorithm strong)
- **Result**: Medium-high score (vector dominates)

### Scenario 3: Typo in Query
Query: "machne lerning chatbot"
- **NLP**: Corrects to "machine learning chatbot"
- **BM25+**: High (after correction)
- **Vector**: High (semantic understanding)
- **RRF**: High (consensus)
- **Result**: High overall score

## Optimization Opportunities

1. **Embedding Cache**: Pre-compute and store document embeddings
2. **Batch Processing**: Generate embeddings in parallel batches
3. **Index Optimization**: Add GIN indexes for PostgreSQL FTS
4. **Result Caching**: Cache popular queries
5. **Async Processing**: Move heavy computations to background workers
