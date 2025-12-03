// Persistent vector store using file-based storage
// No external ChromaDB server required

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage path for persistent data
const STORAGE_PATH = path.join(__dirname, '../../chroma_data');
const COLLECTIONS_FILE = path.join(STORAGE_PATH, 'collections.json');

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Persistent vector store with file-based storage
 */
class PersistentVectorStore {
    constructor() {
        this.collections = new Map();
        this.ensureStorageDir();
        this.loadFromDisk();
    }

    ensureStorageDir() {
        if (!fs.existsSync(STORAGE_PATH)) {
            fs.mkdirSync(STORAGE_PATH, { recursive: true });
            console.log(`✅ Created storage directory: ${STORAGE_PATH}`);
        }
    }

    loadFromDisk() {
        try {
            if (fs.existsSync(COLLECTIONS_FILE)) {
                const data = fs.readFileSync(COLLECTIONS_FILE, 'utf8');
                const collections = JSON.parse(data);

                // Restore collections from saved data
                for (const [name, collectionData] of Object.entries(collections)) {
                    this.collections.set(name, collectionData);
                }

                const totalDocs = Array.from(this.collections.values())
                    .reduce((sum, col) => sum + col.documents.length, 0);

                console.log(`✅ Loaded ${this.collections.size} collections with ${totalDocs} documents from disk`);
            } else {
                console.log('📁 No existing collections found, starting fresh');
            }
        } catch (error) {
            console.error('⚠️  Failed to load collections from disk:', error.message);
        }
    }

    saveToDisk() {
        try {
            const collectionsObj = {};
            for (const [name, data] of this.collections.entries()) {
                collectionsObj[name] = data;
            }

            fs.writeFileSync(COLLECTIONS_FILE, JSON.stringify(collectionsObj, null, 2));
            console.log(`💾 Saved ${this.collections.size} collections to disk`);
        } catch (error) {
            console.error('⚠️  Failed to save collections to disk:', error.message);
        }
    }

    async getOrCreateCollection(options) {
        const name = options.name;

        if (!this.collections.has(name)) {
            this.collections.set(name, {
                name,
                documents: [],
                embeddings: [],
                metadatas: [],
                ids: [],
                createdAt: new Date().toISOString()
            });
            console.log(`✅ Created collection: ${name}`);
        }

        const collection = this.collections.get(name);
        const self = this;

        return {
            name,

            add: async function (options) {
                const { ids, embeddings, metadatas = [], documents = [] } = options;

                collection.documents.push(...documents);
                collection.embeddings.push(...embeddings);
                collection.metadatas.push(...metadatas);
                collection.ids.push(...ids);

                console.log(`✅ Added ${documents.length} documents to collection ${name}`);

                // Save to disk after adding
                self.saveToDisk();
            },

            query: async function (options) {
                const { queryEmbeddings, nResults = 5 } = options;

                if (!queryEmbeddings || queryEmbeddings.length === 0) {
                    throw new Error('queryEmbeddings is required');
                }

                const queryEmbedding = queryEmbeddings[0];

                if (collection.embeddings.length === 0) {
                    return {
                        ids: [[]],
                        distances: [[]],
                        metadatas: [[]],
                        documents: [[]]
                    };
                }

                // Calculate similarities
                const results = collection.embeddings.map((embedding, index) => ({
                    index,
                    similarity: cosineSimilarity(queryEmbedding, embedding),
                    distance: 1 - cosineSimilarity(queryEmbedding, embedding)
                }));

                // Sort by similarity and take top K
                const topResults = results
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, nResults);

                return {
                    ids: [topResults.map(r => collection.ids[r.index])],
                    distances: [topResults.map(r => r.distance)],
                    metadatas: [topResults.map(r => collection.metadatas[r.index])],
                    documents: [topResults.map(r => collection.documents[r.index])]
                };
            },

            count: async function () {
                return collection.documents.length;
            }
        };
    }

    async getCollection(options) {
        const name = options.name;
        if (!this.collections.has(name)) {
            throw new Error(`Collection ${name} does not exist`);
        }
        return this.getOrCreateCollection(options);
    }

    async heartbeat() {
        // Simulate heartbeat for compatibility
        return true;
    }

    // Additional methods for compatibility with vectorStoreService
    hasCollection(name) {
        return this.collections.has(name);
    }

    createCollection(name) {
        if (this.collections.has(name)) {
            console.warn(`Collection ${name} already exists`);
            return this.collections.get(name);
        }

        const collection = {
            name,
            documents: [],
            embeddings: [],
            metadatas: [],
            ids: [],
            createdAt: new Date().toISOString()
        };

        this.collections.set(name, collection);
        console.log(`✅ Created collection: ${name}`);
        this.saveToDisk();
        return collection;
    }

    deleteCollection(name) {
        const existed = this.collections.has(name);
        this.collections.delete(name);

        if (existed) {
            console.log(`✅ Deleted collection: ${name}`);
            this.saveToDisk();
        }

        return existed;
    }

    getStats(name) {
        const collection = this.collections.get(name);

        if (!collection) {
            return null;
        }

        return {
            sessionId: name,
            documentCount: collection.documents.length,
            createdAt: collection.createdAt,
            totalSize: collection.documents.reduce((sum, doc) => sum + doc.length, 0)
        };
    }

    addDocuments(name, documents, embeddings, metadatas = []) {
        let collection = this.collections.get(name);

        if (!collection) {
            collection = this.createCollection(name);
        }

        if (documents.length !== embeddings.length) {
            throw new Error('Documents and embeddings must have same length');
        }

        // Generate IDs
        const startIndex = collection.documents.length;
        const ids = documents.map((_, i) => `doc_${name}_${startIndex + i}_${Date.now()}`);

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

        console.log(`✅ Added ${documents.length} documents to collection ${name}`);
        this.saveToDisk();
    }

    query(name, queryEmbedding, topK = 5) {
        const collection = this.collections.get(name);

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

        // Sort by similarity and take top K
        const topResults = results
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

        return {
            documents: topResults.map(r => collection.documents[r.index]),
            metadatas: topResults.map(r => collection.metadatas[r.index]),
            distances: topResults.map(r => r.distance),
            ids: topResults.map(r => collection.ids[r.index])
        };
    }
}

// Singleton instance
let vectorStore = null;

/**
 * Initialize persistent vector store
 */
export async function initChromaDB() {
    if (!vectorStore) {
        vectorStore = new PersistentVectorStore();
        console.log(`✅ Persistent vector store initialized at: ${STORAGE_PATH}`);
    }
    return vectorStore;
}

/**
 * Get vector store instance
 */
export function getChromaClient() {
    if (!vectorStore) {
        throw new Error('Vector store not initialized. Call initChromaDB() first.');
    }
    return vectorStore;
}

/**
 * Health check
 */
export async function checkChromaHealth() {
    try {
        if (!vectorStore) {
            await initChromaDB();
        }
        return true;
    } catch (error) {
        console.error('Vector store health check failed:', error.message);
        return false;
    }
}

export default { initChromaDB, getChromaClient, checkChromaHealth };
