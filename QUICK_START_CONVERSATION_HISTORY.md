# Quick Start: Agent Search History

## 🚀 Get Started in 3 Steps

### Step 1: Run Database Migration

```bash
node backend/scripts/runMigration.js up 001_create_conversations.sql
```

**Expected Output:**
```
🗄️  Database Migration Runner
📊 Database: localhost:5432/IdeaFlow
🎯 Action: Apply
📝 Migration: 001_create_conversations.sql

✅ Database connected: 2024-01-15T10:30:00.000Z
📄 Reading migration: 001_create_conversations.sql
🚀 Executing migration...
✅ Migration completed successfully!

✨ All done!
```

### Step 2: Restart Your Server

```bash
npm run dev
```

**Look for:**
```
✅ Database connected successfully
🚀 Server running on port 3001
```

### Step 3: Test the API

**Get your JWT token** (login first):
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emp_id": "your_emp_id", "password": "your_password"}'
```

**List conversations:**
```bash
curl http://localhost:3001/api/conversations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "conversations": [],
  "total": 0,
  "limit": 50,
  "offset": 0,
  "hasMore": false
}
```

## ✅ That's It!

Your conversation history system is now running. Every time you use the agent, conversations will be automatically saved.

## 📖 Common Operations

### Create a Conversation Manually

```bash
curl -X POST http://localhost:3001/api/conversations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Conversation",
    "tags": ["test"],
    "embeddingProvider": "llama"
  }'
```

### Add a Message

```bash
curl -X POST http://localhost:3001/api/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "user",
    "content": "Hello, how can you help me?"
  }'
```

### Search Conversations

```bash
curl "http://localhost:3001/api/conversations/search/query?q=supply+chain" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Statistics

```bash
curl http://localhost:3001/api/conversations/stats/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Export a Conversation

**As JSON:**
```bash
curl "http://localhost:3001/api/conversations/CONVERSATION_ID/export?format=json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o conversation.json
```

**As Markdown:**
```bash
curl "http://localhost:3001/api/conversations/CONVERSATION_ID/export?format=markdown" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o conversation.md
```

## 🔍 Verify It's Working

### Check Database Tables

```bash
psql -d IdeaFlow -c "\dt conversations*"
```

**Expected:**
```
                    List of relations
 Schema |         Name          | Type  |  Owner   
--------+-----------------------+-------+----------
 public | conversation_messages | table | postgres
 public | conversations         | table | postgres
```

### Check Conversation Count

```bash
psql -d IdeaFlow -c "SELECT COUNT(*) FROM conversations;"
```

### View Recent Conversations

```bash
psql -d IdeaFlow -c "SELECT id, title, created_at FROM conversations ORDER BY created_at DESC LIMIT 5;"
```

## 🐛 Troubleshooting

### Migration Fails

**Error:** `relation "users" does not exist`

**Solution:** The conversations table has a foreign key to the users table. Ensure your users table exists first.

### No Conversations Showing

**Check:**
1. Are you using the correct JWT token?
2. Does the token contain the correct `emp_id`?
3. Have you actually created any conversations?

**Debug:**
```bash
# Check if conversations exist in database
psql -d IdeaFlow -c "SELECT * FROM conversations;"

# Check if your user exists
psql -d IdeaFlow -c "SELECT emp_id FROM users;"
```

### Agent Not Saving Conversations

**Issue:** Agent integration uses `userId = 'system'` by default.

**Fix:** Update `backend/agents/reactAgent.js` line ~160:
```javascript
// Change this:
const userId = 'system';

// To this (requires passing user context to agent):
const userId = req.user?.user?.emp_id || 'system';
```

## 📚 Full Documentation

- **Implementation Details:** `AGENT_SEARCH_HISTORY_IMPLEMENTATION.md`
- **Spec Documents:** `.kiro/specs/agent-search-history/`
- **API Reference:** See implementation doc for all endpoints

## 🎉 Success!

You now have a fully functional conversation history system. All agent interactions will be automatically saved and can be searched, exported, and analyzed.

**Next Steps:**
- Build a frontend UI to display conversations
- Add property-based tests
- Implement caching for better performance
- Add rate limiting for security
