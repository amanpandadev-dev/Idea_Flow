# Server.js Integration Instructions

Due to file corruption issues with automated edits, please manually add the following to `server.js`:

## 1. Add imports (after line 9)

```javascript
import session from 'express-session';

// Phase-2 imports
import { checkOllamaHealth, verifyModels } from './backend/config/ollama.js';
import { initChromaDB as initChroma } from './backend/config/chroma.js';
import agentRoutes from './backend/routes/agentRoutes.js';
import contextRoutes from './backend/routes/contextRoutes.js';
```

## 2. Add session middleware (after `app.use(express.json());`)

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

## 3. Make pool available to routes (after pool creation)

```javascript
// Make pool available to routes
app.locals.pool = pool;
```

## 4. Add Phase-2 initialization (after database setup)

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

## 5. Mount Phase-2 routes (before the 404 handler)

```javascript
// Mount Phase-2 routes
app.use('/api/agent', agentRoutes);
app.use('/api/context', contextRoutes);
```

That's it! Save the file and run `npm run server`.
