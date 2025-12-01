import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import session from 'express-session';

import { initChromaDB } from './backend/config/chroma.js';

// Import Routers
import contextRoutes from './backend/routes/contextRoutes.js';
import agentRoutes from './backend/routes/agentRoutes.js';
import semanticSearchRoutes from './backend/routes/semanticSearchRoutes.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3001;

// --- Environment Variable Validation ---
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refreshsecretkey456'; // New Secret

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

// Session Middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' } // secure: true in production
}));


// --- Database Connection ---
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Make DB pool available to all routes
app.locals.pool = pool;

// Test DB connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.stack);
    process.exit(1);
  } else {
    console.log('✅ Database connected successfully.');
    client.release();
  }
});

// --- In-Memory Vector Store Initialization ---
const chromaClient = await initChromaDB();

// Make ChromaDB and DB available to routes
app.set('chromaClient', chromaClient);
app.set('db', pool);



// --- API Routes ---
// New Agent and Context routes
app.use('/api/context', contextRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/ideas', semanticSearchRoutes);

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log("✅ Database configured. Attempting to connect...");
} else {
  console.warn("⚠️ No DATABASE_URL found in .env file.");
}

// --- Helpers ---

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

// Helper: Get Embedding
async function getEmbedding(text) {
  if (!ai || !aiAvailable || !text) return [];
  try {
    const model = ai.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    if (result && result.embedding && result.embedding.values) {
      return result.embedding.values;
    }
    return [];
  } catch (e) {
    if (e.message.includes("403") || e.message.includes("PERMISSION_DENIED")) {
      aiAvailable = false;
    }
    return [];
  }
}

// Helper: AI Query Refinement
async function refineQueryWithAI(rawQuery) {
  if (!ai || !aiAvailable) return rawQuery;
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(`
      You are a search query optimizer.
      Task: Correct spelling errors and standardize terms.
      Input: "${rawQuery}"
      Return ONLY the refined keywords separated by spaces.
    `);
    if (!result || !result.response) return rawQuery;
    return result.response.text().trim();
  } catch (e) {
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
    buildType: row.build_preference || 'New Solution / IP',
    technologies: row.code_preference ? (row.code_preference.includes(',') ? row.code_preference.split(',').map(s => s.trim()) : [row.code_preference]) : [],
    submissionDate: row.created_at,
    associateId: row.associate_id,
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

// --- CORE FEATURE: ROBUST HYBRID SEARCH ---
app.get('/api/ideas/search', auth, async (req, res) => {
  console.log("[Search] Request received");
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { q, themes, businessGroups, technologies } = req.query;
    const userId = req.user ? req.user.user.emp_id : '';
    console.log(`[Search] Query: "${q}", User: ${userId}`);

    // Parse filters
    const filterThemes = themes ? JSON.parse(themes) : [];
    const filterBGs = businessGroups ? JSON.parse(businessGroups) : [];
    const filterTech = technologies ? JSON.parse(technologies) : [];

    if (!q) return res.redirect('/api/ideas');

    // 1. Refine Query (Spelling correction & Concept extraction)
    const refinedQuery = await refineQueryWithAI(q.toString());
    console.log(`[Search] Refined Query: "${refinedQuery}"`);

    // 2. Generate Query Embedding (for accurate Re-Ranking)
    let queryEmbedding = [];
    if (aiAvailable) {
      queryEmbedding = await getEmbedding(q.toString());
      console.log(`[Search] Embedding generated: ${queryEmbedding.length > 0}`);
    }

    // 3. Broad Retrieval (SQL FTS)
    // We get top 50 candidates using keyword matching to filter irrelevant data fast.
    const terms = refinedQuery.replace(/[^\w\s]/gi, '').split(/\s+/).filter(t => t.trim().length > 0);
    const broadTsQuery = terms.length > 0 ? terms.join(' | ') : refinedQuery;

    // Construct Filter Clauses
    let filterClauses = '';
    const filterParams = [refinedQuery, broadTsQuery];
    let paramIdx = 3;

    if (filterThemes.length > 0) {
      filterClauses += ` AND i.challenge_opportunity = ANY($${paramIdx})`;
      filterParams.push(filterThemes);
      paramIdx++;
    }
    if (filterBGs.length > 0) {
      filterClauses += ` AND i.business_group = ANY($${paramIdx})`;
      filterParams.push(filterBGs);
      paramIdx++;
    }
    // Technology filter (Text search within code_preference)
    if (filterTech.length > 0) {
      // This is a bit rough for CSV strings, but works for broad filtering
      const techConditions = filterTech.map(() => `i.code_preference ILIKE $${paramIdx}`).join(' OR ');
      filterClauses += ` AND (${techConditions})`;
      filterTech.forEach(t => {
        filterParams.push(`%${t}%`);
        paramIdx++;
      });
    }

    const hybridQuery = `
      SELECT 
        i.idea_id,
        (
          ts_rank_cd(to_tsvector('english', 
            COALESCE(i.title, '') || ' ' || 
            COALESCE(i.summary, '') || ' ' || 
            COALESCE(i.challenge_opportunity, '') || ' ' || 
            COALESCE(i.business_group, '')
          ), websearch_to_tsquery('english', $1)) * 2.0
          +
          ts_rank(to_tsvector('english', 
            COALESCE(i.title, '') || ' ' || 
            COALESCE(i.summary, '') || ' ' || 
            COALESCE(i.challenge_opportunity, '') || ' ' || 
            COALESCE(i.code_preference, '')
          ), to_tsquery('english', $2))
        ) as rank_score
      FROM ideas i
      WHERE 
        (
            to_tsvector('english', 
                COALESCE(i.title, '') || ' ' || 
                COALESCE(i.summary, '') || ' ' || 
                COALESCE(i.challenge_opportunity, '') || ' ' || 
                COALESCE(i.code_preference, '') || ' ' || 
                COALESCE(i.business_group, '')
            ) @@ websearch_to_tsquery('english', $1)
            OR
            to_tsvector('english', 
                COALESCE(i.title, '') || ' ' || 
                COALESCE(i.summary, '') || ' ' || 
                COALESCE(i.challenge_opportunity, '') || ' ' || 
                COALESCE(i.code_preference, '')
            ) @@ to_tsquery('english', $2)
        )
        ${filterClauses}
      ORDER BY rank_score DESC
      LIMIT 100
    `;

    const searchRes = await pool.query(hybridQuery, filterParams);
    const ideaIds = searchRes.rows.map(r => r.idea_id);
    console.log(`[Search] Broad retrieval found ${ideaIds.length} candidates`);

    if (ideaIds.length === 0) return res.json({ results: [], facets: {} });

    // 4. Fetch Full Data
    const dataQuery = `
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
      WHERE i.idea_id = ANY($2::int[])
    `;

    const dataRes = await pool.query(dataQuery, [userId, ideaIds]);
    const candidates = dataRes.rows;

    // 5. Semantic Re-Ranking (The Better Match Metric)
    // If embeddings are available, calculate Cosine Similarity for each candidate.
    // If not, fall back to normalized SQL Rank.
    let scoredResults = [];

    if (aiAvailable && queryEmbedding.length > 0) {
      // Calculate Semantic Score for each
      const resultsWithSemanticScore = await Promise.all(candidates.map(async (row) => {
        const text = `${row.title}: ${row.challenge_opportunity || ''} ${row.summary || ''}`;
        const docVec = await getEmbedding(text);

        let similarity = 0;
        if (docVec.length > 0) {
          similarity = cosineSimilarity(queryEmbedding, docVec);
        }

        // Convert 0-1 to 0-100
        const matchScore = Math.round(similarity * 100);
        return { ...row, matchScore: Math.max(matchScore, 0) };
      }));
      scoredResults = resultsWithSemanticScore;
    } else {
      // Fallback to SQL Rank Normalization
      scoredResults = candidates.map(row => {
        const match = searchRes.rows.find(r => r.idea_id === row.idea_id);
        // Rough normalization of TS_RANK (usually 0.1 to 1.0+)
        const matchScore = match ? Math.min(Math.round(match.rank_score * 50), 90) : 0;
        return { ...row, matchScore };
      });
    }

    // Sort by Match Score
    const finalResults = scoredResults
      .map(row => mapDBToFrontend(row, row.matchScore))
      .sort((a, b) => b.matchScore - a.matchScore);

    // Facets Logic
    const facets = { businessGroups: {}, technologies: {}, themes: {} };
    finalResults.forEach(item => {
      facets.businessGroups[item.businessGroup] = (facets.businessGroups[item.businessGroup] || 0) + 1;
      facets.themes[item.domain] = (facets.themes[item.domain] || 0) + 1;
      item.technologies.forEach(t => facets.technologies[t] = (facets.technologies[t] || 0) + 1);
    });

    console.log(`[Search] Returning ${finalResults.length} results`);
    res.json({ results: finalResults, facets });

  } catch (err) {
    console.error("Hybrid Search Error:", err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- SIMILAR IDEAS (Vector + Hybrid) ---
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

// Standard Ideas List (Default View)
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

// Other Endpoints
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

app.use('/api/*', (req, res) => res.status(404).json({ msg: 'API Endpoint not found' }));
process.on('uncaughtException', (err) => console.error('UNCAUGHT EXCEPTION:', err));
app.get('/', (req, res) => res.send('API Running. Use port 5173 for Frontend.'));

// --- 404 Handler for API Routes ---
app.use('/api/*', (req, res) => {
  res.status(404).json({ msg: `API Endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Global Error Handler for startup
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

app.get('/', (req, res) => {
  res.send('API Running. Use port 5173 for Frontend.');
});

// --- Start Server ---
try {
  app.listen(port, () => {
    console.log(`\n🚀 Server running on port ${port}`);
    console.log(`   Frontend expects API at http://localhost:${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Please stop other processes or use a different port.`);
    } else {
      console.error('❌ Server failed to start:', err);
    }
    process.exit(1);
  });
} catch (e) {
  console.error('❌ Server startup error:', e);
  process.exit(1);
}

