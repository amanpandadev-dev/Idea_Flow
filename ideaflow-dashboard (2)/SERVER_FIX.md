# URGENT: Server.js Got Corrupted - Quick Fix

Your server.js file got corrupted during automated edits. Here's how to fix it:

## Option 1: Restore from Git (Recommended)

The file has been restored to the last working version. Now manually add the Phase-2 code following `COMPLETE_SERVER_INTEGRATION.md`.

## Option 2: Quick Manual Fix

If you already added the Phase-2 code but the server won't start, the issue is likely that **Ollama isn't running**.

### Make Phase-2 Initialization Non-Blocking

Find this line in server.js (around line 77):
```javascript
// Initialize Phase-2 services
initializePhase2Services();
```

**Replace it with:**
```javascript
// Initialize Phase-2 services (non-blocking)
initializePhase2Services().catch(err => {
  console.error('Phase-2 initialization failed:', err.message);
});
```

This allows the server to start even if Ollama isn't running.

## Then Restart

```powershell
# Stop current server (Ctrl+C)
npm start
```

The backend should now start on port 3001, and the frontend will connect successfully!

## What's Happening

The `ECONNREFUSED` error means:
- Frontend (Vite) is running on port 5173 ✅
- Backend (Express) is NOT running on port 3001 ❌
- Frontend can't connect to backend

Once you make the Phase-2 initialization non-blocking, the backend will start successfully even without Ollama.
