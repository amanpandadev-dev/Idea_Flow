import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from "@google/generative-ai";
import session from 'express-session';

import { initChromaDB } from './backend/config/chroma.js';

// Import Routers
import contextRoutes from './backend/routes/contextRoutes.js';
import agentRoutes from './backend/routes/agentRoutes.js';
import semanticSearchRoutes from './backend/routes/semanticSearchRoutes.js';
import advancedSearchRoutes from './backend/routes/advancedSearchRoutes.js';
import conversationRoutes from './backend/routes/conversationRoutes.js';
import proSearchRoutes from './backend/routes/proSearchRoutes.js';
import chatHistoryRoutes from './backend/routes/chatHistoryRoutes.js';
const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3001;

// --- Environment Variable Validation ---
if (!process.env.JWT_SECRET || !process.env.REFRESH_SECRET) {
  console.error('❌ CRITICAL: JWT_SECRET and REFRESH_SECRET must be set in .env file');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

// Initialize Google GenAI
let ai = null;
let aiAvailable = false;

if (process.env.API_KEY) {
  try {
    ai = new GoogleGenerativeAI(process.env.API_KEY);
    aiAvailable = true;
    console.log("✅ Google GenAI initialized successfully");
  } catch (e) {
    console.error("❌ Failed to initialize GenAI:", e.message);
    aiAvailable = false;
  }
}

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middleware ---
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Session middleware (required for agent routes)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Database Connection Management
let pool;



if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    // Connection pool configuration
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
  });
  console.log("✅ Database configured. Attempting to connect...");

  // Test database connection
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('❌ Database connection failed:', err.message);
    } else {
      console.log('✅ Database connected successfully');
    }
  });
} else {
  console.warn("⚠️ No DATABASE_URL found in .env file.");
}

const chromaClient = await initChromaDB();

// Ensure ideas_collection exists on startup
import { ensureIdeasCollection } from './backend/services/ideaIndexingService.js';
try {
  await ensureIdeasCollection(chromaClient);
} catch (error) {
  console.error('⚠️  Failed to ensure ideas_collection exists:', error.message);
}

// Make ChromaDB and DB available to routes
app.set('chromaClient', chromaClient);
app.set('db', pool);

// Make pool available via app.locals for agent routes
app.locals.pool = pool;



// --- API Routes ---
// New Agent and Context routes
app.use('/api/context', contextRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/search', proSearchRoutes); // Pro Search with ChromaDB
app.use('/api/chat', chatHistoryRoutes); // Chat history for Pro Search
app.use('/api/ideas', advancedSearchRoutes); // Advanced search with NLP
app.use('/api/ideas', semanticSearchRoutes); // Legacy semantic search
// --- Helpers ---

// --- ADVANCED SCORING ALGORITHMS ---

// Cosine Similarity for Vector Embeddings
const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
};

// BM25+ Scoring Algorithm
// BM25+ is an improved version of BM25 that handles edge cases better
// Parameters:
// - k1: Term frequency saturation parameter (typically 1.2-2.0)
// - b: Length normalization parameter (typically 0.75)
// - delta: Lower bound for term frequency normalization (typically 0.5-1.0)
const calculateBM25Plus = (termFreq, docLength, avgDocLength, totalDocs, docsWithTerm, k1 = 1.5, b = 0.75, delta = 0.5) => {
  // IDF (Inverse Document Frequency) calculation
  // Using BM25+ variant which adds smoothing
  const idf = Math.log((totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);

  // Length normalization
  const lengthNorm = 1 - b + b * (docLength / avgDocLength);

  // BM25+ formula with delta parameter for better handling of term frequency
  const tfComponent = ((k1 + 1) * termFreq) / (k1 * lengthNorm + termFreq);
  const bm25Plus = idf * (tfComponent + delta);

  return Math.max(0, bm25Plus);
};

// Reciprocal Rank Fusion (RRF)
// Combines multiple ranked lists into a single ranking
// k parameter controls the impact of rank position (typically 60)
const reciprocalRankFusion = (rankedLists, k = 60) => {
  const scores = new Map();

  rankedLists.forEach(rankedList => {
    rankedList.forEach((item, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);

      const currentScore = scores.get(item.id) || 0;
      scores.set(item.id, currentScore + rrfScore);
    });
  });

  return scores;
};

// Normalize scores to 0-1 range
const normalizeScores = (scores) => {
  const values = Array.from(scores.values());
  if (values.length === 0) return scores;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) return scores;

  const normalized = new Map();
  scores.forEach((score, id) => {
    normalized.set(id, (score - min) / range);
  });

  return normalized;
};

// Helper: Get Embedding (disabled for free tier - using Gemini 2.0 Flash for semantic scoring instead)
async function getEmbedding(text) {
  // Free tier doesn't support text-embedding-004
  // Return empty array - similar ideas will use keyword matching
  return [];
}

// Helper: Get semantic similarity score using Gemini 2.0 Flash
async function getSemanticScore(text1, text2) {
  if (!ai || !aiAvailable || !text1 || !text2) return 0;
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const prompt = `Rate the semantic similarity between these two texts on a scale of 0-1.
Text 1: "${text1.substring(0, 300)}"
Text 2: "${text2.substring(0, 300)}"
Return ONLY a decimal number between 0 and 1. Nothing else.`;

    const result = await model.generateContent(prompt);
    const score = parseFloat(result.response.text().trim());
    return isNaN(score) ? 0 : Math.min(1, Math.max(0, score));
  } catch (e) {
    console.error('[SemanticScore] Error:', e.message);
    return 0;
  }
}

// Helper: Enhanced AI Query Refinement with NLP
async function refineQueryWithAI(rawQuery) {
  if (!ai || !aiAvailable) return rawQuery;
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const prompt = `You are an intelligent search query optimizer for an innovation idea repository.

Task: Analyze and enhance the user's search query to improve search results.

User Query: "${rawQuery}"

Instructions:
1. Fix any spelling errors
2. Expand abbreviations and acronyms (e.g., "AI" → "artificial intelligence", "ML" → "machine learning")
3. Add relevant synonyms and related terms
4. Identify the core intent and key concepts
5. Normalize technical terms to standard industry terminology

Return ONLY the enhanced search terms as a single line, separated by spaces. Include both the original corrected terms and relevant expansions.

Example:
Input: "AI chatbot for custmer support"
Output: artificial intelligence AI chatbot conversational agent customer support service helpdesk

Enhanced Query:`;

    const result = await model.generateContent(prompt);
    if (!result || !result.response) return rawQuery;

    const refined = result.response.text().trim();
    console.log(`[NLP] Original: "${rawQuery}" → Refined: "${refined}"`);
    return refined || rawQuery;
  } catch (e) {
    console.error("[NLP] Query refinement failed:", e.message);
    if (e.message.includes("403")) aiAvailable = false;
    return rawQuery;
  }
}

const mapDBToFrontend = (row, matchScore = 0) => {
  const safeInt = (val) => (val !== null && val !== undefined) ? parseInt(val, 10) : 0;
  // ... (keeping existing logic, just shortening for brevity in this response)
  return {
    id: `IDEA-${row.idea_id}`,
    dbId: row.idea_id,
    title: row.title,
    description: row.summary || '',
    domain: row.challenge_opportunity || 'Other',
    status: row.build_phase || 'Submitted',
    businessGroup: row.idea_bg || 'Corporate Functions',
    businessGroup: row.idea_bg || 'Corporate Functions',
    buildType: row.build_preference || 'New Solution / IP',
    technologies: row.code_preference ? (row.code_preference.includes(',') ? row.code_preference.split(',').map(s => s.trim()) : [row.code_preference]) : [],
    technologies: row.code_preference ? (row.code_preference.includes(',') ? row.code_preference.split(',').map(s => s.trim()) : [row.code_preference]) : [],
    submissionDate: row.created_at,
    associateId: row.associate_id,
    associateAccount: row.account || 'Unknown',
    associateAccount: row.account || 'Unknown',
    associateBusinessGroup: row.assoc_bg || 'Unknown',
    score: row.idea_score !== undefined && row.idea_score !== null ? safeInt(row.idea_score) : 0,
    likesCount: safeInt(row.likes_count),
    isLiked: !!row.is_liked,
    matchScore: matchScore || 0,
    futureScope: "Integration with wider enterprise ecosystems.", // Placeholder logic
    impactScore: 8, confidenceScore: 8, feasibilityScore: 8
  };
};

// --- AUTH MIDDLEWARE ---
const auth = (req, res, next) => {
  // console.log(`[Auth Middleware] Processing ${req.method} ${req.url}`);
  if (!pool) {
    console.warn("[Auth Middleware] DB not connected, skipping auth check (dev mode?)");
    return next();
  }
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    console.warn("[Auth Middleware] No token provided");
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    // console.log(`[Auth Middleware] User authenticated: ${decoded.user.emp_id}`);
    next();
  } catch (err) {
    console.error(`[Auth Middleware] Token verification failed: ${err.name}`);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ msg: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// --- ROUTES ---

// Conversation History Routes (requires auth middleware)
app.use('/api/conversations', auth, conversationRoutes);

// 1. Auth: Login (Issues Access + Refresh Token)
app.post('/api/auth/login', async (req, res) => {
  console.log("[Login] Attempt started");
  if (!pool) return res.status(503).json({ msg: 'DB not connected' });
  const { emp_id, password } = req.body;
  console.log(`[Login] User: ${emp_id}`);
  try {
    const result = await pool.query('SELECT * FROM users WHERE emp_id = $1', [emp_id]);
    if (result.rows.length === 0) {
      console.warn(`[Login] User not found: ${emp_id}`);
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.warn(`[Login] Invalid password for user: ${emp_id}`);
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const payload = { user: { id: user.id, emp_id: user.emp_id, role: user.role } };

    // Short-lived Access Token (15 mins)
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    // Long-lived Refresh Token (7 days)
    const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

    console.log(`[Login] Success for user: ${emp_id}`);
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error("[Login] Error:", err);
    res.status(500).send('Server error');
  }
});

// 1.5 Auth: Refresh Token Endpoint
app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ msg: 'No refresh token' });

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const payload = { user: decoded.user };

    // Issue new Access Token
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken });
  } catch (err) {
    return res.status(403).json({ msg: 'Invalid refresh token' });
  }
});

// 2. Auth: Register
app.post('/api/auth/register', async (req, res) => {
  console.log("[Register] Attempt started");
  if (!pool) return res.status(503).json({ msg: 'DB not connected' });
  const { emp_id, name, email, password } = req.body;
  console.log(`[Register] User: ${emp_id}, Email: ${email}`);
  try {
    let userCheck = await pool.query('SELECT * FROM users WHERE emp_id = $1 OR email = $2', [emp_id, email]);
    if (userCheck.rows.length > 0) {
      console.warn(`[Register] User already exists: ${emp_id} or ${email}`);
      return res.status(400).json({ msg: 'User already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const newUser = await pool.query(
      'INSERT INTO users (emp_id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, emp_id, name, email',
      [emp_id, name, email, password_hash]
    );
    console.log(`[Register] Success for user: ${emp_id}`);
    res.json(newUser.rows[0]);
  } catch (err) {
    console.error("[Register] Error:", err);
    res.status(500).send('Server error');
  }
});

// 3. Auth: Get Current User
app.get('/api/auth/me', auth, async (req, res) => {
  // console.log("[Auth] Fetching current user");
  if (!pool) return res.status(503).json({ error: 'No database connection' });
  try {
    const result = await pool.query('SELECT id, emp_id, name, email, role FROM users WHERE id = $1', [req.user.user.id]);
    if (result.rows.length === 0) {
      console.warn(`[Auth] User not found for ID: ${req.user.user.id}`);
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[Auth] Error fetching current user:", err);
    res.status(500).send('Server error');
  }
});

// 4. Auth: Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  console.log("[Reset Password] Attempt started");
  if (!pool) return res.status(503).json({ msg: 'DB not connected' });
  const { emp_id, email, password } = req.body;
  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE emp_id = $1 AND email = $2', [emp_id, email]);
    if (userCheck.rows.length === 0) {
      console.warn(`[Reset Password] User mismatch: ${emp_id}, ${email}`);
      return res.status(404).json({ msg: 'User details not found or do not match' });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE emp_id = $2', [password_hash, emp_id]);
    console.log(`[Reset Password] Success for user: ${emp_id}`);
    res.json({ msg: 'Password updated successfully' });
  } catch (err) {
    console.error("[Reset Password] Error:", err);
    res.status(500).send('Server error');
  }
});
// 5. Similar Ideas
app.get('/api/ideas/:id/similar', auth, async (req, res) => {
  console.log(`[Similar] Request for idea: ${req.params.id}`);
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { id } = req.params;
    const userId = req.user ? req.user.user.emp_id : '';
    const numericId = id.replace('IDEA-', '');

    // 1. Fetch Current Idea
    const currentRes = await pool.query(
      'SELECT title, challenge_opportunity, summary, business_group FROM ideas WHERE idea_id = $1',
      [numericId]
    );

    if (currentRes.rows.length === 0) {
      console.warn(`[Similar] Idea not found: ${numericId}`);
      return res.json([]);
    }
    const currentIdea = currentRes.rows[0];

    // 2. Generate Separate Embeddings
    let currentTitleVec = [];
    let currentDomainVec = [];
    let useEmbeddings = false;

    if (aiAvailable) {
      try {
        const [tVec, dVec] = await Promise.all([
          getEmbedding(currentIdea.title),
          getEmbedding(currentIdea.challenge_opportunity || 'General')
        ]);
        if (tVec.length > 0 && dVec.length > 0) {
          currentTitleVec = tVec;
          currentDomainVec = dVec;
          useEmbeddings = true;
        }
      } catch (e) {
        console.warn("Vector gen failed during similar search:", e.message);
      }
    }

    // 3. Fetch Candidates (Broad Filter)
    const keywords = currentIdea.title.split(' ').filter(w => w.length > 3).slice(0, 3).join(' | ');
    const candidateQuery = `
      SELECT DISTINCT ON (i.idea_id)
        i.score as idea_score,
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count,
        (EXISTS (SELECT 1 FROM likes WHERE idea_id = i.idea_id AND user_id = $1)) as is_liked
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
      WHERE 
        i.idea_id != $2 
        AND (
            i.challenge_opportunity = $3
            OR 
            to_tsvector('english', i.title || ' ' || COALESCE(i.summary, '')) @@ to_tsquery('english', $4)
        )
      LIMIT 25
    `;

    const candidateRes = await pool.query(candidateQuery, [
      userId,
      numericId,
      currentIdea.challenge_opportunity,
      keywords || 'AI'
    ]);
    const candidates = candidateRes.rows;

    if (candidates.length === 0) return res.json([]);

    // 4. Re-Rank
    let results = [];
    if (useEmbeddings) {
      const candidatesWithScores = await Promise.all(candidates.map(async (row) => {
        const [candTitleVec, candDomainVec] = await Promise.all([
          getEmbedding(row.title),
          getEmbedding(row.challenge_opportunity || 'General')
        ]);

        if (candTitleVec.length === 0) return { row, similarity: 0 };

        const titleSim = cosineSimilarity(currentTitleVec, candTitleVec);
        const domainSim = cosineSimilarity(currentDomainVec, candDomainVec);
        return { row, similarity: (titleSim + domainSim) / 2 };
      }));

      candidatesWithScores.sort((a, b) => b.similarity - a.similarity);
      results = candidatesWithScores.slice(0, 3).map(item => mapDBToFrontend(item.row));
    } else {
      // Fallback
      results = candidates.slice(0, 3).map(row => mapDBToFrontend(row));
    }

    console.log(`[Similar] Returning ${results.length} similar ideas`);
    res.json(results);

  } catch (err) {
    console.error("Similar Ideas Error:", err);
    res.status(500).json({ error: 'Failed to fetch similar ideas' });
  }
});

// 6. Standard Ideas List (Default View)
app.get('/api/ideas', auth, async (req, res) => {
  console.log("[Ideas] Fetching all ideas");
  if (!pool) return res.status(503).json({ error: 'No database connection' });
  try {
    const userId = req.user ? req.user.user.emp_id : '';
    let query = `
      SELECT DISTINCT ON (i.idea_id)
        i.score as idea_score, 
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count,
        (EXISTS (SELECT 1 FROM likes WHERE idea_id = i.idea_id AND user_id = $1)) as is_liked
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
      ORDER BY i.idea_id, i.created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    console.log(`[Ideas] Fetched ${result.rows.length} ideas`);
    res.json(result.rows.map(row => mapDBToFrontend(row)));
  } catch (err) {
    console.error("[Ideas] Error fetching ideas:", err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// 7. Other Endpoints
app.get('/api/business-groups', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });
  try {
    const query = `SELECT DISTINCT business_group FROM ideas WHERE business_group IS NOT NULL UNION SELECT DISTINCT business_group FROM idea_team WHERE business_group IS NOT NULL ORDER BY business_group ASC`;
    const result = await pool.query(query);
    res.json(result.rows.map(r => r.business_group));
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/ideas/liked', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });
  try {
    const userId = req.user.user.emp_id;
    let query = `SELECT DISTINCT ON (i.idea_id) i.score as idea_score, i.*, i.business_group as idea_bg, a.associate_id, a.account, a.parent_ou, it.business_group as assoc_bg, (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count, (TRUE) as is_liked FROM ideas i JOIN likes l ON i.idea_id = l.idea_id LEFT JOIN idea_team it ON i.idea_id = it.idea_id LEFT JOIN associates a ON it.associate_id = a.associate_id WHERE l.user_id = $1 ORDER BY i.idea_id, l.created_at DESC`;
    const result = await pool.query(query, [userId]);
    res.json(result.rows.map(mapDBToFrontend));
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/associates/:id', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });
  try {
    const result = await pool.query('SELECT associate_id, account, location, parent_ou, business_group FROM associates WHERE associate_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ msg: 'Associate not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).send('Server Error'); }
});

app.put('/api/ideas/:id/status', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });
  try {
    const numericId = req.params.id.replace('IDEA-', '');
    await pool.query('UPDATE ideas SET build_phase = $1, updated_at = CURRENT_TIMESTAMP WHERE idea_id = $2', [req.body.status, numericId]);
    res.json({ msg: 'Status updated' });
  } catch (err) { res.status(500).send('Server Error'); }
});

app.post('/api/ideas/:id/like', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });
  try {
    const userId = req.user.user.emp_id;
    const numericId = req.params.id.replace('IDEA-', '');
    const check = await pool.query('SELECT id FROM likes WHERE user_id = $1 AND idea_id = $2', [userId, numericId]);
    if (check.rows.length > 0) {
      await pool.query('DELETE FROM likes WHERE user_id = $1 AND idea_id = $2', [userId, numericId]);
      res.json({ liked: false });
    } else {
      await pool.query('INSERT INTO likes (user_id, idea_id) VALUES ($1, $2)', [userId, numericId]);
      res.json({ liked: true });
    }
  } catch (err) { res.status(500).send('Server Error'); }
});

// 404 Handler
app.use('/api/*', (req, res) => res.status(404).json({ msg: 'API Endpoint not found' }));

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

// Health check endpoint
app.get('/', (req, res) => res.json({
  status: 'ok',
  message: 'IdeaFlow API Running',
  version: '1.0.0',
  timestamp: new Date().toISOString()
}));

// Start server
try {
  app.listen(port, () => {
    console.log(`\n🚀 Server running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 JWT Authentication: Enabled`);
    console.log(`🤖 AI Features: ${aiAvailable ? 'Enabled' : 'Disabled'}`);
  });
} catch (e) {
  console.error('❌ Server startup error:', e);
  process.exit(1);
}

// Middleware imports moved to top - these are commented out for now
// Uncomment when ready to use:
// import logger from './backend/utils/logger.js';
// import { errorHandler } from './backend/middleware/errorHandler.js';
// import { apiLimiter, authLimiter } from './backend/middleware/rateLimiter.js';
// app.use('/api/', apiLimiter);
// app.use(errorHandler);

