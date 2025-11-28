# How to Access AI Agent Features

## Current Status

✅ **Backend is Ready!**
- All Phase-2 backend files refactored for Node.js v24
- Server running on port 5173
- API endpoints ready: `/api/agent/query`, `/api/context/upload`, `/api/context/reset`

⚠️ **Frontend Integration Needed**

The AI Agent tab needs to be added to the frontend. Here's how to access the features:

## Option 1: Direct API Testing (Immediate)

You can test the AI Agent features right now using API calls:

### 1. Query the Agent
```powershell
$body = @{
    userQuery = "What are the top AI ideas in our repository?"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/agent/query" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body `
    -Headers @{Authorization = "Bearer YOUR_TOKEN"}
```

### 2. Upload a Document for Context
```powershell
$file = "C:\path\to\your\document.pdf"
$form = @{
    document = Get-Item $file
}

Invoke-RestMethod -Uri "http://localhost:3001/api/context/upload" `
    -Method POST `
    -Form $form `
    -Headers @{Authorization = "Bearer YOUR_TOKEN"}
```

### 3. Check Context Status
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/context/status" `
    -Headers @{Authorization = "Bearer YOUR_TOKEN"}
```

### 4. Reset Context
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/context/reset" `
    -Method DELETE `
    -Headers @{Authorization = "Bearer YOUR_TOKEN"}
```

## Option 2: Add AI Agent Tab to Frontend

To add the visual interface, add these 3 small sections to `App.tsx`:

### 1. Add Import (line ~17)
```typescript
import { X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3, Bot } from 'lucide-react';
import AgentChat from './components/AgentChat';
```

### 2. Add Tab Button (after line ~283)
```typescript
<button 
  onClick={() => setActiveTab('agent-chat')}
  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
    activeTab === 'agent-chat' 
      ? 'bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200' 
      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
  }`}
>
  <Bot className="h-4 w-4" />
  AI Agent
</button>
```

### 3. Add View Rendering (after line ~359)
```typescript
{/* AI Agent Chat View */}
{activeTab === 'agent-chat' && (
  <AgentChat />
)}
```

## Features Available

Once integrated, you'll have access to:

### 1. **AI Agent Chat Interface**
- Natural language queries about your idea repository
- Combines internal database search with external web search
- Intelligent synthesis of results

### 2. **Document Upload**
- Upload PDF or DOCX files
- Automatically extracts and chunks text
- Creates embeddings for semantic search
- Session-scoped ephemeral context

### 3. **Smart Search**
- Searches both uploaded documents and idea database
- Semantic similarity matching
- Relevance scoring

### 4. **Citations**
- Internal citations (IDEA-XXX references)
- External citations (web sources with URLs)
- Reasoning trace showing agent's thought process

### 5. **Context Management**
- View uploaded document status
- See chunk count and themes
- Reset context to start fresh

## Example Queries

Try these queries once the UI is integrated:

1. **"What are the most innovative AI ideas we have?"**
2. **"Find ideas related to machine learning and automation"**
3. **"Which teams are working on cloud infrastructure?"**
4. **"Show me ideas with high scores in the healthcare domain"**
5. **Upload a PDF about blockchain, then ask: "How do our ideas relate to this document?"**

## Next Steps

1. Add the 3 code sections to `App.tsx` (takes ~2 minutes)
2. Refresh your browser
3. Click the "AI Agent" tab
4. Start querying!

The backend is fully functional and waiting for frontend integration! 🚀
