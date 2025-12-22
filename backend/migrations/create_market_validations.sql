-- Market Validation Reports Table
-- Purpose: Store AI-generated market validation reports for ideas
-- Run in pgAdmin: psql -U postgres -d ideaflow -f backend/migrations/create_market_validations.sql

CREATE TABLE IF NOT EXISTS market_validations (
    id SERIAL PRIMARY KEY,
    idea_id INTEGER NOT NULL,
    report JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(50),
    
    -- Report metadata
    generated_at TIMESTAMP NOT NULL,
    novelty_score DECIMAL(3,2),
    patent_risk_level VARCHAR(10),
    
    -- Indexes for performance
    CONSTRAINT fk_idea FOREIGN KEY (idea_id) REFERENCES ideas(idea_id) ON DELETE CASCADE
);

-- Index for fast lookups by idea
CREATE INDEX IF NOT EXISTS idx_market_validations_idea_id ON market_validations(idea_id);

-- Index for recent reports
CREATE INDEX IF NOT EXISTS idx_market_validations_created_at ON market_validations(created_at DESC);

-- Comments
COMMENT ON TABLE market_validations IS 'Stores AI-generated market validation reports for innovation ideas';
COMMENT ON COLUMN market_validations.report IS 'Full JSON report with all sections (internal, external, competitors, risks, opportunities)';
COMMENT ON COLUMN market_validations.novelty_score IS 'Internal novelty score from 0.00 to 1.00';
COMMENT ON COLUMN market_validations.patent_risk_level IS 'Low, Medium, or High';