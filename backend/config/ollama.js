// Enhanced Ollama client - Complete Gemini replacement
// Provides embeddings, chat, structured output, and retry logic

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
// Recommended models for Market Chat:
// - qwen2.5:3b (fastest, concise, good for business analysis)
// - phi3:mini (detailed, better reasoning, slightly slower)
const REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || 'qwen2.5:3b';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

/**
 * Make HTTP request to Ollama API with error handling
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
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      throw new Error(`Cannot connect to Ollama at ${OLLAMA_BASE_URL}. Is Ollama running? Start it with: ollama serve`);
    }
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
    console.error(`   Make sure Ollama is running on ${OLLAMA_BASE_URL}`);
    console.error('   Start Ollama with: ollama serve');
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
 * Generate embedding using Ollama
 * @param {string} text - Text to embed
 * @param {string} model - Model name (optional)
 * @returns {Promise<number[]>} Embedding vector (768-dimensional)
 */
export async function generateOllamaEmbedding(text, model = EMBEDDING_MODEL) {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty for embedding generation');
  }

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.embedding || !Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new Error('Invalid embedding response from Ollama');
    }

    return data.embedding;
  } catch (error) {
    console.error(`Ollama embedding failed:`, error.message);
    throw error;
  }
}

/**
 * Generate embedding with retry logic and exponential backoff
 * @param {string} text - Text to embed
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<number[]>} Embedding vector
 */
export async function generateOllamaEmbeddingWithRetry(text, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateOllamaEmbedding(text);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️  Ollama embedding attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        console.warn(`   Retrying in ${backoffMs}ms...`);

        await new Promise(resolve => setTimeout(resolve, backoffMs));
      } else {
        console.error(`❌ Ollama embedding failed after ${maxRetries} attempts`);
      }
    }
  }

  throw lastError;
}

/**
 * Batch embedding generation for efficiency
 * @param {string[]} texts - Array of texts to embed
 * @param {number} batchSize - Process in batches
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
export async function generateBatchEmbeddings(texts, batchSize = 10) {
  const embeddings = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchPromises = batch.map(text => generateOllamaEmbeddingWithRetry(text, 2));
    const batchResults = await Promise.all(batchPromises);
    embeddings.push(...batchResults);
    
    console.log(`   Processed ${Math.min(i + batchSize, texts.length)}/${texts.length} embeddings`);
  }
  
  return embeddings;
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
 * Generate text with retry logic
 * @param {string} prompt - Prompt text
 * @param {Object} options - Generation options
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<string>} Generated text
 */
export async function generateText(prompt, options = {}, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateCompletion(prompt, REASONING_MODEL, options);
      return result.response || result.text || '';
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️  Ollama text generation attempt ${attempt}/${maxRetries} failed`);
        console.warn(`   Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError;
}

/**
 * Generate structured JSON output using Llama with prompt engineering
 * Replaces Gemini's generateStructuredOutput
 * @param {string} prompt - Prompt requesting JSON output
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function generateStructuredJSON(prompt, options = {}) {
  const systemPrompt = `You are a JSON generator. You must return ONLY valid JSON with no markdown formatting, no code blocks, and no additional text. The response must be parseable by JSON.parse().`;
  
  const enhancedPrompt = `${systemPrompt}\n\n${prompt}\n\nRemember: Return ONLY the JSON object, nothing else.`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    const result = await generateChatCompletion(messages, REASONING_MODEL, {
      temperature: options.temperature ?? 0.3, // Lower temperature for structured output
      ...options
    });

    const responseText = result.message?.content || result.response || '';
    
    // Clean up response - remove markdown code blocks if present
    let cleanedText = responseText.trim();
    cleanedText = cleanedText.replace(/```json\n?/g, '');
    cleanedText = cleanedText.replace(/```\n?/g, '');
    cleanedText = cleanedText.trim();

    // Parse JSON
    const parsed = JSON.parse(cleanedText);
    return parsed;
  } catch (error) {
    console.error('Ollama structured JSON generation failed:', error.message);
    throw new Error(`Failed to generate structured JSON: ${error.message}`);
  }
}

/**
 * Check if Ollama is available (for compatibility with Gemini's isGeminiAvailable)
 * @returns {Promise<boolean>}
 */
export async function isOllamaAvailable() {
  return await checkOllamaHealth();
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
  generateOllamaEmbedding,
  generateOllamaEmbeddingWithRetry,
  generateBatchEmbeddings,
  generateCompletion,
  generateChatCompletion,
  generateText,
  generateStructuredJSON,
  isOllamaAvailable,
  getModelNames
};
