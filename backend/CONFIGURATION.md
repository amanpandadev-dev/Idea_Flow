# Configuration Guide

## Environment Variables

### Required Variables

#### Database
- `DATABASE_URL`: PostgreSQL connection string
  - Format: `postgresql://username:password@localhost:5432/IdeaFlow`
  - Required for all database operations

#### Security
- `JWT_SECRET`: Secret key for JWT token signing (minimum 32 characters)
- `REFRESH_SECRET`: Secret key for refresh token signing (minimum 32 characters)
- `SESSION_SECRET`: Secret key for session management (minimum 32 characters)
- **IMPORTANT**: Generate strong random strings for production using:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### AI Services

#### Google Gemini (Recommended)
- `API_KEY`: Google Generative AI API key
  - Get your key from: https://makersuite.google.com/app/apikey
  - Used for:
    - Text embeddings (text-embedding-004 model)
    - Document theme extraction
    - Question generation
    - Agent response synthesis
  - **Default provider**: Set `EMBEDDING_PROVIDER=gemini`

#### Ollama (Local Fallback)
- `OLLAMA_HOST`: Ollama server URL (default: `http://localhost:11434`)
  - Used when Gemini is unavailable
  - Requires local Ollama installation
  - Models used: llama3.2, nomic-embed-text

#### OpenRouter (Alternative)
- `OPENROUTER_API_KEY`: OpenRouter API key
  - Optional alternative for embeddings
  - Set `EMBEDDING_PROVIDER=grok` to use

### External Services

#### Tavily Search
- `TAVILY_API_KEY`: Tavily API key for web search
  - Get your key from: https://tavily.com
  - Used for external web search in agent Q&A

### Application Settings

- `EMBEDDING_PROVIDER`: Choose embedding provider
  - Options: `gemini` (recommended), `llama`, `grok`
  - Default: `gemini`
  
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment mode
  - Options: `development`, `production`
  - Affects logging, error messages, and security settings

## Production Checklist

### Security
- [ ] Generate strong random secrets for JWT_SECRET, REFRESH_SECRET, SESSION_SECRET
- [ ] Set NODE_ENV=production
- [ ] Enable SSL for database connection
- [ ] Configure CORS for production domain
- [ ] Protect API keys in error messages

### Database
- [ ] Set up PostgreSQL with proper user permissions
- [ ] Configure connection pooling (max: 20 connections)
- [ ] Set up database backups
- [ ] Create indexes on frequently queried columns

### AI Services
- [ ] Obtain production API key for Google Gemini
- [ ] Set up API usage monitoring
- [ ] Configure rate limiting
- [ ] Set up fallback providers

### ChromaDB
- [ ] Ensure ideas_collection is created on startup
- [ ] Run migration script to index existing ideas:
  ```bash
  node backend/scripts/migrateIdeasToChroma.js
  ```

### Monitoring
- [ ] Set up error tracking
- [ ] Configure performance monitoring
- [ ] Set up API usage alerts
- [ ] Monitor database connection pool

## Configuration Examples

### Development Setup
```env
DATABASE_URL=postgresql://localhost:5432/ideaflow_dev
API_KEY=your-gemini-api-key
EMBEDDING_PROVIDER=gemini
TAVILY_API_KEY=your-tavily-key
JWT_SECRET=dev-secret-min-32-chars
REFRESH_SECRET=dev-refresh-min-32-chars
SESSION_SECRET=dev-session-min-32-chars
PORT=3001
NODE_ENV=development
```

### Production Setup
```env
DATABASE_URL=postgresql://user:pass@prod-db:5432/ideaflow?ssl=true
API_KEY=prod-gemini-api-key
EMBEDDING_PROVIDER=gemini
TAVILY_API_KEY=prod-tavily-key
JWT_SECRET=<generated-32-char-secret>
REFRESH_SECRET=<generated-32-char-secret>
SESSION_SECRET=<generated-32-char-secret>
PORT=3001
NODE_ENV=production
```

## Embedding Provider Comparison

| Provider | Speed | Quality | Cost | Availability |
|----------|-------|---------|------|--------------|
| Gemini   | Fast  | High    | Free tier available | Cloud |
| Llama    | Medium | Good   | Free | Local |
| Grok     | Fast  | High    | Paid | Cloud |

**Recommendation**: Use Gemini for production with Ollama as fallback.

## Troubleshooting

### "API_KEY not configured"
- Ensure API_KEY is set in .env file
- Verify the key is valid at https://makersuite.google.com
- Check that .env file is in the project root

### "Database connection failed"
- Verify DATABASE_URL format
- Check database server is running
- Ensure user has proper permissions
- Test connection with: `psql $DATABASE_URL`

### "Vector store not initialized"
- ChromaDB initializes automatically on server start
- Check server logs for initialization errors
- Verify sufficient disk space for vector storage

### "Embedding dimension mismatch"
- Occurs when switching providers with existing context
- Solution: Reset context or use consistent provider
- System automatically resets context on provider switch

## Migration Guide

### From Ollama to Gemini

1. Obtain Gemini API key
2. Update .env:
   ```env
   API_KEY=your-gemini-key
   EMBEDDING_PROVIDER=gemini
   ```
3. Restart server
4. Re-index existing ideas:
   ```bash
   node backend/scripts/migrateIdeasToChroma.js
   ```
5. Existing user contexts will auto-reset on provider switch

### Scaling Considerations

- **Multiple Server Instances**: Replace in-memory session manager with Redis
- **High Volume**: Implement request queuing for embedding generation
- **Large Datasets**: Consider batch processing during off-peak hours
- **Global Deployment**: Use regional database replicas
