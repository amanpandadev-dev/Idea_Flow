/**
 * Vector Operations Utility Module
 * Provides mathematical operations for embedding vectors
 * Used for conversation embedding accumulation in ProSearch
 */

/**
 * Add two vectors element-wise
 * @param {number[]} v1 - First vector
 * @param {number[]} v2 - Second vector
 * @returns {number[]} Sum of vectors
 */
export function addVectors(v1, v2) {
    if (v1.length !== v2.length) {
        throw new Error(`Vector dimension mismatch: ${v1.length} vs ${v2.length}`);
    }
    return v1.map((val, i) => val + v2[i]);
}

/**
 * Multiply vector by scalar
 * @param {number[]} vector - Input vector
 * @param {number} scalar - Scalar multiplier
 * @returns {number[]} Scaled vector
 */
export function scaleVector(vector, scalar) {
    return vector.map(val => val * scalar);
}

/**
 * Normalize vector to unit length
 * @param {number[]} vector - Input vector
 * @returns {number[]} Normalized vector
 */
export function normalizeVector(vector) {
    const magnitude = Math.sqrt(
        vector.reduce((sum, val) => sum + val * val, 0)
    );
    
    if (magnitude === 0) {
        return vector; // Avoid division by zero
    }
    
    return vector.map(val => val / magnitude);
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} v1 - First vector
 * @param {number[]} v2 - Second vector
 * @returns {number} Similarity score between -1 and 1
 */
export function cosineSimilarity(v1, v2) {
    if (v1.length !== v2.length) {
        throw new Error(`Vector dimension mismatch: ${v1.length} vs ${v2.length}`);
    }
    
    const dotProduct = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
    const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
    
    if (mag1 === 0 || mag2 === 0) {
        return 0;
    }
    
    return dotProduct / (mag1 * mag2);
}

/**
 * Combine two embeddings with weighted average
 * @param {number[]} prevEmbedding - Previous conversation embedding
 * @param {number[]} newEmbedding - New message embedding
 * @param {number} prevWeight - Weight for previous (default 0.7)
 * @param {number} newWeight - Weight for new (default 0.3)
 * @returns {number[]} Combined and normalized embedding
 */
export function combineEmbeddings(prevEmbedding, newEmbedding, prevWeight = 0.7, newWeight = 0.3) {
    const scaled1 = scaleVector(prevEmbedding, prevWeight);
    const scaled2 = scaleVector(newEmbedding, newWeight);
    const combined = addVectors(scaled1, scaled2);
    return normalizeVector(combined);
}

/**
 * Calculate time-decay weight
 * @param {number} age - Age in milliseconds
 * @param {number} lambda - Decay rate (default 0.0001)
 * @returns {number} Weight between 0 and 1
 */
export function timeDecayWeight(age, lambda = 0.0001) {
    return Math.exp(-lambda * age);
}

export default {
    addVectors,
    scaleVector,
    normalizeVector,
    cosineSimilarity,
    combineEmbeddings,
    timeDecayWeight
};
