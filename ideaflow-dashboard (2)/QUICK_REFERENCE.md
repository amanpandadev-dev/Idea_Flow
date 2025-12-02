# Quick Reference - IdeaFlow Enhancements

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install winston express-rate-limit

# 2. Generate secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Update .env (fix RFRESH_SECRET → REFRESH_SECRET)

# 4. Start server
npm run server

# 5. Start frontend
npm run dev
```

---

## 📁 New Files Created

| File | Purpose |
|------|---------|
| `.env.example` | Environment variable template |
| `backend/utils/logger.js` | Centralized logging |
| `backend/middleware/errorHandler.js` | Error handling |
| `backend/middleware/rateLimiter.js` | Rate limiting |
| `backend/middleware/validation.js` | Input validation |
| `TEST_REPORT_AND_ENHANCEMENTS.md` | Full test report |
| `IMPLEMENTATION_SUMMARY.md` | Changes summary |
| `INTEGRATION_GUIDE.md` | Step-by-step guide |
| `QUICK_REFERENCE.md` | This file |

---

## 🔧 Key Changes

### package.json
- ✅ Removed 8 duplicate dependencies
- ✅ Added winston, express-rate-limit

### server.js
- ✅ Environment validation
- ✅ Database pool configuration
- ✅ Fixed error handling
- ✅ Better startup logging

### services.ts
- ✅ Removed 9 duplicate fetch calls
- ✅ Standardized token storage

### .gitignore
- ✅ Enhanced .env protection

---

## 🛡️ Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 req/15 min |
| Auth (login/register) | 5 req/15 min |
| Search | 30 req/1 min |
| Upload | 10 req/1 hour |

---

## 📝 Logger Usage

```javascript
// Replace console.log
logger.info("Message", { metadata });

// Replace console.error
logger.error("Error occurred", { error: err.message });

// Replace console.warn
logger.warn("Warning message");

// Debug (only in development)
logger.debug("Debug info");
```

---

## 🔐 Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - Access token secret (32+ chars)
- `REFRESH_SECRET` - Refresh token secret (32+ chars)
- `SESSION_SECRET` - Session secret (32+ chars)

**Optional:**
- `API_KEY` - Google GenAI
- `OLLAMA_HOST` - Local embeddings
- `TAVILY_API_KEY` - Web search
- `OPENROUTER_API_KEY` - Grok embeddings
- `EMBEDDING_PROVIDER` - llama or grok
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - development or production

---

## 🧪 Testing Commands

```bash
# Test rate limiting
for i in {1..6}; do curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emp_id":"test","password":"wrong"}'; done

# Test validation
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"emp_id":"test","name":"Test","email":"invalid","password":"123"}'

# Test health check
curl http://localhost:3001/

# View logs
tail -f logs/error.log
tail -f logs/combined.log
```

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Cannot find module 'winston'" | `npm install winston express-rate-limit` |
| "JWT_SECRET must be set" | Update .env with proper secrets |
| Token refresh failing | Fix typo: RFRESH_SECRET → REFRESH_SECRET |
| Rate limiting not working | Apply middleware before routes |
| Logs not created | Check file permissions |

---

## 📊 Middleware Order (Important!)

```javascript
// 1. Body parser
app.use(express.json());

// 2. Rate limiters
app.use('/api/', apiLimiter);

// 3. Routes with validation
app.post('/api/auth/login', authLimiter, validateLogin, handler);

// 4. Error handler (MUST BE LAST)
app.use(errorHandler);
```

---

## 🎯 Integration Checklist

- [ ] Install dependencies
- [ ] Update .env file
- [ ] Fix REFRESH_SECRET typo
- [ ] Import middleware in server.js
- [ ] Apply rate limiters
- [ ] Add validation to routes
- [ ] Add error handler (last)
- [ ] Replace console with logger
- [ ] Test authentication
- [ ] Test rate limiting
- [ ] Test validation
- [ ] Check logs directory

---

## 📈 Performance Improvements

- ✅ 9 duplicate API calls eliminated
- ✅ Database connection pooling configured
- ✅ Rate limiting prevents resource exhaustion
- ✅ Structured logging reduces overhead

---

## 🔒 Security Improvements

- ✅ Environment variables protected
- ✅ Mandatory secrets validation
- ✅ Rate limiting prevents abuse
- ✅ Input validation prevents injection
- ✅ XSS protection via sanitization

---

## 📞 Support Files

- **Full Details:** `TEST_REPORT_AND_ENHANCEMENTS.md`
- **What Changed:** `IMPLEMENTATION_SUMMARY.md`
- **How to Apply:** `INTEGRATION_GUIDE.md`
- **This File:** `QUICK_REFERENCE.md`

---

**Version:** 1.0.0  
**Last Updated:** December 2, 2025
