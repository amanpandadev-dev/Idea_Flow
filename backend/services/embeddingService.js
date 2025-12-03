import { getEmbeddingVector } from './embeddingProvider.js';

/**
 * Generate embedding for a single text using the configured provider.
 * @param {string} text - Text to embed.
 * @param {'gemini' | 'llama' | 'grok'} [provider] - The embedding provider to use.
 * @returns {Promise<number[]>} Embedding vector.
 */
export async function generateSingleEmbedding(text, provider) {
    if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
    }

    try {
        return await getEmbeddingVector(text, provider);
    } catch (error) {
        console.error('Error generating embedding:', error.message);
        throw new Error(`Failed to generate embedding: ${error.message}`);
    }
}

/**
 * Generate embeddings for multiple texts (batch processing).
 * @param {string[]} texts - Array of texts to embed.
 * @param {'gemini' | 'llama' | 'grok'} [provider] - The embedding provider to use.
 * @returns {Promise<number[][]>} Array of embedding vectors.
 */
export async function generateEmbeddings(texts, provider) {
    if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
    }

    const embeddings = [];

    // Process in batches
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchPromises = batch.map(text => generateSingleEmbedding(text, provider));

        try {
            const batchResults = await Promise.all(batchPromises);
            embeddings.push(...batchResults);
        } catch (error) {
            console.error(`Error processing batch ${i / batchSize + 1}:`, error.message);
            throw error;
        }
    }

    return embeddings;
}

/**
 * Generate embedding with retry logic.
 * @param {string} text - Text to embed.
 * @param {'gemini' | 'llama' | 'grok'} [provider] - The embedding provider to use.
 * @param {number} [maxRetries=3] - Maximum number of retries.
 * @returns {Promise<number[]>} Embedding vector.
 */
export async function generateEmbeddingWithRetry(text, provider, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await generateSingleEmbedding(text, provider);
        } catch (error) {
            lastError = error;
            console.warn(`Embedding attempt ${attempt} failed, retrying...`);

            // Exponential backoff
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }

    throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

export default {
    generateEmbedding: generateSingleEmbedding,
    generateEmbeddings,
    generateEmbeddingWithRetry
};

