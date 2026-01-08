/**
 * Market Chat Session Manager
 * 
 * Manages server-side conversation sessions for Market Chat.
 * Stores conversation history in memory until user explicitly clears or session expires.
 * 
 * Features:
 * - Session-based conversation storage
 * - Auto-expiry after 24 hours of inactivity
 * - Thread-safe operations
 * - Support for context extraction (competitors, problem statements)
 */

// In-memory session store
// Structure: { sessionKey: { ideaId, messages: [], metadata: {}, lastActivity: timestamp } }
const sessions = new Map();

// Session configuration
const SESSION_TTL_HOURS = 24;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate session key from ideaId and optional userId
 */
function getSessionKey(ideaId, userId = 'default') {
    return `${ideaId}_${userId}`;
}

/**
 * Initialize or get existing session
 */
export function initializeSession(ideaId, userId = 'default') {
    const sessionKey = getSessionKey(ideaId, userId);

    if (!sessions.has(sessionKey)) {
        console.log(`[SessionManager] Creating new session for idea ${ideaId}`);
        sessions.set(sessionKey, {
            ideaId,
            userId,
            messages: [],
            metadata: {
                competitors: [],      // Extracted competitor names
                problemStatements: [], // Extracted problem statements
                lastQuery: null
            },
            createdAt: new Date(),
            lastActivity: new Date()
        });
    } else {
        console.log(`[SessionManager] Using existing session for idea ${ideaId} (${sessions.get(sessionKey).messages.length} messages)`);
    }

    return sessionKey;
}

/**
 * Add message to session
 */
export function addMessage(sessionKey, role, content, metadata = {}) {
    const session = sessions.get(sessionKey);

    if (!session) {
        console.error(`[SessionManager] Session not found: ${sessionKey}`);
        return false;
    }

    const message = {
        role,
        content,
        timestamp: new Date(),
        ...metadata
    };

    session.messages.push(message);
    session.lastActivity = new Date();

    // Update metadata extraction
    if (role === 'assistant') {
        extractMetadata(session, content);
    }

    console.log(`[SessionManager] Added ${role} message to session (total: ${session.messages.length})`);
    return true;
}

/**
 * Get conversation history from session
 */
export function getConversationHistory(sessionKey) {
    const session = sessions.get(sessionKey);

    if (!session) {
        console.log(`[SessionManager] No session found for ${sessionKey}, returning empty history`);
        return [];
    }

    // Return messages in chat format
    return session.messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}

/**
 * Get session metadata (competitors, problem statements extracted)
 */
export function getSessionMetadata(sessionKey) {
    const session = sessions.get(sessionKey);
    return session ? session.metadata : { competitors: [], problemStatements: [], lastQuery: null };
}

/**
 * Clear session (user exit)
 */
export function clearSession(sessionKey) {
    if (sessions.has(sessionKey)) {
        console.log(`[SessionManager] Clearing session ${sessionKey}`);
        sessions.delete(sessionKey);
        return true;
    }
    return false;
}

/**
 * Clear all sessions for an idea (e.g., when idea is deleted)
 */
export function clearIdeaSessions(ideaId) {
    let count = 0;
    for (const [key, session] of sessions.entries()) {
        if (session.ideaId === ideaId) {
            sessions.delete(key);
            count++;
        }
    }
    console.log(`[SessionManager] Cleared ${count} sessions for idea ${ideaId}`);
    return count;
}

/**
 * Extract metadata from assistant responses
 * Identifies competitor names and problem statements for later reference
 */
function extractMetadata(session, content) {
    // Extract competitor names (look for patterns like "**CompanyName**" or "CompanyName -")
    const competitorPattern = /\*\*([A-Z][a-zA-Z\s&]+?)\*\*(?:\s*-|\s*:)/g;
    let match;
    const newCompetitors = [];

    while ((match = competitorPattern.exec(content)) !== null) {
        const competitorName = match[1].trim();
        if (competitorName.length > 2 && competitorName.length < 50) {
            newCompetitors.push(competitorName);
        }
    }

    if (newCompetitors.length > 0) {
        session.metadata.competitors = [
            ...new Set([...session.metadata.competitors, ...newCompetitors])
        ];
        console.log(`[SessionManager] Extracted ${newCompetitors.length} competitors (total: ${session.metadata.competitors.length})`);
    }

    // Extract problem statements (look for numbered lists with problem/opportunity keywords)
    const problemPattern = /(?:^|\n)\d+\.\s*\*\*(.+?)\*\*(?:\s*-|\s*:)(.+?)(?=\n\d+\.|\n\n|$)/gs;
    const newProblems = [];

    while ((match = problemPattern.exec(content)) !== null) {
        const title = match[1].trim();
        const description = match[2].trim().substring(0, 200);

        if (title.length > 10 && title.length < 150) {
            newProblems.push({
                title,
                description,
                extractedAt: new Date()
            });
        }
    }

    if (newProblems.length > 0) {
        session.metadata.problemStatements = [
            ...session.metadata.problemStatements,
            ...newProblems
        ];
        console.log(`[SessionManager] Extracted ${newProblems.length} problem statements (total: ${session.metadata.problemStatements.length})`);
    }
}

/**
 * Cleanup expired sessions
 */
function cleanupExpiredSessions() {
    const now = new Date();
    const expiryTime = SESSION_TTL_HOURS * 60 * 60 * 1000;
    let count = 0;

    for (const [key, session] of sessions.entries()) {
        const age = now - session.lastActivity;
        if (age > expiryTime) {
            sessions.delete(key);
            count++;
        }
    }

    if (count > 0) {
        console.log(`[SessionManager] Cleaned up ${count} expired sessions (total active: ${sessions.size})`);
    }
}

/**
 * Get session statistics (for debugging)
 */
export function getSessionStats() {
    return {
        totalSessions: sessions.size,
        sessions: Array.from(sessions.entries()).map(([key, session]) => ({
            key,
            ideaId: session.ideaId,
            messageCount: session.messages.length,
            competitorCount: session.metadata.competitors.length,
            problemStatementCount: session.metadata.problemStatements.length,
            age: Math.round((new Date() - session.createdAt) / 1000 / 60) + ' minutes',
            lastActivity: session.lastActivity
        }))
    };
}

// Start cleanup interval
setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);
console.log(`[SessionManager] Initialized with ${SESSION_TTL_HOURS}h TTL`);

export default {
    initializeSession,
    addMessage,
    getConversationHistory,
    getSessionMetadata,
    clearSession,
    clearIdeaSessions,
    getSessionStats
};
