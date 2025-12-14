/**
 * Session Context Manager - Progressive Narrowing Architecture with Conversation Scoping
 * 
 * Manages multi-turn conversation state with progressive result narrowing
 * Key concept: baseResults (immutable) → currentResults (mutable via filters)
 * 
 * NEW: Conversation-scoped context - contextStore[sessionId][conversationId]
 */

class ConversationContext {
    constructor(sessionId, conversationId) {
        this.sessionId = sessionId;
        this.conversationId = conversationId; // NEW: Conversation-specific ID
        this.createdAt = Date.now();
        this.lastUpdated = Date.now();

        // Progressive narrowing fields
        this.baseQuery = '';              // Original search query
        this.baseResults = [];            // Full result objects (immutable until reset)
        this.baseResultIds = [];          // IDs only
        this.currentResults = [];         // Filtered/refined results (mutable)
        this.currentResultIds = [];       // Current IDs
        this.previousCount = 0;           // Track count before last narrowing

        // Search state
        this.semanticQuery = '';
        this.filters = {
            technologies: [],
            domains: [],
            years: [],
            businessGroups: [],
            themes: []
        };

        // NEW: Track last action type for result context
        this.lastActionType = null; // 'base_search', 'refine', 'filter', 'reset'

        this.intentHistory = [];

        // Legacy field for backward compatibility
        this.cachedResults = [];
    }

    /**
     * Set base results from initial semantic search
     * This is the immutable reference set for the conversation
     */
    setBaseResults(query, results) {
        this.baseQuery = query;
        this.baseResults = results;
        this.baseResultIds = results.map(r => r.id || r.dbId);
        this.currentResults = [...results]; // Start with all
        this.currentResultIds = [...this.baseResultIds];
        this.semanticQuery = query;
        this.lastUpdated = Date.now();

        console.log(`[Session ${this.sessionId}] Set base results: ${this.baseResultIds.length} items`);
    }

    /**
     * Narrow current results using filter function
     * CRITICAL: Operates on CURRENT results, not base (for progressive narrowing)
     */
    narrowResults(filterFn) {
        this.previousCount = this.currentResultIds.length;  // Store before narrowing

        // SINGLE SOURCE OF TRUTH: Always narrow from CURRENT results
        this.currentResults = this.currentResults.filter(filterFn);
        this.currentResultIds = this.currentResults.map(r => r.id || r.dbId);
        this.lastUpdated = Date.now();

        const after = this.currentResultIds.length;
        console.log(`[Session ${this.sessionId}] Narrowed: ${this.previousCount} → ${after} (base: ${this.baseResultIds.length})`);

        return this.currentResults;
    }

    /**
     * Reset to base results (clear all filters)
     */
    resetToBase() {
        this.currentResults = [...this.baseResults];
        this.currentResultIds = [...this.baseResultIds];
        this.filters = {
            technologies: [],
            domains: [],
            years: [],
            businessGroups: [],
            themes: []
        };
        this.lastUpdated = Date.now();

        console.log(`[Session ${this.sessionId}] Reset to base: ${this.baseResultIds.length} results`);
    }

    /**
     * Get current results
     */
    getCurrentResults() {
        return this.currentResults;
    }

    /**
     * Get conversation state for reload
     */
    getConversationState() {
        return {
            conversationId: this.conversationId,
            baseQuery: this.baseQuery,
            currentQuery: this.semanticQuery,
            results: this.currentResults,
            filters: this.getFilterSummary(),
            metadata: {
                baseResultCount: this.baseResultIds.length,
                currentResultCount: this.currentResultIds.length,
                lastUpdated: this.lastUpdated
            }
        };
    }

    updateSemanticQuery(query) {
        this.semanticQuery = query;
        this.lastUpdated = Date.now();
    }

    addIntent(intent, message) {
        this.intentHistory.push({
            intent,
            message,
            timestamp: Date.now()
        });

        // Keep only last 10 intents
        if (this.intentHistory.length > 10) {
            this.intentHistory = this.intentHistory.slice(-10);
        }
    }

    addFilter(type, value) {
        if (!this.filters[type]) {
            this.filters[type] = [];
        }

        // Handle arrays
        const normalizedValue = Array.isArray(value) ? value : [value];

        normalizedValue.forEach(v => {
            if (!this.filters[type].includes(v)) {
                this.filters[type].push(v);
            }
        });

        this.lastUpdated = Date.now();

        console.log(`[Session ${this.sessionId}] ADDED filter: ${type} = ${JSON.stringify(value)}`);
    }

    /**
     * Replace all filters of a type (REPLACE action)
     */
    replaceFilters(type, value) {
        if (!this.filters[type]) {
            this.filters[type] = [];
        }

        // Replace entirely
        this.filters[type] = Array.isArray(value) ? value : [value];
        this.lastUpdated = Date.now();

        console.log(`[Session ${this.sessionId}] REPLACED filter: ${type} = [${this.filters[type].join(', ')}]`);
    }

    removeFilter(type, value) {
        if (this.filters[type]) {
            this.filters[type] = this.filters[type].filter(v => v !== value);
        }
        this.lastUpdated = Date.now();

        console.log(`[Session ${this.sessionId}] Removed filter: ${type} = ${value}`);
    }

    removeFilterType(type) {
        if (this.filters[type]) {
            this.filters[type] = [];
        }
        this.lastUpdated = Date.now();
    }

    resetFilters() {
        this.filters = {
            technologies: [],
            domains: [],
            years: [],
            businessGroups: [],
            themes: []
        };
        this.lastUpdated = Date.now();
    }

    getFilterSummary() {
        const summary = {};
        Object.keys(this.filters).forEach(key => {
            if (this.filters[key].length > 0) {
                summary[key] = this.filters[key];
            }
        });
        return summary;
    }

    // DEPRECATED - use setBaseResults/getCurrentResults instead
    cacheResults(results) {
        this.cachedResults = results;
        this.lastUpdated = Date.now();
    }

    isStale(maxAgeMs = 30 * 60 * 1000) {
        return (Date.now() - this.lastUpdated) > maxAgeMs;
    }
}

/**
 * Nested Context Storage
 * Structure: contextStore[sessionId][conversationId] = ConversationContext
 */
const contextStore = new Map(); // sessionId -> Map(conversationId -> context)

/**
 * Get or create conversation-scoped context
 */
export function getOrCreateContext(sessionId, conversationId) {
    // Generate conversationId if not provided (new chat)
    // MUST be valid UUID for PostgreSQL compatibility
    if (!conversationId) {
        conversationId = crypto.randomUUID();
        console.log(`[Context] Generated new conversationId: ${conversationId}`);
    }

    if (!contextStore.has(sessionId)) {
        contextStore.set(sessionId, new Map());
    }

    const sessionContexts = contextStore.get(sessionId);

    if (!sessionContexts.has(conversationId)) {
        const shortId = conversationId.substring(0, 20);
        console.log(`[Context] Creating new context for conversation: ${shortId}...`);
        sessionContexts.set(conversationId, new ConversationContext(sessionId, conversationId));
    }

    const context = sessionContexts.get(conversationId);
    context.lastUpdated = Date.now();

    return context;
}

/**
 * Check if context exists for conversation
 */
export function hasContext(sessionId, conversationId) {
    return contextStore.has(sessionId) &&
        contextStore.get(sessionId).has(conversationId);
}

/**
 * Get context if it exists
 */
export function getContext(sessionId, conversationId) {
    if (!hasContext(sessionId, conversationId)) {
        return null;
    }
    return contextStore.get(sessionId).get(conversationId);
}

/**
 * Clear context for specific conversation
 */
export function clearContext(sessionId, conversationId) {
    if (contextStore.has(sessionId)) {
        const sessionContexts = contextStore.get(sessionId);
        const deleted = sessionContexts.delete(conversationId);

        if (deleted) {
            console.log(`[Context] Cleared context for conversation: ${conversationId.substring(0, 12)}...`);
        }

        // Clean up empty session maps
        if (sessionContexts.size === 0) {
            contextStore.delete(sessionId);
        }
    }
}

/**
 * Clear all contexts for a session
 */
export function clearSession(sessionId) {
    const deleted = contextStore.delete(sessionId);
    if (deleted) {
        console.log(`[Context] Cleared all contexts for session: ${sessionId}`);
    }
}

/**
 * Get session stats
 */
export function getSessionStats(sessionId) {
    if (!contextStore.has(sessionId)) {
        return { conversationCount: 0, conversations: [] };
    }

    const sessionContexts = contextStore.get(sessionId);
    const conversations = [];

    sessionContexts.forEach((context, conversationId) => {
        conversations.push({
            conversationId,
            baseQuery: context.baseQuery,
            baseResultCount: context.baseResultIds.length,
            currentResultCount: context.currentResultIds.length,
            filterCount: Object.values(context.filters).flat().length,
            age: Date.now() - context.createdAt,
            lastUpdated: context.lastUpdated
        });
    });

    return {
        conversationCount: conversations.length,
        conversations
    };
}

/**
 * Backward compatibility: getOrCreateSession
 * Now just forwards to getOrCreateContext with auto-generated conversationId
 */
export function getOrCreateSession(sessionId) {
    // For backward compatibility, auto-generate conversationId if not provided
    const tempConversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return getOrCreateContext(sessionId, tempConversationId);
}

/**
 * Get context by conversationId (search across all sessions)
 */
export function getSessionByConversationId(conversationId) {
    for (const [sessionId, sessionContexts] of contextStore.entries()) {
        if (sessionContexts.has(conversationId)) {
            return sessionContexts.get(conversationId);
        }
    }
    return null;
}

/**
 * Clean up stale contexts
 */
export function cleanupStaleSessions() {
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, sessionContexts] of contextStore.entries()) {
        const staleConversations = [];

        for (const [conversationId, context] of sessionContexts.entries()) {
            if (now - context.lastUpdated > STALE_THRESHOLD) {
                staleConversations.push(conversationId);
            }
        }

        staleConversations.forEach(convId => {
            sessionContexts.delete(convId);
            cleanedCount++;
        });

        // Remove empty sessions
        if (sessionContexts.size === 0) {
            contextStore.delete(sessionId);
        }
    }

    if (cleanedCount > 0) {
        console.log(`[Context] Cleaned up ${cleanedCount} stale conversation contexts`);
    }
}

// Auto-cleanup every 10 minutes
setInterval(cleanupStaleSessions, 10 * 60 * 1000);

export default {
    getOrCreateContext,
    hasContext,
    getContext,
    clearContext,
    clearSession,
    getSessionStats,
    getOrCreateSession, // Backward compatibility
    getSessionByConversationId,
    cleanupStaleSessions,
    ConversationContext
};
