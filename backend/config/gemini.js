// Google Gemini configuration and client wrapper (centralized model names + robust init)
// Provides embedding generation, text generation, and structured output capabilities

import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const API_KEY = process.env.API_KEY || null;

// Exported model names (single source of truth)
// Free tier compatible models
const GEMINI_EMBEDDING_MODEL = 'text-embedding-004';
const GEMINI_GENERATION_MODEL = 'gemini-2.5-flash-lite'; // Free tier: gemini-2.5-flash-lite

let genAI = null;
let isAvailable = false;

/**
 * Initialize Gemini client
 * @returns {boolean} True if initialization successful
 */
export function initializeGemini() {
  if (!API_KEY) {
    console.warn('⚠️  API_KEY not found in environment variables. Gemini features will be unavailable. Set API_KEY in .env or environment.');
    isAvailable = false;
    genAI = null;
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(API_KEY);
    isAvailable = true;
    console.log(`✅ Google Gemini initialized successfully (model: ${GEMINI_GENERATION_MODEL})`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Gemini client:', error?.message || error);
    isAvailable = false;
    genAI = null;
    return false;
  }
}

/**
 * Check if Gemini is available
 * @returns {boolean}
 */
export function isGeminiAvailable() {
  return isAvailable && genAI !== null;
}

/**
 * Return the configured model names (use across project)
 * @returns {Object} Model names
 */
export function getModelNames() {
  return {
    embedding: GEMINI_EMBEDDING_MODEL,
    generation: GEMINI_GENERATION_MODEL
  };
}

/**
 * Generate embedding using Gemini text-embedding-004 model
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
export async function generateGeminiEmbedding(text) {
  if (!isGeminiAvailable()) {
    throw new Error('Gemini is not available. Please check API_KEY configuration.');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_EMBEDDING_MODEL });
    const result = await model.embedContent(text);

    if (!result.embedding || !result.embedding.values) {
      throw new Error('Invalid embedding response from Gemini');
    }

    return result.embedding.values;
  } catch (error) {
    console.error('Gemini embedding generation failed:', error.message);
    throw new Error(`Failed to generate Gemini embedding: ${error.message}`);
  }
}

/**
 * Generate embedding with retry logic and exponential backoff
 * @param {string} text - Text to embed
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<number[]>} Embedding vector
 */
export async function generateGeminiEmbeddingWithRetry(text, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateGeminiEmbedding(text);
    } catch (error) {
      lastError = error;

      // Check if it's a rate limit error
      const isRateLimit = error.message.includes('429') ||
        error.message.includes('rate limit') ||
        error.message.includes('quota');

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s...
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️  Gemini embedding attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        console.warn(`   Retrying in ${backoffMs}ms...`);

        await new Promise(resolve => setTimeout(resolve, backoffMs));
      } else {
        console.error(`❌ Gemini embedding failed after ${maxRetries} attempts`);
      }
    }
  }

  throw lastError;
}

/**
 * Generate textual completion using Gemini
 * @param {string} prompt - Prompt text
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Generated text
 */
export async function generateText(prompt, options = {}) {
  if (!isGeminiAvailable()) {
    throw new Error('Gemini is not available. Please set API_KEY and ensure initialization succeeded.');
  }

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_GENERATION_MODEL });
    const generationConfig = {
      maxOutputTokens: options.maxOutputTokens ?? 1000,
      temperature: options.temperature ?? 0.7,
      ...options
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig
    });

    return result.response.text();
  } catch (error) {
    console.error('Gemini text generation failed:', error?.message || error);
    throw error;
  }
}

/**
 * Generate structured JSON output using Gemini
 * @param {string} prompt - Prompt text
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function generateStructuredOutput(prompt, options = {}) {
  if (!isGeminiAvailable()) {
    throw new Error('Gemini is not available.');
  }

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_GENERATION_MODEL });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: options.maxOutputTokens ?? 1000,
        ...options
      }
    });

    const text = result.response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error('Gemini structured output failed:', error?.message || error);
    throw error;
  }
}

/**
 * Health check for Gemini service
 * @returns {Promise<boolean>} True if Gemini is accessible
 */
export async function checkGeminiHealth() {
  try {
    if (!isGeminiAvailable()) {
      console.error('❌ Gemini not initialized');
      return false;
    }
    // Small test to confirm embeddings work
    await generateGeminiEmbedding('health check');
    console.log('✅ Gemini health check passed');
    return true;
  } catch (error) {
    console.error('❌ Gemini health check failed:', error?.message || error);
    return false;
  }
}

// Initialize automatically on load (keeps existing behavior)
initializeGemini();

export default {
  initializeGemini,
  isGeminiAvailable,
  getModelNames,
  generateGeminiEmbedding,
  generateGeminiEmbeddingWithRetry,
  generateText,
  generateStructuredOutput,
  checkGeminiHealth,
  genAI // Export for direct access if needed
};
