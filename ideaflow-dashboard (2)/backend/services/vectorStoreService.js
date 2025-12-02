import { getChromaClient } from '../config/chroma.js';

// Store active collections per session (cache)
const sessionCollections = new Map();

/**
 * Create ephemeral collection for a session
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Collection object
 */
export async function createEphemeralCollection(sessionId) {
    if (!sessionId) {
        throw new Error('Session ID is required');
    }

    const client = getChromaClient();

    try {
        // Delete existing collection if it exists
        if (client.hasCollection(sessionId)) {
            client.deleteCollection(sessionId);
        }

        // Create new collection
        const collection = client.createCollection(sessionId);
        sessionCollections.set(sessionId, collection);

        return collection;
    } catch (error) {
        console.error('Error creating ephemeral collection:', error.message);
        throw new Error(`Failed to create collection: ${error.message}`);
    }
}

/**
 * Get existing collection for a session
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Collection object or null
 */
export async function getEphemeralCollection(sessionId) {
    if (!sessionId) {
        return null;
    }

    const client = getChromaClient();

    if (client.hasCollection(sessionId)) {
        return client.getCollection(sessionId);
    }

    return null;
}

/**
 * Add documents to ephemeral collection
 * @param {string} sessionId - Session identifier
 * @param {string[]} documents - Array of text chunks
 * @param {number[][]} embeddings - Array of embedding vectors
 * @param {Object[]} metadatas - Array of metadata objects
 * @returns {Promise<void>}
 */
export async function addDocuments(sessionId, documents, embeddings, metadatas = []) {
    const client = getChromaClient();

    if (!client.hasCollection(sessionId)) {
        await createEphemeralCollection(sessionId);
    }

    if (documents.length !== embeddings.length) {
        throw new Error('Documents and embeddings arrays must have the same length');
    }

    try {
        client.addDocuments(sessionId, documents, embeddings, metadatas);
    } catch (error) {
        console.error('Error adding documents:', error.message);
        throw new Error(`Failed to add documents: ${error.message}`);
    }
}

/**
 * Query ephemeral collection for similar documents
 * @param {string} sessionId - Session identifier
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} topK - Number of results to return
 * @returns {Promise<Object>} Query results
 */
export async function queryCollection(sessionId, queryEmbedding, topK = 5) {
    const client = getChromaClient();

    if (!client.hasCollection(sessionId)) {
        return {
            documents: [],
            metadatas: [],
            distances: []
        };
    }

    try {
        const results = client.query(sessionId, queryEmbedding, topK);

        return {
            documents: results.documents || [],
            metadatas: results.metadatas || [],
            distances: results.distances || []
        };
    } catch (error) {
        console.error('Error querying collection:', error.message);
        throw new Error(`Failed to query collection: ${error.message}`);
    }
}

/**
 * Delete ephemeral collection
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteCollection(sessionId) {
    if (!sessionId) {
        return false;
    }

    const client = getChromaClient();

    try {
        const deleted = client.deleteCollection(sessionId);
        sessionCollections.delete(sessionId);
        return deleted;
    } catch (error) {
        console.error('Error deleting collection:', error.message);
        return false;
    }
}

/**
 * Get collection stats
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Collection statistics
 */
export async function getCollectionStats(sessionId) {
    const client = getChromaClient();

    if (!client.hasCollection(sessionId)) {
        return null;
    }

    try {
        return client.getStats(sessionId);
    } catch (error) {
        console.error('Error getting collection stats:', error.message);
        return null;
    }
}

export default {
    createEphemeralCollection,
    getEphemeralCollection,
    addDocuments,
    queryCollection,
    deleteCollection,
    getCollectionStats
};
