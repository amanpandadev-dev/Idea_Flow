# pgAdmin Setup Instructions

## 📋 Step-by-Step Guide

### Step 1: Open pgAdmin

1. Launch **pgAdmin 4**
2. Connect to your PostgreSQL server
3. Navigate to your **IdeaFlow** database

### Step 2: Open Query Tool

1. Right-click on **IdeaFlow** database
2. Select **Query Tool** from the menu
3. A new query window will open

### Step 3: Run the Setup Script

1. Open the file `PGADMIN_SETUP.sql` in a text editor
2. **Copy all the SQL code** (Ctrl+A, Ctrl+C)
3. **Paste into pgAdmin Query Tool** (Ctrl+V)
4. Click the **Execute/Run** button (▶️) or press **F5**

### Step 4: Verify Success

You should see output like:

```
Query returned successfully in XXX msec.

NOTICE:  ✅ Agent Search History schema created successfully!
NOTICE:  📊 Tables: conversations, conversation_messages
NOTICE:  🔍 Indexes: 7 indexes created
NOTICE:  ⚡ Triggers: 2 triggers created
NOTICE:  🚀 Ready to use!
```

### Step 5: Verify Tables Created

Run this query to check:

```sql
SELECT tablename FROM pg_tables 
WHERE tablename IN ('conversations', 'conversation_messages');
```

**Expected Result:**
```
tablename
-----------------------
conversations
conversation_messages
```

### Step 6: Check Table Structure

**For conversations table:**
```sql
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'conversations'
ORDER BY ordinal_position;
```

**For conversation_messages table:**
```sql
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'conversation_messages'
ORDER BY ordinal_position;
```

## 🎯 Quick Test

### Insert a Test Conversation

```sql
-- Insert test conversation
INSERT INTO conversations (user_id, title, tags, embedding_provider)
VALUES ('test_user', 'Test Conversation', ARRAY['test', 'demo'], 'llama')
RETURNING *;
```

### Insert a Test Message

```sql
-- Get the conversation ID from previous query, then:
INSERT INTO conversation_messages (conversation_id, role, content)
VALUES ('YOUR_CONVERSATION_ID_HERE', 'user', 'Hello, this is a test message')
RETURNING *;
```

### Verify Message Count Updated

```sql
-- Check that message_count was auto-incremented
SELECT id, title, message_count, updated_at 
FROM conversations 
WHERE user_id = 'test_user';
```

**Expected:** `message_count` should be `1`

### Clean Up Test Data

```sql
-- Delete test conversation (messages will be deleted automatically)
DELETE FROM conversations WHERE user_id = 'test_user';
```

## 🔍 Useful Queries

### View All Conversations

```sql
SELECT 
    id,
    user_id,
    title,
    array_length(tags, 1) as tag_count,
    message_count,
    created_at,
    updated_at
FROM conversations
ORDER BY created_at DESC
LIMIT 10;
```

### View All Messages for a Conversation

```sql
SELECT 
    id,
    role,
    LEFT(content, 100) as content_preview,
    timestamp
FROM conversation_messages
WHERE conversation_id = 'YOUR_CONVERSATION_ID'
ORDER BY timestamp ASC;
```

### Search Conversations

```sql
SELECT 
    c.id,
    c.title,
    m.content,
    m.timestamp
FROM conversations c
JOIN conversation_messages m ON c.id = m.conversation_id
WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', 'your search term')
ORDER BY m.timestamp DESC;
```

### Get User Statistics

```sql
SELECT 
    user_id,
    COUNT(*) as total_conversations,
    SUM(message_count) as total_messages,
    AVG(message_count) as avg_messages_per_conversation,
    MIN(created_at) as first_conversation,
    MAX(updated_at) as last_activity
FROM conversations
GROUP BY user_id;
```

## 🐛 Troubleshooting

### Error: relation "users" does not exist

**Problem:** The foreign key constraint requires a `users` table.

**Solution 1 - Remove Foreign Key (if users table doesn't exist):**
```sql
ALTER TABLE conversations 
DROP CONSTRAINT IF EXISTS fk_user;
```

**Solution 2 - Create users table first:**
```sql
CREATE TABLE IF NOT EXISTS users (
    emp_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Error: function gen_random_uuid() does not exist

**Problem:** UUID extension not enabled.

**Solution:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- OR
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### Error: permission denied

**Problem:** User doesn't have CREATE privileges.

**Solution:** Connect as superuser or database owner, or grant privileges:
```sql
GRANT CREATE ON DATABASE IdeaFlow TO your_username;
```

## ✅ Verification Checklist

After running the setup, verify:

- [ ] `conversations` table exists
- [ ] `conversation_messages` table exists
- [ ] 7 indexes created
- [ ] 2 triggers created
- [ ] 2 trigger functions created
- [ ] Foreign key constraints in place
- [ ] Test insert works
- [ ] Message count auto-increments
- [ ] Cascade delete works

## 🎉 Success!

Once all checks pass, your database is ready. Restart your Node.js server and the conversation history feature will be fully functional!

## 📚 Next Steps

1. Restart your server: `npm run dev`
2. Test the API endpoints (see `QUICK_START_CONVERSATION_HISTORY.md`)
3. Use the agent - conversations will auto-save
4. View saved conversations in pgAdmin

## 🔗 Related Files

- `PGADMIN_SETUP.sql` - The SQL script to run
- `QUICK_START_CONVERSATION_HISTORY.md` - API usage guide
- `AGENT_SEARCH_HISTORY_IMPLEMENTATION.md` - Full documentation
