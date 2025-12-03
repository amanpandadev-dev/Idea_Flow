# PowerShell script to patch server.js with Phase-2 integration
# Run this from the project root directory

$serverFile = "server.js"

# Read the file
$content = Get-Content $serverFile -Raw

# 1. Add Phase-2 imports after jwt import
$content = $content -replace "import jwt from 'jsonwebtoken';", @"
import jwt from 'jsonwebtoken';
import session from 'express-session';

// Phase-2 imports
import { checkOllamaHealth, verifyModels } from './backend/config/ollama.js';
import { initChromaDB as initChroma } from './backend/config/chroma.js';
import agentRoutes from './backend/routes/agentRoutes.js';
import contextRoutes from './backend/routes/contextRoutes.js';
"@

# 2. Add session middleware after express.json()
$content = $content -replace "app\.use\(express\.json\(\)\);", @"
app.use(express.json());

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
"@

# 3. Add pool to app.locals and Phase-2 initialization
$content = $content -replace '  console\.log\("Database configured\. Attempting to connect\.\.\."\);', @"
  console.log("Database configured. Attempting to connect...");
  
  // Make pool available to routes
  app.locals.pool = pool;
"@

$content = $content -replace '} else \{\r?\n  console\.warn\("⚠️ No DATABASE_URL found in \.env file\."\);\r?\n\}', @"
} else {
  console.warn("⚠️ No DATABASE_URL found in .env file.");
}

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
"@

# 4. Add Phase-2 routes before 404 handler
$content = $content -replace "// --- 404 Handler for API Routes ---", @"
// Mount Phase-2 routes
app.use('/api/agent', agentRoutes);
app.use('/api/context', contextRoutes);

// --- 404 Handler for API Routes ---
"@

# Write the file back
$content | Set-Content $serverFile -NoNewline

Write-Host "✅ Successfully patched server.js with Phase-2 integration!" -ForegroundColor Green
Write-Host ""
Write-Host "Changes applied:" -ForegroundColor Cyan
Write-Host "  1. Added Phase-2 imports (session, ollama, chroma, routes)"
Write-Host "  2. Added session middleware"
Write-Host "  3. Made database pool available to routes"
Write-Host "  4. Added Phase-2 service initialization"
Write-Host "  5. Mounted agent and context routes"
Write-Host ""
Write-Host "Now run: npm run server" -ForegroundColor Yellow
