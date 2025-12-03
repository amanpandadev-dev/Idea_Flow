// Native Ollama client using Node.js fetch API (Node 18+)
// No external dependencies required

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || 'llama3.1';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

/**
 * Make HTTP request to Ollama API
 * @param {string} endpoint - API endpoint
 * @param {Object} body - Request body
 * @returns {Promise<Object>} Response data
 */
async function ollamaRequest(endpoint, body) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Ollama request failed (${endpoint}):`, error.message);
    throw error;
  }
}

/**
 * Health check for Ollama service
 * @returns {Promise<boolean>} True if Ollama is accessible
 */
export async function checkOllamaHealth() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Ollama connected successfully');
    console.log(`   Available models: ${data.models.map(m => m.name).join(', ')}`);
    return true;
  } catch (error) {
    console.error('❌ Ollama connection failed:', error.message);
    console.error('   Make sure Ollama is running on', OLLAMA_BASE_URL);
    return false;
  }
}

/**
 * Verify required models are available
 * @returns {Promise<{reasoning: boolean, embedding: boolean}>}
 */
export async function verifyModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await response.json();
    const modelNames = data.models.map(m => m.name);

    const hasReasoning = modelNames.some(name => name.includes(REASONING_MODEL));
    const hasEmbedding = modelNames.some(name => name.includes(EMBEDDING_MODEL));

    if (!hasReasoning) {
      console.warn(`⚠️  Reasoning model '${REASONING_MODEL}' not found. Run: ollama pull ${REASONING_MODEL}`);
    }

    if (!hasEmbedding) {
      console.warn(`⚠️  Embedding model '${EMBEDDING_MODEL}' not found. Run: ollama pull ${EMBEDDING_MODEL}`);
    }

    return { reasoning: hasReasoning, embedding: hasEmbedding };
  } catch (error) {
    console.error('Error verifying models:', error.message);
    return { reasoning: false, embedding: false };
  }
}

/**
 * Generate text completion
 * @param {string} prompt - Prompt text
 * @param {string} model - Model name (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Completion response
 */
export async function generateCompletion(prompt, model = REASONING_MODEL, options = {}) {
  const data = await ollamaRequest('/api/generate', {
    model,
    prompt,
    stream: false,
    ...options
  });

  return data;
}

/**
 * Generate chat completion
 * @param {Array} messages - Chat messages
 * @param {string} model - Model name (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Chat response
 */
export async function generateChatCompletion(messages, model = REASONING_MODEL, options = {}) {
  const data = await ollamaRequest('/api/chat', {
    model,
    messages,
    stream: false,
    ...options
  });

  return data;
}

/**
 * Get model names
 */
export function getModelNames() {
  return {
    reasoning: REASONING_MODEL,
    embedding: EMBEDDING_MODEL
  };
}

export default {
  checkOllamaHealth,
  verifyModels,
  generateCompletion,
  generateChatCompletion,
  getModelNames
};
