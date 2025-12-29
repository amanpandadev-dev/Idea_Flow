/**
 * Conversation Context Manager for ProSearch
 * 
 * Tracks cumulative constraints across multi-turn conversations
 * Enables context-aware semantic search with incremental filtering
 */

import { generateStructuredJSON } from '../config/ollama.js';

/**
 * Conversation Context - Stores cumulative search constraints
 */
class ConversationContext {
    constructor(userId, sessionId = null) {
        this.userId = userId;
        this.sessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Cumulative constraint sets (additive, never remove)
        this.constraints = {
            domains: new Set(),
            years: new Set(),
            technologies: new Set(),
            businessGroups: new Set(),
            themes: new Set()
        };

        this.queryHistory = [];  // Track all queries
        this.createdAt = Date.now();
        this.lastUpdate = Date.now();
    }

    /**
     * Add constraint (additive - never removes existing)
     */
    addConstraint(type, value) {
        if (this.constraints[type] && value) {
            if (Array.isArray(value)) {
                value.forEach(v => this.constraints[type].add(v));
            } else {
                this.constraints[type].add(value);
            }
            this.lastUpdate = Date.now();
        }
    }

    /**
     * Remove constraint (explicit user override)
     */
    removeConstraint(type, value) {
        if (this.constraints[type] && value) {
            this.constraints[type].delete(value);
            this.lastUpdate = Date.now();
        }
    }

    /**
     * Clear specific constraint type
     */
    clearConstraintType(type) {
        if (this.constraints[type]) {
            this.constraints[type].clear();
            this.lastUpdate = Date.now();
        }
    }

    /**
     * Reset all constraints
     */
    reset() {
        Object.keys(this.constraints).forEach(key => {
            this.constraints[key].clear();
        });
        this.queryHistory = [];
        this.lastUpdate = Date.now();
    }

    /**
     * Generate synthesized query for embedding
     * Combines current message with accumulated context
     * CLEAN VERSION - no 'or'/'using'/'in' artifacts
     */
    synthesizeQuery(currentUserMessage) {
        const parts = [currentUserMessage];

        // Just add terms, no prepositions that confuse embedding
        if (this.constraints.domains.size > 0) {
            parts.push(Array.from(this.constraints.domains).join(' '));
        }

        if (this.constraints.years.size > 0) {
            parts.push(Array.from(this.constraints.years).join(' '));
        }

        if (this.constraints.technologies.size > 0) {
            parts.push(Array.from(this.constraints.technologies).join(' '));
        }

        if (this.constraints.businessGroups.size > 0) {
            parts.push(Array.from(this.constraints.businessGroups).join(' '));
        }

        if (this.constraints.themes.size > 0) {
            parts.push(Array.from(this.constraints.themes).join(' '));
        }

        // Clean result: "Python ideas Banking Finance React Angular"
        // (No confusing 'or', 'using', 'in' words)
        return parts.join(' ');
    }

    /**
     * Get metadata filters for ChromaDB/PostgreSQL
     */
    getMetadataFilters() {
        return {
            domain: Array.from(this.constraints.domains),
            year: Array.from(this.constraints.years),
            technologies: Array.from(this.constraints.technologies),
            businessGroup: Array.from(this.constraints.businessGroups),
            themes: Array.from(this.constraints.themes)
        };
    }

    /**
     * Add query to history
     */
    addQuery(query, results = null) {
        this.queryHistory.push({
            query,
            timestamp: Date.now(),
            resultCount: results?.length || 0
        });
        this.lastUpdate = Date.now();
    }

    /**
     * Check if context is stale (30 min timeout)
     */
    isStale(timeoutMs = 30 * 60 * 1000) {
        return (Date.now() - this.lastUpdate) > timeoutMs;
    }

    /**
     * Serialize for storage
     */
    toJSON() {
        return {
            userId: this.userId,
            sessionId: this.sessionId,
            constraints: {
                domains: Array.from(this.constraints.domains),
                years: Array.from(this.constraints.years),
                technologies: Array.from(this.constraints.technologies),
                businessGroups: Array.from(this.constraints.businessGroups),
                themes: Array.from(this.constraints.themes)
            },
            queryHistory: this.queryHistory,
            createdAt: this.createdAt,
            lastUpdate: this.lastUpdate
        };
    }

    /**
     * Deserialize from storage
     */
    static fromJSON(data) {
        const context = new ConversationContext(data.userId, data.sessionId);
        context.constraints.domains = new Set(data.constraints.domains || []);
        context.constraints.years = new Set(data.constraints.years || []);
        context.constraints.technologies = new Set(data.constraints.technologies || []);
        context.constraints.businessGroups = new Set(data.constraints.businessGroups || []);
        context.constraints.themes = new Set(data.constraints.themes || []);
        context.queryHistory = data.queryHistory || [];
        context.createdAt = data.createdAt;
        context.lastUpdate = data.lastUpdate;
        return context;
    }
}

/**
 * Context Manager - Manages all conversation contexts
 * ✅ FIXED: Now keys by conversationId for proper isolation
 */
class ConversationContextManager {
    constructor() {
        this.contexts = new Map();  // conversationId → ConversationContext (NOT userId!)
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);  // Cleanup every 5 min
    }

    /**
     * Get or create context for conversation
     * ✅ CRITICAL: Use conversationId, not userId!
     */
    getContext(conversationId, userId = null) {
        if (!conversationId) {
            throw new Error('[ContextManager] conversationId is required!');
        }

        if (!this.contexts.has(conversationId)) {
            this.contexts.set(conversationId, new ConversationContext(userId || 'anonymous', conversationId));
            console.log(`[ContextManager] ✅ Created NEW context for conversation ${conversationId}`);
        }

        const context = this.contexts.get(conversationId);

        // Reset if stale
        if (context.isStale()) {
            console.log(`[ContextManager] Context for conversation ${conversationId} is stale, resetting`);
            context.reset();
        }

        return context;
    }

    /**
     * Reset context for conversation
     */
    resetContext(conversationId) {
        if (this.contexts.has(conversationId)) {
            this.contexts.get(conversationId).reset();
            console.log(`[ContextManager] Reset context for conversation ${conversationId}`);
        }
    }

    /**
     * Extract constraints from user message using Llama NLP
     */
    async extractConstraints(userMessage, existingContext) {
        try {
            const prompt = `You are a search query analyzer. Extract structured constraints from the user's message.

Previous context:
- Domains: ${Array.from(existingContext.constraints.domains).join(', ') || 'none'}
- Years: ${Array.from(existingContext.constraints.years).join(', ') || 'none'}
- Technologies: ${Array.from(existingContext.constraints.technologies).join(', ') || 'none'}

New user message: "${userMessage}"

Extract ONLY NEW constraints mentioned in this message. Return JSON:
{
  "domains": ["Banking", "Healthcare", ...],  // Business domains/industries
  "years": [2024, 2023, ...],  // Years mentioned
  "technologies": ["Python", "React", ...],  // Tech stack
  "businessGroups": ["Retail", "Insurance", ...],  // Business units
  "themes": ["AI", "Automation", ...]  // High-level themes
}

Return empty arrays if no new constraints found.`;

            const response = await generateStructuredJSON(prompt, {
                temperature: 0.2,
                maxOutputTokens: 200
            });

            // Update context with extracted constraints (additive)
            if (response.domains && Array.isArray(response.domains)) {
                response.domains.forEach(d => existingContext.addConstraint('domains', d));
            }
            if (response.years && Array.isArray(response.years)) {
                response.years.forEach(y => existingContext.addConstraint('years', parseInt(y)));
            }
            if (response.technologies && Array.isArray(response.technologies)) {
                response.technologies.forEach(t => existingContext.addConstraint('technologies', t));
            }
            if (response.businessGroups && Array.isArray(response.businessGroups)) {
                response.businessGroups.forEach(bg => existingContext.addConstraint('businessGroups', bg));
            }
            if (response.themes && Array.isArray(response.themes)) {
                response.themes.forEach(th => existingContext.addConstraint('themes', th));
            }

            console.log(`[ContextManager] Extracted constraints:`, response);
            return existingContext;

        } catch (error) {
            console.warn('[ContextManager] Failed to extract constraints:', error.message);
            return existingContext;  // Return unchanged on error
        }
    }

    /**
     * Cleanup stale contexts
     */
    cleanup() {
        let removed = 0;
        for (const [conversationId, context] of this.contexts.entries()) {
            if (context.isStale(60 * 60 * 1000)) {  // 1 hour timeout
                this.contexts.delete(conversationId);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[ContextManager] Cleaned up ${removed} stale contexts`);
        }
    }

    /**
     * Shutdown cleanup
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// Singleton instance
const contextManager = new ConversationContextManager();

export { ConversationContext, ConversationContextManager, contextManager };
