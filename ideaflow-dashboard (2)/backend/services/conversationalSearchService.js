/**
 * Conversational Search Service
 * Manages chat-based search with context preservation and encrypted history
 */

import crypto from 'crypto';

// In-memory conversation store (session-based)
const conversationStore = new Map();

// Encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || crypto.randomBytes(32);

/**
 * Encrypt chat message for storage
 */
function encryptMessage(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    };
}

/**
 * Decrypt chat message
 */
function decryptMessage(encryptedData) {
    const decipher = crypto.createDecipheriv(
        ENCRYPTION_ALGORITHM,
        ENCRYPTION_KEY,
        Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Initialize conversation for a session
 */
export function initConversation(sessionId, userId) {
    if (!conversationStore.has(sessionId)) {
        conversationStore.set(sessionId, {
            sessionId,
            userId,
            messages: [],
            context: {
                keywords: [],
                filters: {},
                lastResults: [],
                searchHistory: []
            },
            createdAt: new Date().toISOString()
        });
        console.log(`[ConversationalSearch] Initialized conversation for session ${sessionId}`);
    }
    return conversationStore.get(sessionId);
}

/**
 * Add message to conversation (encrypted)
 */
export function addMessage(sessionId, role, content, metadata = {}) {
    const conversation = conversationStore.get(sessionId);
    if (!conversation) {
        throw new Error('Conversation not initialized');
    }

    const encryptedContent = encryptMessage(content);

    const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role, // 'user' or 'assistant'
        content: encryptedContent,
        metadata,
        timestamp: new Date().toISOString()
    };

    conversation.messages.push(message);
    return message;
}

/**
 * Get conversation history (decrypted)
 */
export function getConversationHistory(sessionId, limit = 50) {
    const conversation = conversationStore.get(sessionId);
    if (!conversation) {
        return [];
    }

    return conversation.messages
        .slice(-limit)
        .map(msg => ({
            ...msg,
            content: decryptMessage(msg.content)
        }));
}

/**
 * Update conversation context
 */
export function updateContext(sessionId, updates) {
    const conversation = conversationStore.get(sessionId);
    if (!conversation) {
        throw new Error('Conversation not initialized');
    }

    conversation.context = {
        ...conversation.context,
        ...updates,
        updatedAt: new Date().toISOString()
    };

    return conversation.context;
}

/**
 * Get current context
 */
export function getContext(sessionId) {
    const conversation = conversationStore.get(sessionId);
    return conversation ? conversation.context : null;
}

/**
 * Generate AI suggestions based on context
 */
export function generateSuggestions(context, results) {
    const suggestions = [];

    // Suggest refinements based on current results
    if (results.length > 50) {
        suggestions.push("Try filtering by business group or domain to narrow results");
        suggestions.push("Show only latest ideas from 2024");
    }

    // Suggest exploring related topics
    if (context.keywords && context.keywords.length > 0) {
        const keyword = context.keywords[0];
        suggestions.push(`Find ideas similar to ${keyword}`);
        suggestions.push(`Show ${keyword} projects with high impact scores`);
    }

    // Suggest temporal filters
    if (!context.filters.year) {
        suggestions.push("Filter by year (e.g., 'from 2024')");
    }

    // Suggest tech stack filters
    if (!context.filters.techStack) {
        suggestions.push("Filter by technology (e.g., 'React projects')");
    }

    // Suggest sorting
    if (!context.filters.sortBy) {
        suggestions.push("Sort by latest or highest impact");
    }

    return suggestions.slice(0, 4); // Return top 4 suggestions
}

/**
 * Build search query from conversation context
 */
export function buildSearchFromContext(newQuery, context) {
    // Combine new query with existing context
    const combinedKeywords = [
        ...context.keywords,
        ...newQuery.split(' ').filter(w => w.length > 2)
    ];

    return {
        query: newQuery,
        keywords: [...new Set(combinedKeywords)],
        filters: context.filters,
        previousResults: context.lastResults
    };
}

/**
 * Clear conversation (for logout/reset)
 */
export function clearConversation(sessionId) {
    conversationStore.delete(sessionId);
    console.log(`[ConversationalSearch] Cleared conversation for session ${sessionId}`);
}

/**
 * Get conversation stats
 */
export function getConversationStats(sessionId) {
    const conversation = conversationStore.get(sessionId);
    if (!conversation) {
        return null;
    }

    return {
        messageCount: conversation.messages.length,
        searchCount: conversation.context.searchHistory.length,
        activeFilters: Object.keys(conversation.context.filters).length,
        createdAt: conversation.createdAt
    };
}

export default {
    initConversation,
    addMessage,
    getConversationHistory,
    updateContext,
    getContext,
    generateSuggestions,
    buildSearchFromContext,
    clearConversation,
    getConversationStats
};
