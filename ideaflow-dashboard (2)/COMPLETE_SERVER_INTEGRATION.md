# Complete Server.js Integration - Copy & Paste

The AI Agent tab is working in your frontend! Now we just need to connect the backend API routes.

## Quick Fix: Add These 5 Sections to server.js

### 1. Add Imports (After line 9)

**After this line:**
```javascript
import jwt from 'jsonwebtoken';
```

**Add:**
```javascript
import session from 'express-session';

// Phase-2 imports
import { checkOllamaHealth, verifyModels } from './backend/config/ollama.js';
import { initChromaDB as initChroma } from './backend/config/chroma.js';
import agentRoutes from './backend/routes/agentRoutes.js';
import contextRoutes from './backend/routes/contextRoutes.js';
```

---

### 2. Add Session Middleware (After line ~22, after `app.use(express.json());`)

**Add:**
```javascript

// Session middleware for Phase-2 ephemeral context
app.use(session({
  secret: process.env.SESSION_SECRET || 'ideaflow-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 3600000, // 1 hour
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));
```

---

### 3. Make Pool Available (After line ~32, after `console.log("Database configured...")`)

**Add:**
```javascript
  
  // Make pool available to routes
  app.locals.pool = pool;
```

---

### 4. Add Phase-2 Initialization (After line ~35, after the database setup closing brace)

**Add:**
```javascript

// Phase-2: Initialize Ollama and ChromaDB
async function initializePhase2Services() {
  console.log('\n🚀 Initializing Phase-2 Services...');

  try {
    // Check Ollama health
    const ollamaHealthy = await checkOllamaHealth();
    if (ollamaHealthy) {
      await verifyModels();
    } else {
      console.warn('⚠️  Ollama not available. Agent features will be limited.');
    }

    // Initialize ChromaDB
    await initChroma();

    console.log('✅ Phase-2 services initialized\n');
  } catch (error) {
    console.error('❌ Phase-2 initialization error:', error.message);
    console.warn('⚠️  Continuing with limited functionality\n');
  }
}

// Initialize Phase-2 services
initializePhase2Services();
```

---

### 5. Mount Phase-2 Routes (Find the last route, around line ~436, BEFORE the 404 handler)

**Find this section (the last API route):**
```javascript
});


// --- 404 Handler for API Routes ---
app.use('/api/*', (req, res) => {
```

**Add BETWEEN the `});` and the `// --- 404 Handler` comment:**
```javascript


// Mount Phase-2 routes
app.use('/api/agent', agentRoutes);
app.use('/api/context', contextRoutes);
```

---

## That's It!

Save the file and restart your server. The `/api/context/upload` endpoint will now work!

## To Restart Server

1. Stop the current server (Ctrl+C in the terminal)
2. Run: `npm start`

Your AI Agent features will be fully functional! 🚀
