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

        // ENTERPRISE: In-memory indexes for O(1) refinement
        this.indexes = {
            byTechnology: new Map(),    // "Java" → Set([1, 5, 12])
            byYear: new Map(),          // 2024 → Set([1, 3, 8])
            byTheme: new Map(),         // "Agentic AI" → Set([2, 4, 9])
            byBusinessGroup: new Map(), // "BFSI" → Set([1, 6, 11])
            byDomain: new Map(),        // "Banking" → Set([1, 5, 10])
            byStatus: new Map()         // "Implemented" → Set([3, 7, 14])
        };
        this.indexBuildTime = 0;

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

        // ENTERPRISE: Build in-memory indexes for instant refinement
        this._buildIndexes(results);

        console.log(`[Session ${this.sessionId}] Set base results: ${this.baseResultIds.length} items`);
    }

    /**
     * Build in-memory indexes from base results
     * Enables O(1) metadata filtering (< 10ms)
     */
    _buildIndexes(results) {
        const start = Date.now();
        console.log(`[Indexes] Building for ${results.length} results...`);

        // Reset all indexes
        this.indexes = {
            byTechnology: new Map(),
            byYear: new Map(),
            byTheme: new Map(),
            byBusinessGroup: new Map(),
            byDomain: new Map(),
            byStatus: new Map()
        };

        results.forEach(result => {
            const meta = result.metadata || {};
            const id = result.id || result.metadata?.idea_id || result.dbId;

            if (!id) return; // Skip if no ID

            // Index by technology stack (comma-separated)
            if (meta.technologies) {
                const techs = meta.technologies.split(',').map(t => t.trim().toLowerCase());
                techs.forEach(tech => {
                    if (!this.indexes.byTechnology.has(tech)) {
                        this.indexes.byTechnology.set(tech, new Set());
                    }
                    this.indexes.byTechnology.get(tech).add(id);
                });
            }

            // Index by year (extract from created_at)
            if (meta.created_at) {
                const year = new Date(meta.created_at).getFullYear();
                if (!this.indexes.byYear.has(year)) {
                    this.indexes.byYear.set(year, new Set());
                }
                this.indexes.byYear.get(year).add(id);
            }

            /// Index by business group (DATABASE FIELD: business_group)
            if (meta.business_group || meta.businessGroup) {
                const bg = (meta.business_group || meta.businessGroup).toLowerCase();
                if (!this.indexes.byBusinessGroup.has(bg)) {
                    this.indexes.byBusinessGroup.set(bg, new Set());
                }
                this.indexes.byBusinessGroup.get(bg).add(id);
            }

            // Index by domain (USE business_group as domain)
            if (meta.business_group || meta.domain) {
                const domain = (meta.business_group || meta.domain).toLowerCase();
                if (!this.indexes.byDomain.has(domain)) {
                    this.indexes.byDomain.set(domain, new Set());
                }
                this.indexes.byDomain.get(domain).add(id);
            }
            // Index by theme (if available)
            if (meta.theme || meta.aiTheme) {
                const theme = (meta.theme || meta.aiTheme).toLowerCase();
                if (!this.indexes.byTheme.has(theme)) {
                    this.indexes.byTheme.set(theme, new Set());
                }
                this.indexes.byTheme.get(theme).add(id);
            }

            // Index by status
            if (meta.implementation_status || meta.status) {
                const status = (meta.implementation_status || meta.status).toLowerCase();
                if (!this.indexes.byStatus.has(status)) {
                    this.indexes.byStatus.set(status, new Set());
                }
                this.indexes.byStatus.get(status).add(id);
            }
        });

        this.indexBuildTime = Date.now() - start;
        console.log(`[Indexes] Built in ${this.indexBuildTime}ms:`);
        console.log(`  - Technology: ${this.indexes.byTechnology.size} values`);
        console.log(`  - Year: ${this.indexes.byYear.size} values`);
        console.log(`  - Business Group: ${this.indexes.byBusinessGroup.size} values`);
        console.log(`  - Domain: ${this.indexes.byDomain.size} values`);
    }

    /**
     * Refine results using in-memory indexes (O(1), <10ms)
     * @param {Object} metadata - Extracted metadata filters
     * @returns {Array} Refined results
     */
    refineByMetadata(metadata) {
        const start = Date.now();
        let resultIds = null;

        console.log(`[Index Refine] Filters:`, metadata);

        // Intersect all matching index sets
        if (metadata.technology) {
            const tech = metadata.technology.toLowerCase();
            resultIds = this.indexes.byTechnology.get(tech) || new Set();
            console.log(`  - Technology "${metadata.technology}": ${resultIds.size} results`);
        }

        if (metadata.year) {
            const yearSet = this.indexes.byYear.get(metadata.year) || new Set();
            console.log(`  - Year ${metadata.year}: ${yearSet.size} results`);
            resultIds = resultIds
                ? new Set([...resultIds].filter(id => yearSet.has(id)))
                : yearSet;
        }

        if (metadata.businessGroup) {
            const bg = metadata.businessGroup.toLowerCase();
            const bgSet = this.indexes.byBusinessGroup.get(bg) || new Set();
            console.log(`  - Business Group "${metadata.businessGroup}": ${bgSet.size} results`);
            resultIds = resultIds
                ? new Set([...resultIds].filter(id => bgSet.has(id)))
                : bgSet;
        }

        if (metadata.domain) {
            const domain = metadata.domain.toLowerCase();
            const domainSet = this.indexes.byDomain.get(domain) || new Set();
            console.log(`  - Domain "${metadata.domain}": ${domainSet.size} results`);
            resultIds = resultIds
                ? new Set([...resultIds].filter(id => domainSet.has(id)))
                : domainSet;
        }

        if (metadata.aiTheme) {
            const theme = metadata.aiTheme.toLowerCase();
            const themeSet = this.indexes.byTheme.get(theme) || new Set();
            console.log(`  - AI Theme "${metadata.aiTheme}": ${themeSet.size} results`);
            resultIds = resultIds
                ? new Set([...resultIds].filter(id => themeSet.has(id)))
                : themeSet;
        }

        if (metadata.status) {
            const status = metadata.status.toLowerCase();
            const statusSet = this.indexes.byStatus.get(status) || new Set();
            console.log(`  - Status "${metadata.status}": ${statusSet.size} results`);
            resultIds = resultIds
                ? new Set([...resultIds].filter(id => statusSet.has(id)))
                : statusSet;
        }

        // Convert IDs back to result objects
        const idSet = resultIds || new Set();
        const refined = this.currentResults.filter(r => {
            const id = r.id || r.metadata?.idea_id || r.dbId;
            return idSet.has(id);
        });

        const refineTime = Date.now() - start;
        console.log(`[Index Refine] ${this.currentResults.length} → ${refined.length} in ${refineTime}ms ${refineTime < 10 ? '✅' : '⚠️'}`);

        this.previousCount = this.currentResults.length;
        this.currentResults = refined;
        this.currentResultIds = refined.map(r => r.id || r.metadata?.idea_id || r.dbId);

        return refined;
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
