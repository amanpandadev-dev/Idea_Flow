# Ollama Setup Guide for Market Chat

## Overview

Market Chat now uses **Llama 3.1** via **Ollama** for intelligent analysis instead of Google Gemini. This provides:
- ✅ Local processing (no API costs)
- ✅ Better privacy (data stays on-premise)
- ✅ Faster responses (no network latency)
- ✅ More control over model behavior

---

## Prerequisites

- Windows, macOS, or Linux
- At least 8GB RAM (16GB recommended for better performance)
- ~5GB disk space for models

---

## Installation Steps

### 1. Install Ollama

#### Windows
```bash
# Download and run the installer from:
https://ollama.ai/download/windows

# Or use winget:
winget install Ollama.Ollama
```

#### macOS
```bash
# Download and run the installer from:
https://ollama.ai/download/mac

# Or use Homebrew:
brew install ollama
```

#### Linux
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### 2. Start Ollama Service

```bash
# Start Ollama (runs in background)
ollama serve
```

**Note:** On Windows/Mac, Ollama usually starts automatically after installation.

### 3. Pull Required Models

```bash
# Pull Llama 3.1 for chat/analysis (required)
ollama pull llama3.1

# Pull embedding model for semantic search (required)
ollama pull nomic-embed-text
```

**Download sizes:**
- `llama3.1`: ~4.7GB
- `nomic-embed-text`: ~274MB

### 4. Verify Installation

```bash
# Check Ollama is running
ollama list

# You should see:
# NAME                    ID              SIZE      MODIFIED
# llama3.1:latest         ...             4.7 GB    ...
# nomic-embed-text:latest ...             274 MB    ...
```

---

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_REASONING_MODEL=llama3.1
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

**Default values:** If not specified, these defaults are used automatically.

---

## Testing

### 1. Test Ollama Connection

```bash
# Test with a simple prompt
ollama run llama3.1 "Hello, how are you?"
```

### 2. Test Market Chat

1. Start your application
2. Open Market Chat for any idea
3. Ask: "What are the competitors?"
4. Ask: "Analyze their strengths and weaknesses"
5. Verify you get intelligent analysis (not fallback response)

### 3. Check Logs

Look for these log messages:
```
[MarketChat] Handling GENERAL query via Llama 3.1
[MarketChat] Analysis request detected - extracting previous data
```

---

## Troubleshooting

### Issue: "Cannot connect to Ollama"

**Solution:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running, start it:
ollama serve
```

### Issue: "Model not found"

**Solution:**
```bash
# Pull the required models
ollama pull llama3.1
ollama pull nomic-embed-text
```

### Issue: Slow responses

**Possible causes:**
1. **CPU-only mode** - Ollama will use GPU if available (NVIDIA/AMD)
2. **Insufficient RAM** - Close other applications
3. **Large context** - Reduce conversation history length

**Check GPU usage:**
```bash
# NVIDIA
nvidia-smi

# AMD
rocm-smi
```

### Issue: High memory usage

**Solution:**
```bash
# Use smaller model variant
ollama pull llama3.1:8b  # Instead of default

# Update .env
OLLAMA_REASONING_MODEL=llama3.1:8b
```

---

## Performance Optimization

### 1. GPU Acceleration

**NVIDIA GPU:**
- Ollama automatically uses CUDA if available
- Ensure NVIDIA drivers are up to date

**AMD GPU:**
- Ollama supports ROCm on Linux
- Install ROCm drivers for acceleration

**Apple Silicon (M1/M2/M3):**
- Ollama automatically uses Metal
- No additional setup needed

### 2. Model Variants

Choose based on your hardware:

| Model | Size | RAM Required | Speed | Quality |
|-------|------|--------------|-------|---------|
| llama3.1:8b | 4.7GB | 8GB | Fast | Good |
| llama3.1:70b | 40GB | 64GB | Slow | Excellent |
| llama3.1 (default) | 4.7GB | 8GB | Fast | Good |

**Recommendation:** Use default `llama3.1` (8B variant) for best balance.

### 3. Context Window

Adjust in code if needed:
```javascript
const result = await generateChatCompletion(
    [systemMessage, userMessageObj],
    'llama3.1',
    {
        temperature: 0.7,
        num_predict: 800,  // Adjust this
        num_ctx: 4096      // Context window size
    }
);
```

---

## Advanced Configuration

### Custom Ollama Host

If running Ollama on a different machine:

```bash
# .env
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

### Multiple Models

Switch models for different use cases:

```javascript
// For analysis (better quality)
model: 'llama3.1:70b'

// For quick responses (faster)
model: 'llama3.1:8b'
```

### Model Parameters

Fine-tune generation:

```javascript
{
    temperature: 0.7,      // Creativity (0-1)
    top_p: 0.9,           // Nucleus sampling
    top_k: 40,            // Top-k sampling
    num_predict: 800,     // Max tokens
    repeat_penalty: 1.1,  // Avoid repetition
    seed: 42              // Reproducibility
}
```

---

## Monitoring

### Check Ollama Status

```bash
# List running models
ollama ps

# View model details
ollama show llama3.1

# Check logs
ollama logs
```

### Performance Metrics

Monitor in your application logs:
```
[MarketChat] Llama 3.1 response time: 3.2s
[MarketChat] Tokens generated: 456
[MarketChat] Tokens per second: 142
```

---

## Updating

### Update Ollama

```bash
# Windows
winget upgrade Ollama.Ollama

# macOS
brew upgrade ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh
```

### Update Models

```bash
# Pull latest version
ollama pull llama3.1
ollama pull nomic-embed-text
```

---

## Uninstallation

### Remove Ollama

```bash
# Windows
winget uninstall Ollama.Ollama

# macOS
brew uninstall ollama
rm -rf ~/.ollama

# Linux
sudo systemctl stop ollama
sudo systemctl disable ollama
sudo rm /usr/local/bin/ollama
rm -rf ~/.ollama
```

### Remove Models

```bash
# Remove specific model
ollama rm llama3.1

# Remove all models
rm -rf ~/.ollama/models
```

---

## FAQ

**Q: Do I need an API key?**
A: No! Ollama runs locally, no API keys needed.

**Q: Can I use Ollama and Gemini together?**
A: Yes, but Market Chat is configured to use Llama 3.1 by default. You can modify the code to switch between them.

**Q: How much does it cost?**
A: Free! Ollama is open-source and runs locally.

**Q: Is my data private?**
A: Yes! All processing happens on your machine. No data is sent to external servers.

**Q: Can I use a different model?**
A: Yes! Ollama supports many models. Update `OLLAMA_REASONING_MODEL` in `.env`.

**Q: What if Ollama is down?**
A: Market Chat will fall back to generic responses. Ensure Ollama is running for best results.

---

## Resources

- **Ollama Website:** https://ollama.ai
- **Ollama GitHub:** https://github.com/ollama/ollama
- **Model Library:** https://ollama.ai/library
- **Documentation:** https://github.com/ollama/ollama/blob/main/docs/api.md

---

## Support

If you encounter issues:

1. Check Ollama is running: `ollama list`
2. Verify models are installed: `ollama list`
3. Check application logs for errors
4. Restart Ollama: `ollama serve`
5. Consult Ollama documentation

---

## Summary

✅ Install Ollama
✅ Pull `llama3.1` and `nomic-embed-text`
✅ Start Ollama service
✅ Configure `.env` (optional)
✅ Test Market Chat analysis

**You're ready to use intelligent, local AI analysis in Market Chat!**
