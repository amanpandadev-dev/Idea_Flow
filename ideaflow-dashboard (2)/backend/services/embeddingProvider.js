
import 'dotenv/config';

// --- Ollama Embedding Generation ---

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

async function generateOllamaEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_EMBEDDING_MODEL,
        prompt: text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error(`Ollama embedding failed:`, error.message);
    throw error;
  }
}

// --- Grok/OpenRouter Embedding Generation ---

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_EMBEDDING_MODEL = 'sentence-transformers/all-minilm-l6-v2';
const OPENROUTER_MAX_RETRIES = 2;

async function generateGrokEmbedding(text, retryCount = 0) {
  if (!OPENROUTER_API_KEY) {
    const errorMsg = 'OPENROUTER_API_KEY is not set in environment variables. Please add it to your .env file.';
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3001", // Required by OpenRouter API
        "X-Title": "IdeaFlow Dashboard", // Optional, for identification
      },
      body: JSON.stringify({
        model: OPENROUTER_EMBEDDING_MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      let errorMsg = `OpenRouter API error: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json();
        if (errorBody.error?.message) {
          errorMsg += ` - ${errorBody.error.message}`;
        }
      } catch (parseError) {
        // If error body is not JSON, use status text
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error('Invalid response structure from OpenRouter: missing data array');
    }
    
    const embedding = data.data[0].embedding;
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid response structure from OpenRouter: missing or invalid embedding vector');
    }
    
    return embedding;
  } catch (error) {
    // Retry logic
    if (retryCount < OPENROUTER_MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
      console.warn(`⚠️  OpenRouter embedding attempt ${retryCount + 1} failed: ${error.message}`);
      console.warn(`   Retrying in ${waitTime}ms... (${retryCount + 1}/${OPENROUTER_MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return generateGrokEmbedding(text, retryCount + 1);
    }
    
    // All retries exhausted
    console.error(`❌ OpenRouter embedding failed after ${OPENROUTER_MAX_RETRIES + 1} attempts:`, error.message);
    throw error;
  }
}

/**
 * Factory function to get an embedding vector from the configured provider.
 * @param {string} text - The text to embed.
 * @param {'llama' | 'grok'} [provider] - The embedding provider to use. Defaults to EMBEDDING_PROVIDER from .env.
 * @returns {Promise<number[]>} The embedding vector.
 */
export async function getEmbeddingVector(text, provider) {
  const selectedProvider = provider || process.env.EMBEDDING_PROVIDER || 'llama';

  console.log(`	-> Generating embedding for text snippet using [${selectedProvider}]...`);

  switch (selectedProvider) {
    case 'grok':
      return generateGrokEmbedding(text);
    case 'llama':
    default:
      return generateOllamaEmbedding(text);
  }
}
