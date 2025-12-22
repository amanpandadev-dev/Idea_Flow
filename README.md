# Idea Flow - AI-Powered Innovation Insights Portal

Enterprise innovation management system with semantic search, AI agent assistance, and market validation.

## 🚀 Tech Stack

- **Frontend**: React 18, TypeScript, React Router, TailwindCSS
- **Backend**: Node.js, Express, PostgreSQL
- **AI/ML**: Ollama (Llama3, TinyLlama), ChromaDB
- **APIs**: Tavily Search API

---

## 📋 Prerequisites

- **Node.js**: v20+ (tested on v24.11.0)
- **PostgreSQL**: v14+
- **Python**: 3.13+ (for ChromaDB)
- **Ollama**: Latest version

---

## 🛠️ Installation & Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd Idea_Flow
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install
```

### 3. Set Up PostgreSQL Database

```bash
# Create database
psql -U postgres -c "CREATE DATABASE ideaflow;"

# Run all migrations
psql -U postgres -d ideaflow -f backend/migrations/RUN_ALL_MIGRATIONS.sql
```

### 4. Install Ollama Models

```bash
# Install Llama3 (for embeddings and chat)
ollama pull llama3

# Install TinyLlama (for market validation - faster)
ollama pull tinyllama

# Install Nomic Embed (alternative embedding model)
ollama pull nomic-embed-text

# Verify installation
ollama list
```

### 5. Configure Environment Variables

Create `.env` file in root directory:

```bash
# Database
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ideaflow

# Ollama
OLLAMA_BASE_URL=http://localhost:11434

# Tavily API (for market validation)
TAVILY_API_KEY=your_tavily_api_key

# Vector Store
VECTOR_STORE_TTL_HOURS=24
VECTOR_CLEANUP_INTERVAL_MINS=60

# Server
PORT=3001
```

---

## 🎯 Running the Project

### Start All Services

```bash
# Terminal 1: Start Ollama (if not already running)
ollama serve

# Terminal 2: Start Backend Server
npm run server

# Terminal 3: Start Frontend Dev Server
npm run dev
```

### Access Application

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **Ollama**: http://localhost:11434

---

## 🗄️ ChromaDB Indexing

### Auto-Indexing (Recommended)

The server **automatically indexes** all ideas from PostgreSQL to ChromaDB on startup:

```bash
npm run server
```

You'll see logs like:
```
[ChromaDB] Checking if ideas_collection exists...
[Ideas] Fetching all ideas from PostgreSQL
[Ideas] Fetched 5000 ideas
-> Generating embeddings using Ollama...
✅ Indexed 5000 ideas to ChromaDB
```

**⏱️ First Run**: Takes 5-10 minutes (generating 5000 embeddings)  
**Subsequent Runs**: Instant (loads from `chroma_data/` folder)

### Manual Indexing Commands

If you need to **re-index** or **force a fresh index**:

#### Delete ChromaDB Data and Re-index

```bash
# Stop server first (Ctrl+C)

# Delete existing ChromaDB data
rm -rf chroma_data
# Windows: rmdir /s /q chroma_data

# Restart server (auto-indexes)
npm run server
```

#### Index ProSearch Collection (ideas_search)

```bash
# Run ProSearch indexing script
node backend/scripts/verifyAndReindexIdeas.js
node backend/scripts/reindex-chromadb-llama.js
```

---

## 📊 Database Migrations

### Run All Migrations

```bash
psql -U postgres -d ideaflow -f backend/migrations/RUN_ALL_MIGRATIONS.sql
```

### Run Individual Migrations

```bash
# Create anonymous user
psql -U postgres -d ideaflow -f backend/migrations/create_anonymous_user.sql

# Create conversation tables
psql -U postgres -d ideaflow -f backend/migrations/create_conversation_search_state.sql

# Create market validation tables
psql -U postgres -d ideaflow -f backend/migrations/create_market_validations.sql

# Create embedding cache
psql -U postgres -d ideaflow -f backend/migrations/create_chunk_embeddings_cache.sql
```

### Verify Database Schema

```bash
# Check tables
psql -U postgres -d ideaflow -c "\dt"

# Check ideas table structure
psql -U postgres -d ideaflow -c "\d ideas"
```

---

## 🤖 Ollama Model Management

### Pull Models

```bash
# Llama3 (4.7 GB) - Main model
ollama pull llama3

# TinyLlama (637 MB) - Fast model for synthesis
ollama pull tinyllama

# Nomic Embed (274 MB) - Lightweight embeddings
ollama pull nomic-embed-text
```

### Test Models

```bash
# Test Llama3
ollama run llama3 "What is machine learning?"

# Test TinyLlama
ollama run tinyllama "Hello world"

# Test embedding generation
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "AI innovation"
}'
```

### List Installed Models

```bash
ollama list
```

### Remove Models (Free Space)

```bash
ollama rm tinyllama
ollama rm llama3
```

---

## 🧪 Testing & Verification

### Test ChromaDB Connection

```bash
node backend/scripts/testSemanticSearch.js
```

### Verify Ollama Connection

```bash
curl -s http://localhost:11434/api/tags
```

### Test Database Connection

```bash
psql -U postgres -d ideaflow -c "SELECT COUNT(*) FROM ideas;"
```

---

## 🔑 Key Features

### 1. **ProSearch** (Semantic Search)
- Natural language queries
- ChromaDB vector similarity search
- Conversation persistence
- Filter-based refinement

### 2. **Agent Tab**
- Document upload for context
- AI-generated suggested questions
- Similar ideas discovery
- Chat with Llama3

### 3. **Market Validation**
- Internal novelty analysis (ChromaDB)
- External market intelligence (Tavily API)
- Competitor landscape mapping
- Patent/IP risk signals
- LLM-synthesized reports

### 4. **Idea Management**
- Browse and filter 5000+ ideas
- Team collaboration
- Skill/theme-based search

---

## 📂 Project Structure

```
Idea_Flow/
├── backend/
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic
│   ├── migrations/      # SQL schema files
│   ├── scripts/         # Utility scripts
│   └── config/          # Ollama, ChromaDB config
├── components/          # React components
├── chroma_data/         # ChromaDB persistent storage
├── .env                 # Environment variables
├── server.js            # Backend entry point
└── README.md            # This file
```

---

## 🐛 Troubleshooting

### ChromaDB Collection Not Found

```bash
# Delete and re-index
rm -rf chroma_data
npm run server
```

### Ollama Connection Failed

```bash
# Start Ollama service
ollama serve

# Verify it's running
curl http://localhost:11434/api/tags
```

### PostgreSQL Connection Error

```bash
# Check PostgreSQL is running
pg_isready

# Verify database exists
psql -U postgres -l | grep ideaflow
```

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001  # Mac/Linux
netstat -ano | findstr :3001  # Windows

# Kill process or change PORT in .env
```

---

## 🚀 Quick Start Summary

```bash
# 1. Install Ollama models
ollama pull llama3
ollama pull tinyllama

# 2. Create database
psql -U postgres -c "CREATE DATABASE ideaflow;"
psql -U postgres -d ideaflow -f backend/migrations/RUN_ALL_MIGRATIONS.sql

# 3. Configure .env
# (Copy .env.example and fill in values)

# 4. Start services
ollama serve              # Terminal 1
npm run server            # Terminal 2 (auto-indexes ChromaDB)
npm run dev               # Terminal 3

# 5. Open browser
http://localhost:5173
```

---

## 📝 Notes

- **First startup** takes 5-10 minutes for ChromaDB indexing
- **ChromaDB data** persists in `chroma_data/` folder
- **Two collections**: `ideas_collection` (Agent) and `ideas_search` (ProSearch)
- **Tavily API** required for market validation feature

---

## 📧 Support

For issues or questions, check the logs:
- Backend: Terminal running `npm run server`
- Frontend: Terminal running `npm run dev`
- ChromaDB: Look for `[ChromaDB]` prefixed logs
- Ollama: `ollama logs` or service logs
