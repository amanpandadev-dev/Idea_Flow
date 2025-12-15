-- =============================================================================
-- ProSearch Production Enhancement - Database Migration Script
-- =============================================================================
-- This script should be run in pgAdmin Query Tool
-- Execute all sections in order
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: Context Persistence Table
-- -----------------------------------------------------------------------------
-- Creates table for storing conversation context across sessions

CREATE TABLE IF NOT EXISTS prosearch_contexts (
  session_id VARCHAR(255) PRIMARY KEY,
  payload JSONB NOT NULL,  -- Stores full context object
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_prosearch_contexts_updated 
  ON prosearch_contexts(updated_at DESC);

-- Create GIN index on JSONB payload for efficient JSON queries
CREATE INDEX IF NOT EXISTS idx_prosearch_contexts_payload_gin 
  ON prosearch_contexts USING GIN (payload);

-- Add table comment
COMMENT ON TABLE prosearch_contexts IS 'Stores persistent conversation context for ProSearch sessions';
COMMENT ON COLUMN prosearch_contexts.session_id IS 'Unique session identifier (chat session ID or UUID)';
COMMENT ON COLUMN prosearch_contexts.payload IS 'JSON payload containing baseQueryText, cumulativeFilters, lastFinalResultIds, history';

-- -----------------------------------------------------------------------------
-- SECTION 2: Verify Ideas Table Has Required Columns
-- -----------------------------------------------------------------------------
-- Check if ideas table has all columns needed for filter validation

DO $$
BEGIN
    -- Check for code_preference column (tech stack)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ideas' AND column_name = 'code_preference'
    ) THEN
        ALTER TABLE ideas ADD COLUMN code_preference TEXT;
        COMMENT ON COLUMN ideas.code_preference IS 'Technologies/tech stack used in implementation';
    END IF;
    
    -- Check for business_group column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ideas' AND column_name = 'business_group'
    ) THEN
        ALTER TABLE ideas ADD COLUMN business_group TEXT;
        COMMENT ON COLUMN ideas.business_group IS 'Business unit or functional area';
    END IF;
    
    -- Check for challenge_opportunity column (domain)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ideas' AND column_name = 'challenge_opportunity'
    ) THEN
        ALTER TABLE ideas ADD COLUMN challenge_opportunity TEXT;
        COMMENT ON COLUMN ideas.challenge_opportunity IS 'Domain/industry challenge area';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- SECTION 3: Add Indexes for Filter Validation Performance
-- -----------------------------------------------------------------------------
-- These indexes speed up the EXISTS queries used in filter validation

-- Index for techStack validation (code_preference)
CREATE INDEX IF NOT EXISTS idx_ideas_code_preference_trgm 
  ON ideas USING GIN (code_preference gin_trgm_ops);

-- Index for domain validation (challenge_opportunity)
CREATE INDEX IF NOT EXISTS idx_ideas_challenge_opportunity_trgm 
  ON ideas USING GIN (challenge_opportunity gin_trgm_ops);

-- Index for businessGroup validation
CREATE INDEX IF NOT EXISTS idx_ideas_business_group_trgm 
  ON ideas USING GIN (business_group gin_trgm_ops);

-- Note: If you get an error about gin_trgm_ops, you need to enable the extension:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- SECTION 4: Enable Required PostgreSQL Extensions
-- -----------------------------------------------------------------------------

-- Enable trigram extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable btree_gin for combined index types (if needed)
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- -----------------------------------------------------------------------------
-- SECTION 5: Verification Queries
-- -----------------------------------------------------------------------------
-- Run these to verify the migration was successful

-- Check prosearch_contexts table exists
SELECT 
    table_name, 
    (SELECT COUNT(*) FROM prosearch_contexts) as row_count
FROM information_schema.tables 
WHERE table_name = 'prosearch_contexts';

-- Verify indexes were created
SELECT 
    indexname, 
    tablename,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('prosearch_contexts', 'ideas')
  AND indexname LIKE '%prosearch%' OR indexname LIKE '%code_preference%'
ORDER BY tablename, indexname;

-- Check ideas table columns
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'ideas'
  AND column_name IN (
      'code_preference', 
      'business_group', 
      'challenge_opportunity',
      'title',
      'summary',
      'additional_info'
  )
ORDER BY column_name;

-- -----------------------------------------------------------------------------
-- SECTION 6: Sample Data Check
-- -----------------------------------------------------------------------------
-- Verify you have data for filter validation

SELECT 
    COUNT(*) as total_ideas,
    COUNT(CASE WHEN code_preference IS NOT NULL AND code_preference != '' THEN 1 END) as has_tech_stack,
    COUNT(CASE WHEN business_group IS NOT NULL AND business_group != '' THEN 1 END) as has_business_group,
    COUNT(CASE WHEN challenge_opportunity IS NOT NULL AND challenge_opportunity != '' THEN 1 END) as has_domain
FROM ideas;

-- -----------------------------------------------------------------------------
-- SECTION 7: Cleanup Old Test Data (OPTIONAL - ONLY IF NEEDED)
-- -----------------------------------------------------------------------------
-- Uncomment and run if you need to clean up old test sessions

-- DELETE FROM prosearch_contexts WHERE created_at < NOW() - INTERVAL '7 days';

-- =============================================================================
-- END OF MIGRATION SCRIPT
-- =============================================================================
-- 
-- If all queries executed successfully, ProSearch enhancement is ready!
-- Next step: Restart your Node.js server to load the new code changes
-- =============================================================================
