-- Migration: Copy challenge_opportunity data to theme column
-- This ensures the new theme column has the existing data

-- Step 1: Verify current state
SELECT 
    COUNT(*) as total_ideas,
    COUNT(challenge_opportunity) as has_challenge_opp,
    COUNT(theme) as has_theme,
    COUNT(CASE WHEN challenge_opportunity IS NOT NULL AND theme IS NULL THEN 1 END) as needs_migration
FROM ideas;

-- Step 2: Copy data from challenge_opportunity to theme
UPDATE ideas
SET theme = challenge_opportunity
WHERE challenge_opportunity IS NOT NULL
  AND (theme IS NULL OR theme = '');

-- Step 3: Verify migration
SELECT 
    COUNT(*) as total_ideas,
    COUNT(challenge_opportunity) as has_challenge_opp,
    COUNT(theme) as has_theme,
    COUNT(CASE WHEN challenge_opportunity = theme THEN 1 END) as matching_values
FROM ideas;

-- Step 4: Show sample data
SELECT 
    idea_id,
    title,
    challenge_opportunity as old_column,
    theme as new_column,
    CASE 
        WHEN challenge_opportunity = theme THEN '✓ Match'
        ELSE '✗ Different'
    END as status
FROM ideas
LIMIT 10;
