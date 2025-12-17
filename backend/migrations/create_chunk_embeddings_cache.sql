-- Migration: Create chunk embeddings cache table
-- Enables deduplication of embeddings for identical content

CREATE TABLE IF NOT EXISTS chunk_embeddings (
    id SERIAL PRIMARY KEY,
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding JSONB NOT NULL,
    embedding_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed_at TIMESTAMP DEFAULT NOW(),
    access_count INTEGER DEFAULT 1
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_hash ON chunk_embeddings(content_hash);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_provider ON chunk_embeddings(embedding_provider);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_created ON chunk_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_accessed ON chunk_embeddings(last_accessed_at DESC);

-- Comments for documentation
COMMENT ON TABLE chunk_embeddings IS 'Content-addressable cache for chunk embeddings to avoid re-generating identical embeddings';
COMMENT ON COLUMN chunk_embeddings.content_hash IS 'SHA-256 hash of chunk text for deduplication';
COMMENT ON COLUMN chunk_embeddings.chunk_text IS 'Original chunk text (for debugging)';
COMMENT ON COLUMN chunk_embeddings.embedding IS '768-dimensional vector from nomic-embed-text stored as JSONB array';
COMMENT ON COLUMN chunk_embeddings.embedding_provider IS 'Provider used (llama, grok, gemini)';
COMMENT ON COLUMN chunk_embeddings.access_count IS 'Number of times this embedding was reused';

-- Function to update access timestamp
CREATE OR REPLACE FUNCTION update_embedding_access()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed_at = NOW();
    NEW.access_count = OLD.access_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ chunk_embeddings table created successfully';
    RAISE NOTICE '📊 Table ready for embedding deduplication';
END $$;
