# Integration Guide - Applying Enhancements

## 🎯 Overview
This guide walks you through integrating all the enhancements into your IdeaFlow Dashboard application.

---

## Step 1: Install New Dependencies

```bash
npm install winston express-rate-limit
```

**Verify installation:**
```bash
npm list winston express-rate-limit
```

---

## Step 2: Update Environment Variables

### 2.1 Generate Strong Secrets
Run this command 3 times to generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2.2 Update .env File
1. **CRITICAL:** Rename `RFRESH_SECRET` to `REFRESH_SECRET`
2. Replace placeholder secrets with generated ones:
   ```env
   JWT_SECRET=<generated-secret-1>
   REFRESH_SECRET=<generated-secret-2>
   SESSION_SECRET=<generated-secret-3>
   ```

### 2.3 Verify Configuration
```bash
# Check that .env is in .gitignore
git check-ignore .env
# Should output: .env

# Verify .env.example exists
ls -la .env.example
```

---

## Step 3: Integrate Middleware into server.js

Add these imports at the top of `server.js` (after existing imports):

```javascript
// Import new middleware
import logger from './backend/utils/logger.js';
import { errorHandler, asyncHandler, AppError } from './backend/middleware/errorHandler.js';
import { apiLimiter, authLimiter, searchLimiter, uploadLimiter } from './backend/middleware/rateLimiter.js';
import { 
  validateLogin, 
  validateRegistration, 
  validateSearch, 
  validateAgentQuery,
  validateIdeaId 
} from './backend/middleware/validation.js';
```

### 3.1 Apply Rate Limiters
Add after `app.use(express.json());`:

```javascript
// Apply rate limiting
app.use('/api/', apiLimiter);
```

### 3.2 Update Authentication Routes
Replace existing auth routes with validated versions:

```javascript
// Login with rate limiting and validation
app.post('/api/auth/login', authLimiter, validateLogin, async (req, res, next) => {
  try {
    logger.info(`Login attempt for user: ${req.body.emp_id}`);
    if (!pool) return res.status(503).json({ msg: 'DB not connected' });
    
    const { emp_id, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE emp_id = $1', [emp_id]);
    
    if (result.rows.length === 0) {
      logger.warn(`Login failed: User not found - ${emp_id}`);
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      logger.warn(`Login failed: Invalid password - ${emp_id}`);
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const payload = { user: { id: user.id, emp_id: user.emp_id, role: user.role } };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

    logger.info(`Login successful for user: ${emp_id}`);
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, role: user.role }
    });
  } catch (err) {
    next(err);
  }
});

// Register with rate limiting and validation
app.post('/api/auth/register', authLimiter, validateRegistration, async (req, res, next) => {
  try {
    logger.info(`Registration attempt for user: ${req.body.emp_id}`);
    if (!pool) return res.status(503).json({ msg: 'DB not connected' });
    
    const { emp_id, name, email, password } = req.body;
    const userCheck = await pool.query('SELECT * FROM users WHERE emp_id = $1 OR email = $2', [emp_id, email]);
    
    if (userCheck.rows.length > 0) {
      logger.warn(`Registration failed: User exists - ${emp_id}`);
      return res.status(400).json({ msg: 'User already exists' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const newUser = await pool.query(
      'INSERT INTO users (emp_id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, emp_id, name, email',
      [emp_id, name, email, password_hash]
    );
    
    logger.info(`Registration successful for user: ${emp_id}`);
    res.json(newUser.rows[0]);
  } catch (err) {
    next(err);
  }
});
```

### 3.3 Update Search Routes
Add validation to search endpoint:

```javascript
app.get('/api/ideas/search', auth, searchLimiter, validateSearch, async (req, res, next) => {
  // ... existing search logic
});
```

### 3.4 Update Agent Routes
The agent routes are in `backend/routes/agentRoutes.js`. Update them:

```javascript
// In backend/routes/agentRoutes.js
import { validateAgentQuery } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

router.post('/session', validateAgentQuery, asyncHandler(async (req, res) => {
  // ... existing logic
}));

router.post('/query', validateAgentQuery, asyncHandler(async (req, res) => {
  // ... existing logic
}));
```

### 3.5 Update Context Routes
Add upload limiter to context routes in `backend/routes/contextRoutes.js`:

```javascript
// In backend/routes/contextRoutes.js
import { uploadLimiter } from '../middleware/rateLimiter.js';

router.post('/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  // ... existing logic
});
```

### 3.6 Add Error Handler (MUST BE LAST)
Add at the very end of `server.js`, before `app.listen()`:

```javascript
// Global error handler (must be last middleware)
app.use(errorHandler);
```

---

## Step 4: Replace Console Statements with Logger

### 4.1 Quick Find & Replace Guide

**Pattern to find:** `console.log(`  
**Replace with:** `logger.info(`

**Pattern to find:** `console.error(`  
**Replace with:** `logger.error(`

**Pattern to find:** `console.warn(`  
**Replace with:** `logger.warn(`

### 4.2 Example Replacements

**Before:**
```javascript
console.log("[Login] Attempt started");
console.error("[Login] Error:", err);
console.warn("[Login] User not found");
```

**After:**
```javascript
logger.info("Login attempt started");
logger.error("Login error", { error: err.message, stack: err.stack });
logger.warn("Login failed: User not found");
```

---

## Step 5: Test the Integration

### 5.1 Start the Server
```bash
npm run server
```

**Expected output:**
```
✅ Database configured. Attempting to connect...
✅ Database connected successfully
✅ Google GenAI initialized successfully
🚀 Server running on port 3001
📊 Environment: development
🔐 JWT Authentication: Enabled
🤖 AI Features: Enabled
```

### 5.2 Test Rate Limiting
```bash
# Test auth rate limiting (should block after 5 attempts)
for i in {1..6}; do
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"emp_id":"test","password":"wrong"}'
  echo "\nAttempt $i"
done
```

**Expected:** 6th attempt should return 429 (Too Many Requests)

### 5.3 Test Validation
```bash
# Test with invalid email
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"emp_id":"test","name":"Test","email":"invalid","password":"test123"}'
```

**Expected:** 400 error with "Valid email is required"

### 5.4 Test Error Logging
```bash
# Check logs directory was created
ls -la logs/

# View error log
tail -f logs/error.log

# View combined log
tail -f logs/combined.log
```

### 5.5 Test Health Check
```bash
curl http://localhost:3001/
```

**Expected:**
```json
{
  "status": "ok",
  "message": "IdeaFlow API Running",
  "version": "1.0.0",
  "timestamp": "2025-12-02T..."
}
```

---

## Step 6: Frontend Testing

### 6.1 Start Frontend
```bash
npm run dev
```

### 6.2 Test User Flows
1. **Registration:**
   - Try invalid email → Should show validation error
   - Try short password → Should show validation error
   - Register successfully → Should work

2. **Login:**
   - Try wrong password 5 times → Should get rate limited
   - Wait 15 minutes or restart server
   - Login successfully → Should work

3. **Search:**
   - Perform 30+ searches rapidly → Should get rate limited
   - Normal search → Should work

4. **Document Upload:**
   - Upload 10+ documents in an hour → Should get rate limited
   - Normal upload → Should work

---

## Step 7: Monitoring

### 7.1 Watch Logs in Real-Time
```bash
# Terminal 1: Error logs
tail -f logs/error.log

# Terminal 2: All logs
tail -f logs/combined.log

# Terminal 3: Server output
npm run server
```

### 7.2 Log Rotation
Logs automatically rotate when they reach 5MB. You'll see files like:
- `error.log`
- `error.log.1`
- `error.log.2`
- etc.

---

## Step 8: Production Deployment

### 8.1 Environment Variables
```bash
# Set production environment
export NODE_ENV=production

# Verify all secrets are set
node -e "
const required = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_SECRET', 'SESSION_SECRET'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error('Missing:', missing);
  process.exit(1);
}
console.log('✅ All required variables set');
"
```

### 8.2 Build Frontend
```bash
npm run build
```

### 8.3 Start Production Server
```bash
NODE_ENV=production npm run server
```

---

## 🔧 Troubleshooting

### Issue: "Cannot find module 'winston'"
**Solution:** Run `npm install winston express-rate-limit`

### Issue: "JWT_SECRET must be set"
**Solution:** Update your `.env` file with proper secrets

### Issue: Rate limiting not working
**Solution:** Ensure rate limiter middleware is applied before routes

### Issue: Logs directory not created
**Solution:** The logger creates it automatically. Check file permissions.

### Issue: Token refresh failing
**Solution:** Verify `REFRESH_SECRET` is set (not `RFRESH_SECRET`)

---

## 📊 Verification Checklist

- [ ] New dependencies installed
- [ ] .env file updated with strong secrets
- [ ] REFRESH_SECRET typo fixed
- [ ] Middleware imported in server.js
- [ ] Rate limiters applied
- [ ] Validation added to routes
- [ ] Error handler added (last middleware)
- [ ] Console statements replaced with logger
- [ ] Server starts without errors
- [ ] Logs directory created
- [ ] Rate limiting works
- [ ] Validation works
- [ ] Frontend connects successfully
- [ ] Authentication flow works
- [ ] Search works
- [ ] Document upload works

---

## 🎉 Success!

Once all checks pass, your application is:
- ✅ More secure
- ✅ Better performing
- ✅ Easier to debug
- ✅ Production-ready

---

## 📞 Need Help?

Check these files for reference:
- `TEST_REPORT_AND_ENHANCEMENTS.md` - Full test report
- `IMPLEMENTATION_SUMMARY.md` - What was changed
- `.env.example` - Environment variable template
- `logs/error.log` - Error details

---

**Last Updated:** December 2, 2025  
**Version:** 1.0.0
