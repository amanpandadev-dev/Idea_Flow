# Gemini 1.5 Flash Integration Guide

## Overview

This document describes the Google Gemini 1.5 Flash integration for the IdeaFlow platform. Gemini provides:

- **Text Embeddings**: Using `text-embedding-004` model for semantic search
- **Text Generation**: Using `gemini-1.5-flash` model for AI-powered features
- **Structured Output**: JSON generation for theme extraction and question generation
- **Automatic Fallback**: Falls back to Ollama when Gemini is unavailable

## Architecture

### Components

1. **Gemini Configuration** (`backend/config/gemini.js`)
   - Client initialization and management
   - Embedding generation with retry logic
   - Text generation and structured output
   - Health checks and availability monitoring

2. **Embedding Provider** (`backend/services/embeddingProvider.js`)
   - Multi-provider support (Gemini, Ollama, Grok)
   - Automatic fallback mechanism
   - Provider selection and routing

3. **Embedding Service** (`backend/services/embeddingService.js`)
   - High-level embedding API
   - Batch processing
   - Retry logic wrapper

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Google Gemini API Key
API_KEY=your-google-api-key-here

# Embedding Provider (gemini, llama, or grok)
EMBEDDING_PROVIDER=gemini
```

### Getting a Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key to your `.env` file

## Usage

### Basic Embedding Generation

```javascript
import { generateSingleEmbedding } from './services/embeddingService.js';

// Generate embedding using configured provider
const embedding = await generateSingleEmbedding("Your text here");

// Generate embedding with specific provider
const geminiEmbedding = await generateSingleEmbedding("Your text here", 'gemini');
```

### Batch Embedding Generation

```javascript
import { generateEmbeddings } from './services/embeddingService.js';

const texts = [
  "First text",
  "Second text",
  "Third text"
];

// Processes in batches of 10
const embeddings = await generateEmbeddings(texts, 'gemini');
```

### Embedding with Retry

```javascript
import { generateEmbeddingWithRetry } from './services/embeddingService.js';

// Automatically retries up to 3 times with exponential backoff
const embedding = await generateEmbeddingWithRetry("Your text here", 'gemini', 3);
```

### Direct Gemini API Access

```javascript
import { 
  generateGeminiEmbedding,
  generateText,
  generateStructuredOutput 
} from './config/gemini.js';

// Generate embedding
const embedding = await generateGeminiEmbedding("Your text");

// Generate text
const text = await generateText("Your prompt here");

// Generate structured JSON
const json = await generateStructuredOutput("Generate a list of topics", {
  maxOutputTokens: 500
});
```

## Features

### 1. Retry Logic with Exponential Backoff

When rate limits are hit or transient errors occur, the system automatically retries:

- **Attempt 1**: Immediate
- **Attempt 2**: Wait 2 seconds
- **Attempt 3**: Wait 4 seconds
- **Attempt 4**: Wait 8 seconds (if maxRetries > 3)

```javascript
// Configured in backend/config/gemini.js
export async function generateGeminiEmbeddingWithRetry(text, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateGeminiEmbedding(text);
    } catch (error) {
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
}
```

### 2. Automatic Fallback to Ollama

If Gemini is unavailable or fails, the system automatically falls back to Ollama:

```javascript
// Configured in backend/services/embeddingProvider.js
case 'gemini':
  try {
    if (!isGeminiAvailable()) {
      console.warn('⚠️  Gemini not available, falling back to Ollama...');
      return generateOllamaEmbedding(text);
    }
    return await generateGeminiEmbeddingWithRetry(text);
  } catch (error) {
    console.warn('⚠️  Gemini embedding failed, falling back to Ollama...');
    return generateOllamaEmbedding(text);
  }
```

### 3. Health Monitoring

Check Gemini availability:

```javascript
import { checkGeminiHealth, isGeminiAvailable } from './config/gemini.js';

// Quick availability check
if (isGeminiAvailable()) {
  console.log('Gemini is ready');
}

// Full health check (makes test API call)
const healthy = await checkGeminiHealth();
```

## Error Handling

### Common Errors

1. **API Key Missing**
   ```
   ⚠️  API_KEY not found in environment variables
   ```
   **Solution**: Add `API_KEY` to your `.env` file

2. **API Key Expired**
   ```
   API key expired. Please renew the API key.
   ```
   **Solution**: Generate a new API key from Google AI Studio

3. **Rate Limit Exceeded**
   ```
   429 Too Many Requests
   ```
   **Solution**: Retry logic handles this automatically, or wait before retrying

4. **Quota Exceeded**
   ```
   Quota exceeded for quota metric
   ```
   **Solution**: Wait for quota reset or upgrade your API plan

### Error Recovery

The system implements multiple layers of error recovery:

1. **Retry Logic**: Automatic retries with exponential backoff
2. **Fallback Provider**: Falls back to Ollama if Gemini fails
3. **Graceful Degradation**: Continues operation with reduced functionality

## Testing

### Run Integration Tests

```bash
# Test Gemini integration
node backend/tests/gemini_integration_test.js

# Test fallback behavior
node backend/tests/fallback_test.js

# Test all embedding providers
node backend/tests/embedding_test.js
```

### Test Output

Successful test output:
```
✅ Google Gemini 1.5 Flash initialized successfully
✅ Success! Generated embedding in 234ms
   Dimension: 768
   Preview: [0.1234, -0.5678, 0.9012, ...]
```

## Performance

### Embedding Dimensions

- **Gemini text-embedding-004**: 768 dimensions
- **Ollama nomic-embed-text**: 768 dimensions
- **Grok (OpenRouter)**: 384 dimensions

### Typical Response Times

- **Gemini Embedding**: 200-500ms per request
- **Ollama Embedding**: 50-150ms per request (local)
- **Batch Processing**: ~10 embeddings per second

### Rate Limits (Free Tier)

- **Requests per minute**: 15
- **Requests per day**: 1,500
- **Tokens per minute**: 1,000,000

## Best Practices

1. **Use Batch Processing**: Process multiple texts together for better throughput
2. **Cache Embeddings**: Store embeddings to avoid regenerating
3. **Monitor Quota**: Track API usage to stay within limits
4. **Handle Errors Gracefully**: Always implement fallback logic
5. **Use Retry Logic**: Let the system handle transient failures
6. **Test Fallback**: Ensure Ollama is available as backup

## Troubleshooting

### Gemini Not Initializing

**Check**:
1. API_KEY is set in `.env`
2. API key is valid and not expired
3. Network connectivity to Google APIs

**Debug**:
```javascript
import { initializeGemini, isGeminiAvailable } from './config/gemini.js';

const initialized = initializeGemini();
console.log('Initialized:', initialized);
console.log('Available:', isGeminiAvailable());
```

### Embeddings Failing

**Check**:
1. Text is not empty
2. API quota not exceeded
3. Network connectivity

**Debug**:
```javascript
try {
  const embedding = await generateGeminiEmbedding("test");
  console.log('Success:', embedding.length);
} catch (error) {
  console.error('Error:', error.message);
}
```

### Fallback Not Working

**Check**:
1. Ollama is running: `ollama serve`
2. Model is installed: `ollama pull nomic-embed-text`
3. OLLAMA_BASE_URL is correct in `.env`

## Migration Guide

### From Ollama-Only to Gemini

1. Add `API_KEY` to `.env`
2. Change `EMBEDDING_PROVIDER=gemini` in `.env`
3. Restart server
4. Existing embeddings remain compatible (same dimensions)

### From Grok to Gemini

1. Add `API_KEY` to `.env`
2. Change `EMBEDDING_PROVIDER=gemini` in `.env`
3. **Important**: Clear existing embeddings (different dimensions)
4. Re-index all documents and ideas

## API Reference

### Gemini Configuration (`backend/config/gemini.js`)

#### `initializeGemini()`
Initialize Gemini client with API key from environment.

**Returns**: `boolean` - True if successful

#### `isGeminiAvailable()`
Check if Gemini is initialized and available.

**Returns**: `boolean`

#### `generateGeminiEmbedding(text)`
Generate embedding for text.

**Parameters**:
- `text` (string): Text to embed

**Returns**: `Promise<number[]>` - Embedding vector

#### `generateGeminiEmbeddingWithRetry(text, maxRetries)`
Generate embedding with retry logic.

**Parameters**:
- `text` (string): Text to embed
- `maxRetries` (number): Maximum retry attempts (default: 3)

**Returns**: `Promise<number[]>` - Embedding vector

#### `generateText(prompt, options)`
Generate text completion.

**Parameters**:
- `prompt` (string): Prompt text
- `options` (object): Generation options

**Returns**: `Promise<string>` - Generated text

#### `generateStructuredOutput(prompt, options)`
Generate structured JSON output.

**Parameters**:
- `prompt` (string): Prompt text
- `options` (object): Generation options

**Returns**: `Promise<object>` - Parsed JSON

#### `checkGeminiHealth()`
Perform health check.

**Returns**: `Promise<boolean>` - True if healthy

## Support

For issues or questions:
1. Check this documentation
2. Review error messages in console
3. Test with integration test scripts
4. Verify API key and configuration
5. Check Google AI Studio for API status

## References

- [Google AI Studio](https://makersuite.google.com/)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Text Embedding Guide](https://ai.google.dev/docs/embeddings_guide)
- [Rate Limits](https://ai.google.dev/pricing)
