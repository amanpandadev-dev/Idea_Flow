CREATE TABLE IF NOT EXISTS public.search_history (
  id SERIAL PRIMARY KEY,
  user_emp_id VARCHAR(64),
  query TEXT NOT NULL,
  embedding_provider VARCHAR(32),
  session_id VARCHAR(128),
  result_ids JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
