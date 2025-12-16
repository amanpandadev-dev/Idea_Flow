-- Create anonymous user entry to allow conversation persistence
-- This fixes: "violates foreign key constraint fk_user" error

-- Insert anonymous user if not exists
INSERT INTO users (emp_id, name, email, password_hash, created_at)
VALUES ('anonymous', 'Anonymous User', 'anonymous@system.local', 'no-password-required', CURRENT_TIMESTAMP)
ON CONFLICT (emp_id) DO NOTHING;

-- Verify the user was created
SELECT emp_id, name, email FROM users WHERE emp_id = 'anonymous';
