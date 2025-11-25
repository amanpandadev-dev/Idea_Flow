import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection Management
let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log("Database configured. Attempting to connect...");
} else {
  console.warn("⚠️ No DATABASE_URL found in .env file. DB-dependent endpoints will return 503.");
}

// --- Helpers ---

const randomScore = () => Math.floor(Math.random() * 5) + 6;

const generateFutureScope = (domain) => {
  const scopes = [
    `Integration with wider enterprise ecosystems to enable cross-functional data synergy in ${domain}.`,
    "Scaling to support multi-tenant architecture and 3rd-party API monetization.",
    "Incorporating advanced reinforcement learning models to automate decision-making loops.",
    "Expansion into mobile-first experiences with offline capabilities for field workers.",
    "Adoption of edge computing principles to reduce latency and improve real-time processing."
  ];
  return scopes[Math.floor(Math.random() * scopes.length)];
};

// Map DB row to Frontend Idea Interface — keep attribute names exactly as DB provides
const mapDBToFrontend = (row) => ({
  id: `IDEA-${row.idea_id}`,
  dbId: row.idea_id,
  title: row.title,
  description: row.summary || '',
  domain: row.challenge_opportunity || 'Other',
  status: row.build_phase || 'Submitted',
  businessGroup: row.idea_bg || 'Corporate Functions',
  buildType: row.build_preference || 'New Solution / IP',
  technologies: row.code_preference ? (row.code_preference.includes(',') ? row.code_preference.split(',').map(s=>s.trim()) : [row.code_preference]) : [],
  submissionDate: row.created_at,
  associateId: row.associate_id,
  associateAccount: row.account || 'Unknown',
  associateBusinessGroup: row.assoc_bg || 'Unknown',
  votes: 0,
  futureScope: generateFutureScope(row.challenge_opportunity || 'General'),
  impactScore: randomScore(),
  confidenceScore: randomScore(),
  feasibilityScore: randomScore()
});

// Middleware to verify Token
const auth = (req, res, next) => {
  if (!pool) return next(); // Skip auth in demo mode/no db

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
        role: user.role
      }
    };

    jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).send('Server error');
  }
});

// 2. Auth: Register (Hidden/Utility)
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
    console.error("Register Error:", err);
    res.status(500).send('Server error');
  }
});

// 3. Auth: Reset Password
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
    console.error("Reset Password Error:", err);
    res.status(500).send('Server error');
  }
});

// 4. Get Ideas (Filtered)
app.get('/api/ideas', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { search } = req.query;
    
    // Use your real attribute names (do NOT rename columns)
    const selectClause = `
      SELECT DISTINCT ON (i.idea_id)
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        a.location
    `;
    
    const fromClause = `
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
    `;
    
    let whereClause = "";
    const params = [];
    
    if (search) {
      whereClause = `
        WHERE 
          i.title ILIKE $1 OR 
          i.summary ILIKE $1 OR 
          i.challenge_opportunity ILIKE $1 OR
          a.account ILIKE $1
      `;
      params.push(`%${search}%`);
    }

    // Important: DISTINCT ON requires ORDER BY with the DISTINCT expr as first element
    const orderBy = ` ORDER BY i.idea_id, i.created_at DESC`;
    
    const query = `${selectClause} ${fromClause} ${whereClause} ${orderBy}`;
    
    const result = await pool.query(query, params);
    const mappedData = result.rows.map(mapDBToFrontend);
    res.json(mappedData);
  } catch (err) {
    console.error("Database Query Error (/api/ideas):", err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// 5. Get Unique Business Groups (For Filter)
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
    console.error("BG Fetch Error:", err);
    res.status(500).json({ error: 'Failed to fetch business groups' });
  }
});

// 6. Get Similar Ideas (Semantic-like Search)
app.get('/api/ideas/:id/similar', auth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database connection' });

  try {
    const { id } = req.params;
    const numericId = id.replace('IDEA-', '');

    // 1. Get current idea to find its domain/title
    const currentIdea = await pool.query('SELECT title, challenge_opportunity FROM ideas WHERE idea_id = $1', [numericId]);
    
    if (currentIdea.rows.length === 0) return res.json([]);
    
    const { title, challenge_opportunity } = currentIdea.rows[0];
    
    // 2. Find similar ideas
    const query = `
      SELECT DISTINCT ON (i.idea_id)
        i.*,
        i.business_group as idea_bg,
        a.associate_id,
        a.account,
        a.parent_ou,
        it.business_group as assoc_bg,
        a.location
      FROM ideas i
      LEFT JOIN idea_team it ON i.idea_id = it.idea_id
      LEFT JOIN associates a ON it.associate_id = a.associate_id
      WHERE 
        i.idea_id != $1
        AND (
          i.challenge_opportunity = $2
          OR i.title ILIKE $3
        )
      ORDER BY i.idea_id, i.created_at DESC
      LIMIT 3
    `;
    
    const keyword = (title || '').split(' ')[0] || title || '';

    const result = await pool.query(query, [numericId, challenge_opportunity, `%${keyword}%`]);
    const mappedData = result.rows.map(mapDBToFrontend);
    res.json(mappedData);

  } catch (err) {
    console.error("Similar Ideas Error:", err);
    res.status(500).json({ error: 'Failed to fetch similar ideas' });
  }
});

// 7. Get Associate Details
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
    console.error("Associate Fetch Error:", err);
    res.status(500).send('Server Error');
  }
});

// 8. Update Idea Status
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
    console.error("Update Status Error:", err);
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

// Start Server
try {
  app.listen(port, () => {
    console.log(`\n🚀 Server running on port ${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Please stop other processes or use a different port.`);
    } else {
      console.error('❌ Server failed to start:', err);
    }
  });
} catch (e) {
  console.error('❌ Server startup error:', e);
}
