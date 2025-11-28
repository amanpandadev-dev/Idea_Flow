<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/temp/1

## Run Locally

**Prerequisites:**
- Node.js (v18 or higher recommended)
- PostgreSQL database

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Set up your environment:**
   Create a `.env` file in the root of the project and configure the following variables.

3. **Run the backend server:**
   ```bash
   npm run server
   ```
4. **Run the frontend development server:**
   ```bash
   npm run dev
   ```
   Your application will be available at `http://localhost:5173`.

---

## Configuration

The backend requires the following environment variables to be set in a `.env` file:

- `SESSION_SECRET`: A long, random string used to secure user sessions.
  ```
  SESSION_SECRET=your-long-random-secret-string
  ```

- `DATABASE_URL`: The connection string for your PostgreSQL database.
  ```
  DATABASE_URL=postgresql://user:password@localhost:5432/IdeaFlow
  ```

- `OLLAMA_HOST`: The URL for the Ollama instance, used for local Llama embeddings and models.
  ```
  OLLAMA_HOST=http://localhost:11434
  ```

- `TAVILY_API_KEY`: Your API key for Tavily search, used by the agent for web searches.
  ```
  TAVILY_API_KEY=your-tavily-api-key
  ```

- `OPENROUTER_API_KEY`: Your API key for OpenRouter, used for Grok embeddings. Get a **free** key from [https://openrouter.ai/keys](https://openrouter.ai/keys).
  ```
  OPENROUTER_API_KEY=your-openrouter-api-key
  ```

- `EMBEDDING_PROVIDER`: Sets the default embedding provider. Can be `llama` (local) or `grok` (via OpenRouter).
  ```
  EMBEDDING_PROVIDER=llama
  ```

---

## Testing Embedding Providers

### Run the Test Script

Test both embedding providers with a single command:

```bash
node scripts/test-embeddings.js
```

This will validate that both Llama (Ollama) and Grok (OpenRouter) embeddings are working correctly.

### Manual API Testing with curl

**1. Test Document Upload with Grok Embeddings:**

```bash
curl -X POST http://localhost:3001/api/context/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/your/document.pdf" \
  -F "embeddingProvider=grok"
```

**2. Test Document Upload with Llama Embeddings:**

```bash
curl -X POST http://localhost:3001/api/context/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/your/document.pdf" \
  -F "embeddingProvider=llama"
```

**3. Test Agent Query with Grok Embeddings:**

```bash
curl -X POST http://localhost:3001/api/agent/session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userQuery": "What are the latest AI innovations?",
    "embeddingProvider": "grok"
  }'
```

**4. Test Agent Query with Llama Embeddings:**

```bash
curl -X POST http://localhost:3001/api/agent/session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userQuery": "What are the latest AI innovations?",
    "embeddingProvider": "llama"
  }'
```

> **Note:** Replace `YOUR_JWT_TOKEN` with an actual JWT token obtained from the `/api/auth/login` endpoint.

---

## Embedding Provider Details

The system supports two embedding providers:

| Provider | Type | Model | Dimensions | Use Case |
|----------|------|-------|------------|----------|
| **Llama** | Local (Ollama) | `nomic-embed-text` | 768 | Free, private, offline-capable |
| **Grok** | Cloud (OpenRouter) | `sentence-transformers/all-minilm-l6-v2` | 384 | Free tier available, no local setup |

**Important:** Do not mix providers within the same session. The system automatically resets ephemeral context when switching providers to prevent vector dimension mismatches.
