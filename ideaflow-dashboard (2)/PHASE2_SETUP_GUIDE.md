# IdeaFlow Phase-2 Setup Guide

## Prerequisites

Before setting up Phase-2, ensure you have:

- ✅ Node.js v24.11.0 or higher
- ✅ Python 3.13.9 or higher
- ✅ PostgreSQL running with IdeaFlow database
- ✅ 8GB+ RAM (for running Ollama models)
- ✅ Windows OS (current setup)

---

## Step 1: Install Ollama

### Download and Install

1. Visit [https://ollama.com/download](https://ollama.com/download)
2. Download Ollama for Windows (v0.13.0 or later)
3. Run the installer
4. Verify installation:
   ```powershell
   ollama --version
   ```

### Download Required Models

```powershell
# Reasoning model (for agent logic)
ollama pull llama3.1

# Embedding model (for vector search)
ollama pull nomic-embed-text
```

**Note:** These downloads may take 10-20 minutes depending on your internet speed.

### Verify Ollama is Running

```powershell
ollama list
```

You should see both `llama3.1` and `nomic-embed-text` in the list.

---

## Step 2: Get Tavily API Key

1. Visit [https://tavily.com](https://tavily.com)
2. Sign up for a free account
3. Navigate to API Keys section
4. Copy your API key (starts with `tvly-`)

---

## Step 3: Update Environment Variables

Open `.env` file in your project root and verify/update:

```env
DATABASE_URL=postgres://postgres:Vamsi123.@localhost:5432/IdeaFlow
JWT_SECRET=supersecretkey123

# Phase-2: Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_REASONING_MODEL=llama3.1
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Phase-2: Tavily API
TAVILY_API_KEY=tvly-YOUR_API_KEY_HERE

# Phase-2: Session Management
SESSION_SECRET=ideaflow-session-secret-change-in-production
```

**IMPORTANT:** Replace `tvly-YOUR_API_KEY_HERE` with your actual Tavily API key.

---

## Step 4: Install Dependencies

The dependencies have already been added to `package.json`. Install them:

```powershell
npm install
```

This will install:
- `ollama` - Ollama JavaScript client
- `chromadb` - Vector database
- `langchain` + `@langchain/*` - Agent framework
- `@tavily/core` - Web search API
- `pdf-parse`, `mammoth` - Document processing
- `express-session`, `multer` - Session and file upload

---

## Step 5: Integrate Frontend Component

Follow the instructions in `APP_INTEGRATION_GUIDE.md` to integrate the AgentChat component into `App.tsx`.

**Quick Summary:**
1. Add `import AgentChat from './components/AgentChat';`
2. Add `Bot` to lucide-react imports
3. Update `TabType` to include `'agent-chat'`
4. Add AI Agent tab button
5. Add Agent Chat view section

---

## Step 6: Start the Application

### Start Backend

```powershell
npm run server
```

You should see:
```
🚀 Initializing Phase-2 Services...
✅ Ollama connected successfully
   Available models: llama3.1, nomic-embed-text
✅ ChromaDB initialized successfully
✅ Phase-2 services initialized

Server running on port 3001
```

### Start Frontend (in new terminal)

```powershell
npm run dev
```

### Or Start Both Together

```powershell
npm start
```

---

## Step 7: Test the New Features

### Test 1: Basic Agent Query

1. Navigate to the "AI Agent" tab
2. Try this query: `"What AI innovations do we have for healthcare?"`
3. Verify you get a response with:
   - Answer synthesizing internal and external sources
   - Internal citations (from your idea repository)
   - External citations (from Tavily web search)
   - Processing time displayed

### Test 2: Document Upload

1. In the "AI Agent" tab, find the "Document Context" section
2. Upload a PDF or DOCX file (max 10MB)
3. Verify:
   - Upload progress shown
   - Success message with chunk count
   - Extracted themes displayed
4. Ask a question related to the document
5. Verify the response indicates "Response includes context from your uploaded document"

### Test 3: Context Reset

1. After uploading a document, click "Reset" button
2. Verify context is cleared
3. Ask another question and verify it no longer uses document context

### Test 4: Citation Navigation

1. Ask a query that returns internal citations
2. Click on an internal citation
3. Verify it navigates to the idea details page

---

## Troubleshooting

### Ollama Not Found

**Error:** `Ollama connection failed`

**Solution:**
1. Ensure Ollama is installed and running
2. Check `OLLAMA_BASE_URL` in `.env` is correct
3. Restart Ollama service

### Models Not Downloaded

**Error:** `Reasoning model 'llama3.1' not found`

**Solution:**
```powershell
ollama pull llama3.1
ollama pull nomic-embed-text
```

### Tavily API Error

**Error:** `External search unavailable: API key not configured`

**Solution:**
1. Verify `TAVILY_API_KEY` in `.env` is set correctly
2. Check API key is valid at [tavily.com](https://tavily.com)

### File Upload Fails

**Error:** `Only PDF and DOCX files are supported`

**Solution:**
- Ensure file is PDF or DOCX format
- Check file size is under 10MB

### Session Issues

**Error:** `No active session`

**Solution:**
- Clear browser cookies
- Restart the backend server
- Check `SESSION_SECRET` is set in `.env`

---

## Architecture Overview

### Backend Structure

```
backend/
├── config/
│   ├── ollama.js          # Ollama client configuration
│   └── chroma.js          # ChromaDB initialization
├── services/
│   ├── embeddingService.js    # Generate embeddings
│   ├── vectorStoreService.js  # Manage ephemeral collections
│   ├── documentService.js     # PDF/DOCX processing
│   └── queryAnonymizer.js     # Remove internal references
├── agents/
│   ├── reactAgent.js          # ReAct agent orchestration
│   ├── responseFormatter.js   # Format agent responses
│   └── tools/
│       ├── tavilyTool.js      # External web search
│       └── internalRAGTool.js # Internal idea search
└── routes/
    ├── agentRoutes.js         # POST /api/agent/query
    └── contextRoutes.js       # POST /api/context/upload, DELETE /api/context/reset
```

### Frontend Components

```
components/
├── AgentChat.tsx          # Main chat interface
├── DocumentUpload.tsx     # File upload with drag-and-drop
└── CitationDisplay.tsx    # Tabbed citation viewer
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/agent/query` | Execute agent query with optional filters |
| POST | `/api/context/upload` | Upload PDF/DOCX for ephemeral context |
| DELETE | `/api/context/reset` | Clear ephemeral context for session |
| GET | `/api/context/status` | Get current context status |

---

## Performance Notes

- **First Query:** May take 10-15 seconds (model loading)
- **Subsequent Queries:** 3-8 seconds
- **Document Upload:** 5-10 seconds for typical documents
- **Embedding Generation:** ~1 second per 10 chunks

---

## Security Considerations

1. **Query Anonymization:** All queries to Tavily are anonymized (idea IDs, employee IDs, emails removed)
2. **Session Isolation:** Each user's ephemeral context is session-scoped
3. **API Key Security:** Tavily API key stored in `.env` (never exposed to frontend)
4. **File Validation:** Only PDF/DOCX files accepted, 10MB limit enforced

---

## Next Steps

1. ✅ Complete App.tsx integration (see `APP_INTEGRATION_GUIDE.md`)
2. ✅ Test all features
3. ✅ Customize example questions in AgentChat component
4. ✅ Adjust model parameters in `backend/config/ollama.js` if needed
5. ✅ Monitor performance and adjust chunk sizes in `documentService.js`

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review implementation plan: `implementation_plan.md`
3. Check backend logs for detailed error messages
4. Verify all environment variables are set correctly

---

**Phase-2 Setup Complete! 🎉**

You now have a fully functional AI agent with:
- ✅ Agentic RAG (internal + external search)
- ✅ Ephemeral context memory (document upload)
- ✅ Citation tracking
- ✅ Query anonymization
- ✅ Session management
