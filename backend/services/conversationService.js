/**
 * Conversation Service
 * Handles CRUD operations for agent conversation history
 */

import crypto from 'crypto';

class ConversationService {
    constructor(db) {
        if (!db) {
            throw new Error('Database connection is required');
        }
        this.db = db;
    }

    /**
     * Create a new conversation
     * @param {string} userId - User's employee ID
     * @param {Object} data - Conversation data
     * @returns {Promise<Object>} Created conversation
     */
    async createConversation(userId, data = {}) {
        const {
            title = 'New Conversation',
            tags = [],
            sessionId = null,
            documentContext = null,
            embeddingProvider = 'llama'
        } = data;

        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            const query = `
                INSERT INTO conversations (
                    user_id, title, tags, session_id, 
                    document_context, embedding_provider
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;

            const values = [
                userId,
                title,
                tags,
                sessionId,
                documentContext ? JSON.stringify(documentContext) : null,
                embeddingProvider
            ];

            const result = await client.query(query, values);
            await client.query('COMMIT');

            console.log(`[ConversationService] Created conversation ${result.rows[0].id} for user ${userId}`);
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ConversationService] Error creating conversation:', error.message);
            throw new Error(`Failed to create conversation: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get conversations for a user with pagination and filtering
     * @param {string} userId - User's employee ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Conversations and metadata
     */
    async getConversations(userId, options = {}) {
        const {
            limit = 50,
            offset = 0,
            tags = null,
            sortBy = 'created_at',
            order = 'DESC'
        } = options;

        try {
            // Build query with optional tag filtering
            let query = `
                SELECT 
                    id, user_id, title, tags, session_id,
                    document_context, embedding_provider,
                    created_at, updated_at, message_count
                FROM conversations
                WHERE user_id = $1
            `;

            const values = [userId];
            let paramIndex = 2;

            // Add tag filtering if provided
            if (tags && tags.length > 0) {
                query += ` AND tags && $${paramIndex}`;
                values.push(tags);
                paramIndex++;
            }

            // Add sorting
            const validSortFields = ['created_at', 'updated_at', 'title', 'message_count'];
            const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
            const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
            query += ` ORDER BY ${sortField} ${sortOrder}`;

            // Add pagination
            query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(limit, offset);

            // Execute query
            const result = await this.db.query(query, values);

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM conversations
                WHERE user_id = $1
                ${tags && tags.length > 0 ? 'AND tags && $2' : ''}
            `;
            const countValues = tags && tags.length > 0 ? [userId, tags] : [userId];
            const countResult = await this.db.query(countQuery, countValues);
            const total = parseInt(countResult.rows[0].total);

            // Get first message for each conversation
            const conversationsWithFirstMessage = await Promise.all(
                result.rows.map(async (conv) => {
                    const msgQuery = `
                        SELECT content
                        FROM conversation_messages
                        WHERE conversation_id = $1 AND role = 'user'
                        ORDER BY timestamp ASC
                        LIMIT 1
                    `;
                    const msgResult = await this.db.query(msgQuery, [conv.id]);
                    
                    return {
                        ...conv,
                        firstMessage: msgResult.rows[0]?.content || null
                    };
                })
            );

            console.log(`[ConversationService] Retrieved ${result.rows.length} conversations for user ${userId}`);

            return {
                conversations: conversationsWithFirstMessage,
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            };

        } catch (error) {
            console.error('[ConversationService] Error getting conversations:', error.message);
            throw new Error(`Failed to get conversations: ${error.message}`);
        }
    }

    /**
     * Get a specific conversation with all messages
     * @param {string} conversationId - Conversation UUID
     * @param {string} userId - User's employee ID
     * @returns {Promise<Object>} Conversation with messages
     */
    async getConversationById(conversationId, userId) {
        try {
            // Get conversation
            const convQuery = `
                SELECT *
                FROM conversations
                WHERE id = $1 AND user_id = $2
            `;
            const convResult = await this.db.query(convQuery, [conversationId, userId]);

            if (convResult.rows.length === 0) {
                throw new Error('Conversation not found or access denied');
            }

            const conversation = convResult.rows[0];

            // Get all messages
            const msgQuery = `
                SELECT id, role, content, metadata, timestamp
                FROM conversation_messages
                WHERE conversation_id = $1
                ORDER BY timestamp ASC
            `;
            const msgResult = await this.db.query(msgQuery, [conversationId]);

            console.log(`[ConversationService] Retrieved conversation ${conversationId} with ${msgResult.rows.length} messages`);

            return {
                ...conversation,
                messages: msgResult.rows
            };

        } catch (error) {
            console.error('[ConversationService] Error getting conversation:', error.message);
            throw error;
        }
    }

    /**
     * Update conversation metadata
     * @param {string} conversationId - Conversation UUID
     * @param {string} userId - User's employee ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated conversation
     */
    async updateConversation(conversationId, userId, updates) {
        const { title, tags } = updates;

        if (!title && !tags) {
            throw new Error('No valid fields to update');
        }

        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            // Verify ownership
            const checkQuery = 'SELECT id FROM conversations WHERE id = $1 AND user_id = $2';
            const checkResult = await client.query(checkQuery, [conversationId, userId]);

            if (checkResult.rows.length === 0) {
                throw new Error('Conversation not found or access denied');
            }

            // Build update query
            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            if (title !== undefined) {
                updateFields.push(`title = $${paramIndex}`);
                values.push(title);
                paramIndex++;
            }

            if (tags !== undefined) {
                updateFields.push(`tags = $${paramIndex}`);
                values.push(tags);
                paramIndex++;
            }

            values.push(conversationId, userId);

            const query = `
                UPDATE conversations
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
                RETURNING *
            `;

            const result = await client.query(query, values);
            await client.query('COMMIT');

            console.log(`[ConversationService] Updated conversation ${conversationId}`);
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ConversationService] Error updating conversation:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete a conversation and all its messages
     * @param {string} conversationId - Conversation UUID
     * @param {string} userId - User's employee ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteConversation(conversationId, userId) {
        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            // Verify ownership and delete
            const query = `
                DELETE FROM conversations
                WHERE id = $1 AND user_id = $2
                RETURNING id
            `;
            const result = await client.query(query, [conversationId, userId]);

            if (result.rows.length === 0) {
                throw new Error('Conversation not found or access denied');
            }

            await client.query('COMMIT');

            console.log(`[ConversationService] Deleted conversation ${conversationId}`);
            return true;

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ConversationService] Error deleting conversation:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Add a message to a conversation
     * @param {string} conversationId - Conversation UUID
     * @param {string} userId - User's employee ID
     * @param {Object} message - Message data
     * @returns {Promise<Object>} Created message
     */
    async addMessage(conversationId, userId, message) {
        const { role, content, metadata = null } = message;

        if (!role || !content) {
            throw new Error('Role and content are required');
        }

        if (!['user', 'agent'].includes(role)) {
            throw new Error('Role must be either "user" or "agent"');
        }

        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            // Verify conversation ownership
            const checkQuery = 'SELECT id FROM conversations WHERE id = $1 AND user_id = $2';
            const checkResult = await client.query(checkQuery, [conversationId, userId]);

            if (checkResult.rows.length === 0) {
                throw new Error('Conversation not found or access denied');
            }

            // Insert message (trigger will update message_count and updated_at)
            const insertQuery = `
                INSERT INTO conversation_messages (
                    conversation_id, role, content, metadata
                )
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;

            const values = [
                conversationId,
                role,
                content,
                metadata ? JSON.stringify(metadata) : null
            ];

            const result = await client.query(insertQuery, values);
            await client.query('COMMIT');

            console.log(`[ConversationService] Added ${role} message to conversation ${conversationId}`);
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ConversationService] Error adding message:', error.message);
            throw new Error(`Failed to add message: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get messages for a conversation
     * @param {string} conversationId - Conversation UUID
     * @param {string} userId - User's employee ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Messages
     */
    async getMessages(conversationId, userId, options = {}) {
        const { limit = 100, offset = 0 } = options;

        try {
            // Verify ownership
            const checkQuery = 'SELECT id FROM conversations WHERE id = $1 AND user_id = $2';
            const checkResult = await this.db.query(checkQuery, [conversationId, userId]);

            if (checkResult.rows.length === 0) {
                throw new Error('Conversation not found or access denied');
            }

            // Get messages
            const query = `
                SELECT id, role, content, metadata, timestamp
                FROM conversation_messages
                WHERE conversation_id = $1
                ORDER BY timestamp ASC
                LIMIT $2 OFFSET $3
            `;

            const result = await this.db.query(query, [conversationId, limit, offset]);

            return result.rows;

        } catch (error) {
            console.error('[ConversationService] Error getting messages:', error.message);
            throw error;
        }
    }

    /**
     * Search conversations by content
     * @param {string} userId - User's employee ID
     * @param {string} searchQuery - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async searchConversations(userId, searchQuery, options = {}) {
        const { limit = 20 } = options;

        if (!searchQuery || searchQuery.trim().length === 0) {
            throw new Error('Search query is required');
        }

        try {
            // Search in both conversation titles and message content
            const query = `
                SELECT DISTINCT ON (c.id)
                    c.id as conversation_id,
                    c.title,
                    c.tags,
                    c.created_at,
                    c.updated_at,
                    c.message_count,
                    m.id as message_id,
                    m.content as matched_message,
                    m.timestamp,
                    ts_rank(
                        to_tsvector('english', c.title || ' ' || m.content),
                        plainto_tsquery('english', $2)
                    ) as rank
                FROM conversations c
                LEFT JOIN conversation_messages m ON c.id = m.conversation_id
                WHERE c.user_id = $1
                AND (
                    to_tsvector('english', c.title) @@ plainto_tsquery('english', $2)
                    OR to_tsvector('english', m.content) @@ plainto_tsquery('english', $2)
                )
                ORDER BY c.id, rank DESC, m.timestamp DESC
                LIMIT $3
            `;

            const result = await this.db.query(query, [userId, searchQuery, limit]);

            // Highlight matched text in results
            const resultsWithHighlights = result.rows.map(row => {
                const highlightedMessage = this._highlightText(
                    row.matched_message || '',
                    searchQuery
                );

                return {
                    conversationId: row.conversation_id,
                    title: row.title,
                    tags: row.tags,
                    matchedMessage: highlightedMessage,
                    messageId: row.message_id,
                    timestamp: row.timestamp,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    messageCount: row.message_count,
                    rank: parseFloat(row.rank)
                };
            });

            console.log(`[ConversationService] Search for "${searchQuery}" returned ${result.rows.length} results`);

            return {
                results: resultsWithHighlights,
                total: result.rows.length,
                query: searchQuery
            };

        } catch (error) {
            console.error('[ConversationService] Error searching conversations:', error.message);
            throw new Error(`Failed to search conversations: ${error.message}`);
        }
    }

    /**
     * Highlight search terms in text
     * @param {string} text - Text to highlight
     * @param {string} query - Search query
     * @returns {string} Text with highlights
     * @private
     */
    _highlightText(text, query) {
        if (!text || !query) return text;

        const terms = query.toLowerCase().split(/\s+/);
        let highlighted = text;

        terms.forEach(term => {
            if (term.length < 2) return; // Skip very short terms

            const regex = new RegExp(`(${term})`, 'gi');
            highlighted = highlighted.replace(regex, '**$1**');
        });

        // Truncate to show context around matches
        const maxLength = 200;
        if (highlighted.length > maxLength) {
            const matchIndex = highlighted.toLowerCase().indexOf('**');
            if (matchIndex > -1) {
                const start = Math.max(0, matchIndex - 50);
                const end = Math.min(highlighted.length, matchIndex + 150);
                highlighted = (start > 0 ? '...' : '') + 
                             highlighted.substring(start, end) + 
                             (end < highlighted.length ? '...' : '');
            } else {
                highlighted = highlighted.substring(0, maxLength) + '...';
            }
        }

        return highlighted;
    }

    /**
     * Get conversation statistics for a user
     * @param {string} userId - User's employee ID
     * @returns {Promise<Object>} Statistics
     */
    async getStatistics(userId) {
        try {
            // Get basic stats
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_conversations,
                    SUM(message_count) as total_messages,
                    AVG(message_count) as avg_messages_per_conversation,
                    MIN(created_at) as first_conversation_date,
                    MAX(updated_at) as last_conversation_date
                FROM conversations
                WHERE user_id = $1
            `;

            const statsResult = await this.db.query(statsQuery, [userId]);
            const stats = statsResult.rows[0];

            // Get top tags
            const tagsQuery = `
                SELECT 
                    unnest(tags) as tag,
                    COUNT(*) as count
                FROM conversations
                WHERE user_id = $1 AND tags IS NOT NULL
                GROUP BY tag
                ORDER BY count DESC
                LIMIT 10
            `;

            const tagsResult = await this.db.query(tagsQuery, [userId]);

            console.log(`[ConversationService] Retrieved statistics for user ${userId}`);

            return {
                totalConversations: parseInt(stats.total_conversations) || 0,
                totalMessages: parseInt(stats.total_messages) || 0,
                averageMessagesPerConversation: parseFloat(stats.avg_messages_per_conversation) || 0,
                firstConversationDate: stats.first_conversation_date,
                lastConversationDate: stats.last_conversation_date,
                topTags: tagsResult.rows
            };

        } catch (error) {
            console.error('[ConversationService] Error getting statistics:', error.message);
            throw new Error(`Failed to get statistics: ${error.message}`);
        }
    }

    /**
     * Export a conversation in specified format
     * @param {string} conversationId - Conversation UUID
     * @param {string} userId - User's employee ID
     * @param {string} format - Export format ('json' or 'markdown')
     * @returns {Promise<string>} Formatted export string
     */
    async exportConversation(conversationId, userId, format = 'json') {
        try {
            // Get full conversation with messages
            const conversation = await this.getConversationById(conversationId, userId);

            if (format === 'markdown') {
                return this._exportAsMarkdown(conversation);
            } else {
                return this._exportAsJSON(conversation);
            }

        } catch (error) {
            console.error('[ConversationService] Error exporting conversation:', error.message);
            throw error;
        }
    }

    /**
     * Export conversation as JSON
     * @param {Object} conversation - Conversation with messages
     * @returns {string} JSON string
     * @private
     */
    _exportAsJSON(conversation) {
        const exportData = {
            id: conversation.id,
            title: conversation.title,
            tags: conversation.tags,
            userId: conversation.user_id,
            sessionId: conversation.session_id,
            documentContext: conversation.document_context,
            embeddingProvider: conversation.embedding_provider,
            createdAt: conversation.created_at,
            updatedAt: conversation.updated_at,
            messageCount: conversation.message_count,
            messages: conversation.messages.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                metadata: msg.metadata,
                timestamp: msg.timestamp
            })),
            exportedAt: new Date().toISOString()
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Export conversation as Markdown
     * @param {Object} conversation - Conversation with messages
     * @returns {string} Markdown string
     * @private
     */
    _exportAsMarkdown(conversation) {
        let markdown = `# ${conversation.title}\n\n`;
        
        // Metadata
        markdown += `**Created:** ${new Date(conversation.created_at).toLocaleString()}\n`;
        markdown += `**Last Updated:** ${new Date(conversation.updated_at).toLocaleString()}\n`;
        markdown += `**Messages:** ${conversation.message_count}\n`;
        
        if (conversation.tags && conversation.tags.length > 0) {
            markdown += `**Tags:** ${conversation.tags.join(', ')}\n`;
        }
        
        markdown += `\n---\n\n`;

        // Messages
        conversation.messages.forEach((msg, index) => {
            const timestamp = new Date(msg.timestamp).toLocaleString();
            const role = msg.role === 'user' ? '👤 User' : '🤖 Agent';
            
            markdown += `## ${role} - ${timestamp}\n\n`;
            markdown += `${msg.content}\n\n`;
            
            // Add metadata if present
            if (msg.metadata && Object.keys(msg.metadata).length > 0) {
                markdown += `<details>\n<summary>Metadata</summary>\n\n`;
                markdown += `\`\`\`json\n${JSON.stringify(msg.metadata, null, 2)}\n\`\`\`\n\n`;
                markdown += `</details>\n\n`;
            }
            
            if (index < conversation.messages.length - 1) {
                markdown += `---\n\n`;
            }
        });

        markdown += `\n---\n\n`;
        markdown += `*Exported on ${new Date().toLocaleString()}*\n`;

        return markdown;
    }

    /**
     * Generate a title from the first message
     * @param {string} firstMessage - First user message
     * @returns {string} Generated title
     */
    generateTitle(firstMessage) {
        if (!firstMessage || firstMessage.trim().length === 0) {
            return 'New Conversation';
        }

        // Clean the message
        let title = firstMessage.trim();

        // Remove common question words at the start for cleaner titles
        title = title.replace(/^(how|what|when|where|why|who|can|could|would|should|is|are|do|does)\s+/i, '');

        // Remove punctuation at the end
        title = title.replace(/[?.!]+$/, '');

        // Capitalize first letter
        title = title.charAt(0).toUpperCase() + title.slice(1);

        // Truncate to 50 characters
        if (title.length > 50) {
            title = title.substring(0, 47) + '...';
        }

        // If title is too short or empty after processing, use first 50 chars of original
        if (title.length < 3) {
            title = firstMessage.substring(0, 50);
            if (firstMessage.length > 50) {
                title += '...';
            }
        }

        return title;
    }
}

export default ConversationService;
