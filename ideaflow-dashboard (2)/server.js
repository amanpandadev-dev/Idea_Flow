
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
import searchHistoryRoutes from './backend/routes/searchHistoryRoutes.js';
import { reindexAllIdeas } from './backend/services/indexer.js';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3001;

// --- Environment Variable Validation ---
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';
const SESSION_SECRET = process.env.SESSION_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SESSION_SECRET) {
  console.error("FATAL ERROR: SESSION_SECRET is not defined in your .env file.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("FATAL ERROR: DATABASE_URL is not defined in your .env file.");
  process.exit(1);
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

// Start background re-indexing
reindexAllIdeas(pool, chromaClient).catch(err => console.error('Background indexing failed:', err));

// --- API Routes ---
// New Agent and Context routes
app.use('/api/context', contextRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/ideas', semanticSearchRoutes);
app.use('/api/search/history', searchHistoryRoutes);

import { mapDBToFrontend } from './backend/utils/mappers.js';

// Middleware to verify Token
const auth = (req, res, next) => {
  if (!pool) return next();

  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// --- Routes ---

// 1. Auth: Login
app.post('/api/auth/login', async (req, res) => {
  if (!pool) return res.status(503).json({ msg: 'DB not connected' });

  const { emp_id, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE emp_id = $1', [emp_id]);

    if (result.rows.length === 0) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const payload = {
      user: {
        id: user.id,
        emp_id: user.emp_id,
        role: user.role
      }
    };

    jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// 2. Auth: Register
app.post('/api/auth/register', async (req, res) => {
  if (!pool) return res.status(503).json({ msg: 'DB not connected' });

  const { emp_id, name, email, password } = req.body;

  try {
    let userCheck = await pool.query('SELECT * FROM users WHERE emp_id = $1 OR email = $2', [emp_id, email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      'INSERT INTO users (emp_id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, emp_id, name, email',
      [emp_id, name, email, password_hash]
    );

    res.json(newUser.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// 3. Auth: Get Current User Details
app.get('/api/auth/me', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });
  try {
    // req.user.user.id is the numeric ID
    const result = await pool.query('SELECT id, emp_id, name, email, role FROM users WHERE id = $1', [req.user.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ msg: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// 4. Auth: Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  if (!pool) return res.status(503).json({ msg: 'DB not connected' });

  const { emp_id, email, password } = req.body;

  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE emp_id = $1 AND email = $2', [emp_id, email]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ msg: 'User details not found or do not match' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE emp_id = $2', [password_hash, emp_id]);

    res.json({ msg: 'Password updated successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// 5. Get Ideas (Filtered)
app.get('/api/ideas', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { search } = req.query;
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
        a.location,
        (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count,
        (EXISTS (SELECT 1 FROM likes WHERE idea_id = i.idea_id AND user_id = $1)) as is_liked
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
    `;

    const params = [userId];

    if (search) {
      query += `
        WHERE 
          (i.title ILIKE $2 OR 
          i.summary ILIKE $2 OR 
          i.challenge_opportunity ILIKE $2 OR
          a.account ILIKE $2)
      `;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY i.idea_id, i.created_at DESC`;

    const result = await pool.query(query, params);
    const mappedData = result.rows.map(mapDBToFrontend);
    res.json(mappedData);
  } catch (err) {
    console.error("Database Query Error:", err.message);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// 6. Get Liked Ideas (Wishlist)
app.get('/api/ideas/liked', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    // Fetch ideas where user_id match in likes table
    const userId = req.user.user.emp_id;

    let query = `
      SELECT DISTINCT ON (i.idea_id)
        i.score as idea_score,
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        a.location,
        (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count,
        (TRUE) as is_liked -- Since we are fetching liked ideas, this is always true
      FROM ideas i
      JOIN likes l ON i.idea_id = l.idea_id
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
      WHERE l.user_id = $1
      ORDER BY i.idea_id, l.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    const mappedData = result.rows.map(mapDBToFrontend);
    res.json(mappedData);
  } catch (err) {
    console.error("Fetch Liked Ideas Error:", err.message);
    res.status(500).json({ error: 'Failed to fetch liked ideas' });
  }
});

// 7. Get Unique Business Groups
app.get('/api/business-groups', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const query = `
      SELECT DISTINCT business_group FROM ideas WHERE business_group IS NOT NULL
      UNION
      SELECT DISTINCT business_group FROM idea_team WHERE business_group IS NOT NULL
      ORDER BY business_group ASC
    `;

    const result = await pool.query(query);
    const groups = result.rows.map(r => r.business_group);
    res.json(groups);
  } catch (err) {
    console.error("BG Fetch Error:", err.message);
    res.status(500).json({ error: 'Failed to fetch business groups' });
  }
});

// 8. Get Similar Ideas
app.get('/api/ideas/:id/similar', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { id } = req.params;
    const userId = req.user ? req.user.user.emp_id : '';
    const numericId = id.replace('IDEA-', '');

    const currentIdea = await pool.query('SELECT title, challenge_opportunity FROM ideas WHERE idea_id = $1', [numericId]);

    if (currentIdea.rows.length === 0) return res.json([]);

    const { title, challenge_opportunity } = currentIdea.rows[0];

    const query = `
      SELECT DISTINCT ON (i.idea_id)
        i.score as idea_score,
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        a.location,
        (SELECT COUNT(*) FROM likes WHERE idea_id = i.idea_id) as likes_count,
        (EXISTS (SELECT 1 FROM likes WHERE idea_id = i.idea_id AND user_id = $1)) as is_liked
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
      WHERE 
        i.idea_id != $2
        AND (
          i.challenge_opportunity = $3
          OR i.title ILIKE $4
        )
      LIMIT 3
    `;

    const keyword = title.split(' ')[0] || title;
    const result = await pool.query(query, [userId, numericId, challenge_opportunity, `%${keyword}%`]);
    const mappedData = result.rows.map(mapDBToFrontend);
    res.json(mappedData);

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch similar ideas' });
  }
});

// 9. Get Associate Details
app.get('/api/associates/:id', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT associate_id, account, location, parent_ou, business_group FROM associates WHERE associate_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'Associate not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 10. Update Idea Status
app.put('/api/ideas/:id/status', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { id } = req.params;
    const { status } = req.body;
    const numericId = id.replace('IDEA-', '');

    await pool.query(
      'UPDATE ideas SET build_phase = $1, updated_at = CURRENT_TIMESTAMP WHERE idea_id = $2',
      [status, numericId]
    );

    res.json({ msg: 'Status updated successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 11. Like/Unlike Idea
app.post('/api/ideas/:id/like', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { id } = req.params;
    const userId = req.user.user.emp_id;
    const numericId = id.replace('IDEA-', '');

    console.log(`Toggling like for Idea: ${numericId} by User: ${userId}`);

    const check = await pool.query('SELECT id FROM likes WHERE user_id = $1 AND idea_id = $2', [userId, numericId]);

    if (check.rows.length > 0) {
      await pool.query('DELETE FROM likes WHERE user_id = $1 AND idea_id = $2', [userId, numericId]);
      console.log("Unliked");
      res.json({ liked: false });
    } else {
      await pool.query('INSERT INTO likes (user_id, idea_id) VALUES ($1, $2)', [userId, numericId]);
      console.log("Liked");
      res.json({ liked: true });
    }
  } catch (err) {
    console.error("Like Error:", err.message);
    res.status(500).send('Server Error');
  }
});


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
