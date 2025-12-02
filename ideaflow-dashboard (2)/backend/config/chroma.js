// In-memory vector store for ephemeral context
// No external dependencies - pure JavaScript implementation

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error('Vectors must have same length');
    }

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * In-memory vector store for session-scoped ephemeral collections
 */
class InMemoryVectorStore {
    constructor() {
        this.collections = new Map(); // sessionId -> collection data
    }

    /**
     * Create a new collection for a session
     * @param {string} sessionId - Session identifier
     * @returns {Object} Collection metadata
     */
    createCollection(sessionId) {
        if (!sessionId) {
            throw new Error('Session ID is required');
        }

        this.collections.set(sessionId, {
            sessionId,
            documents: [],
            embeddings: [],
            metadatas: [],
            ids: [],
            createdAt: new Date().toISOString()
        });

        console.log(`✅ Created in-memory collection for session: ${sessionId}`);

        return { sessionId, createdAt: new Date().toISOString() };
    }

    /**
     * Get collection for a session
     * @param {string} sessionId - Session identifier
     * @returns {Object|null} Collection data or null
     */
    getCollection(sessionId) {
        return this.collections.get(sessionId) || null;
    }

    /**
     * Check if collection exists
     * @param {string} sessionId - Session identifier
     * @returns {boolean}
     */
    hasCollection(sessionId) {
        return this.collections.has(sessionId);
    }

    /**
     * Add documents to collection
     * @param {string} sessionId - Session identifier
     * @param {string[]} documents - Text documents
     * @param {number[][]} embeddings - Embedding vectors
     * @param {Object[]} metadatas - Metadata objects
     * @returns {void}
     */
    addDocuments(sessionId, documents, embeddings, metadatas = []) {
        let collection = this.getCollection(sessionId);

        if (!collection) {
            this.createCollection(sessionId);
            collection = this.getCollection(sessionId);
        }

        if (documents.length !== embeddings.length) {
            throw new Error('Documents and embeddings must have same length');
        }

        // Generate IDs
        const startIndex = collection.documents.length;
        const ids = documents.map((_, i) => `doc_${sessionId}_${startIndex + i}_${Date.now()}`);

        // Prepare metadatas
        const finalMetadatas = metadatas.length === documents.length
            ? metadatas
            : documents.map((doc, index) => ({
                index: startIndex + index,
                length: doc.length,
                addedAt: new Date().toISOString()
            }));

        // Add to collection
        collection.documents.push(...documents);
        collection.embeddings.push(...embeddings);
        collection.metadatas.push(...finalMetadatas);
        collection.ids.push(...ids);

        console.log(`✅ Added ${documents.length} documents to collection ${sessionId}`);
    }

    /**
     * Query collection for similar documents
     * @param {string} sessionId - Session identifier
     * @param {number[]} queryEmbedding - Query vector
     * @param {number} topK - Number of results
     * @returns {Object} Query results
     */
    query(sessionId, queryEmbedding, topK = 5) {
        const collection = this.getCollection(sessionId);

        if (!collection || collection.embeddings.length === 0) {
            return {
                documents: [],
                metadatas: [],
                distances: [],
                ids: []
            };
        }

        // Calculate similarities
        const results = collection.embeddings.map((embedding, index) => ({
            index,
            similarity: cosineSimilarity(queryEmbedding, embedding),
            distance: 1 - cosineSimilarity(queryEmbedding, embedding)
        }));

        // Sort by similarity (descending) and take top K
        const topResults = results
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

        // Format results
        return {
            documents: topResults.map(r => collection.documents[r.index]),
            metadatas: topResults.map(r => collection.metadatas[r.index]),
            distances: topResults.map(r => r.distance),
            ids: topResults.map(r => collection.ids[r.index])
        };
    }

    /**
     * Delete collection
     * @param {string} sessionId - Session identifier
     * @returns {boolean} True if deleted
     */
    deleteCollection(sessionId) {
        const existed = this.collections.has(sessionId);
        this.collections.delete(sessionId);

        if (existed) {
            console.log(`✅ Deleted collection for session: ${sessionId}`);
        }

        return existed;
    }

    /**
     * Get collection count
     * @param {string} sessionId - Session identifier
     * @returns {number} Number of documents
     */
    count(sessionId) {
        const collection = this.getCollection(sessionId);
        return collection ? collection.documents.length : 0;
    }

    /**
     * Get collection stats
     * @param {string} sessionId - Session identifier
     * @returns {Object|null} Statistics
     */
    getStats(sessionId) {
        const collection = this.getCollection(sessionId);

        if (!collection) {
            return null;
        }

        return {
            sessionId,
            documentCount: collection.documents.length,
            createdAt: collection.createdAt,
            totalSize: collection.documents.reduce((sum, doc) => sum + doc.length, 0)
        };
    }

    /**
     * Clear all collections (for cleanup)
     */
    clearAll() {
        const count = this.collections.size;
        this.collections.clear();
        console.log(`🧹 Cleared ${count} collections from memory`);
    }
}

// Singleton instance
let vectorStore = null;

/**
 * Initialize vector store
 * @returns {InMemoryVectorStore}
 */
export function initChromaDB() {
    if (!vectorStore) {
        vectorStore = new InMemoryVectorStore();
        console.log('✅ In-memory vector store initialized successfully');
    }
    return vectorStore;
}

/**
 * Get vector store instance
 * @returns {InMemoryVectorStore}
 */
export function getChromaClient() {
    if (!vectorStore) {
        throw new Error('Vector store not initialized. Call initChromaDB() first.');
    }
    return vectorStore;
}

/**
 * Health check
 * @returns {Promise<boolean>}
 */
export async function checkChromaHealth() {
    try {
        if (!vectorStore) {
            initChromaDB();
        }
        return true;
    } catch (error) {
        console.error('Vector store health check failed:', error.message);
        return false;
    }
}

export default { initChromaDB, getChromaClient, checkChromaHealth };
