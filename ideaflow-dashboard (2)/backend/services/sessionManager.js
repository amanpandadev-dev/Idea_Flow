// In-memory session manager for long-running agent tasks
// NOTE: This is not suitable for production with multiple server instances.
// For production, replace this with a Redis-backed session store.

const activeSessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Creates a new agent session.
 * @param {string} sessionId - The unique ID for the session.
 * @param {object} initialState - The initial state of the session.
 * @returns {object} The created session object.
 */
export function createSession(sessionId, initialState = {}) {
  if (activeSessions.has(sessionId)) {
    console.warn(`Session ${sessionId} already exists. Overwriting.`);
  }
  const session = {
    id: sessionId,
    status: 'starting',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...initialState,
  };
  activeSessions.set(sessionId, session);
  console.log(`[SessionManager] Created session: ${sessionId}`);
  return session;
}

/**
 * Retrieves an agent session.
 * @param {string} sessionId - The ID of the session to retrieve.
 * @returns {object | undefined} The session object, or undefined if not found.
 */
export function getSession(sessionId) {
  return activeSessions.get(sessionId);
}

/**
 * Updates an agent session.
 * @param {string} sessionId - The ID of the session to update.
 * @param {object} updates - The partial data to update the session with.
 * @returns {object | undefined} The updated session object.
 */
export function updateSession(sessionId, updates) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn(`[SessionManager] Attempted to update non-existent session: ${sessionId}`);
    return undefined;
  }

  const updatedSession = {
    ...session,
    ...updates,
    updatedAt: Date.now(),
  };
  activeSessions.set(sessionId, updatedSession);
  return updatedSession;
}

/**
 * Deletes an agent session.
 * @param {string} sessionId - The ID of the session to delete.
 */
export function deleteSession(sessionId) {
  if (activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    console.log(`[SessionManager] Deleted session: ${sessionId}`);
  }
}

/**
 * Cleans up old, stale sessions.
 */
function cleanupStaleSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [sessionId, session] of activeSessions.entries()) {
        if (now - session.createdAt > SESSION_TTL_MS) {
            activeSessions.delete(sessionId);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        console.log(`[SessionManager] Cleaned up ${cleanedCount} stale sessions.`);
    }
}

// Run cleanup periodically
setInterval(cleanupStaleSessions, 1000 * 60 * 10); // Every 10 minutes

console.log('[SessionManager] In-memory session manager initialized.');

export default {
  createSession,
  getSession,
  updateSession,
  deleteSession,
};
