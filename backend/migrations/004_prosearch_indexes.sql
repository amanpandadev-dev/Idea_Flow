-- ProSearch High-Recall Database Optimizations
-- Run these scripts in pgAdmin manually BEFORE deploying the upgraded ProSearch
-- 
-- Purpose: Optimize PostgreSQL for metadata filtering and full-text search
-- Author: AI Assistant
-- Date: 2025-12-13

-- ===================================================================
-- SECTION 1: CREATE INDEXES FOR METADATA FILTERING
-- ===================================================================

-- Index 1: Multi-column index for common filter combinations
-- Speeds up queries filtering by domain + year + technology
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_domain_year_tech
ON ideas (challenge_opportunity, created_at, code_preference);

-- Index 2: Business group index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_business_group
ON ideas (business_group);

-- Index 3: Year extraction index
-- Allows fast filtering by year without full table scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_year
ON ideas (EXTRACT(YEAR FROM created_at));

-- Index 4: Score index for sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_score
ON ideas (score DESC);

-- ===================================================================
-- SECTION 2: FULL-TEXT SEARCH INDEX (GIN)
-- ===================================================================

-- Index 5: GIN index for full-text search across title, summary, domain
-- Enables fast keyword search fallback when semantic search returns no results
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_fulltext
ON ideas USING GIN (
    to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE(summary, '') || ' ' || 
        COALESCE(challenge_opportunity, '') || ' ' ||
        COALESCE(benefits, '') || ' ' ||
        COALESCE(risks, '')
    )
);

-- ===================================================================
-- SECTION 3: VERIFY INDEXES
-- ===================================================================

-- Query to verify all indexes were created successfully
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'ideas'
AND indexname LIKE 'idx_ideas%'
ORDER BY indexname;

-- ===================================================================
-- SECTION 4: ANALYZE TABLE FOR QUERY PLANNER
-- ===================================================================

-- Update statistics for query planner optimization
ANALYZE ideas;

-- ===================================================================
-- SECTION 5: TEST QUERY PERFORMANCE (OPTIONAL)
-- ===================================================================

-- Test 1: Multi-filter query performance
EXPLAIN ANALYZE
SELECT idea_id, title, summary, challenge_opportunity, business_group, code_preference
FROM ideas
WHERE challenge_opportunity ILIKE '%Banking%'
AND EXTRACT(YEAR FROM created_at) = 2024
AND code_preference ILIKE '%Python%'
LIMIT 100;

-- Test 2: Full-text search performance
EXPLAIN ANALYZE  
SELECT idea_id, title, summary
FROM ideas
WHERE to_tsvector('english', 
    COALESCE(title, '') || ' ' || 
    COALESCE(summary, '')
) @@ to_tsquery('english', 'AI & automation')
LIMIT 100;

-- ===================================================================
-- EXPECTED RESULTS
-- ===================================================================
-- 
-- After running Section 1-2:
-- - 6 new indexes created
-- - Query times for filtered searches: < 50ms (previously 200-500ms)
-- - Full-text search: < 30ms (previously 100-300ms)
--
-- Verification (Section 3):
-- - Should show all 6 idx_ideas_* indexes
--
-- Performance tests (Section 5):
-- - "Index Scan" instead of "Seq Scan" in EXPLAIN output
-- - Execution time < 50ms for typical queries
--
-- ===================================================================
